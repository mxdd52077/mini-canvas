import {DurableObject} from 'cloudflare:workers';
import handler from 'vinext/server/fetch-handler';
import {sessionUser,SESSION_COOKIE} from '../src/lib/backend/auth';
type Peer={user:string;name:string;selection:string[];token:string;project:string};
export class CanvasRoom extends DurableObject<Cloudflare.Env> {
  constructor(ctx:DurableObjectState,env:Cloudflare.Env){super(ctx,env);ctx.blockConcurrencyWhile(async()=>{ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY,version INTEGER NOT NULL)');ctx.storage.sql.exec('INSERT OR IGNORE INTO state VALUES(1,0)');});}
  private version(){return this.ctx.storage.sql.exec<{version:number}>('SELECT version FROM state WHERE id=1').one().version;}
  private peers(except?:WebSocket){return this.ctx.getWebSockets().filter(s=>s!==except);}
  private send(socket:WebSocket,data:unknown){try{socket.send(JSON.stringify(data));}catch{socket.close(1011,'connection unavailable');}}
  private broadcast(data:unknown,except?:WebSocket){for(const s of this.peers(except))this.send(s,data);}
  async fetch(request:Request){
    if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
    const data:Peer={user:request.headers.get('x-canvas-user')!,name:decodeURIComponent(request.headers.get('x-canvas-name')!),selection:[],token:request.headers.get('x-canvas-token')!,project:request.headers.get('x-canvas-project')!};
    const pair=new WebSocketPair();const client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server);server.serializeAttachment(data);
    const others=this.peers(server);
    this.send(server,{type:'ready',version:this.version(),peers:others.length});
    this.send(server,{type:'presence',event:'roster',users:others.map(s=>{const p=s.deserializeAttachment() as Peer;return {id:p.user,name:p.name,selection:p.selection};})});
    if(others.length)this.send(others[0],{type:'sync-request',from:data.user});
    this.broadcast({type:'presence',event:'join',user:{id:data.user,name:data.name}},server);
    return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(socket:WebSocket,raw:string|ArrayBuffer){
    const peer=socket.deserializeAttachment() as Peer;
    if(typeof raw!=='string'||raw.length>900000){socket.close(1009,'message too large');return;}
    try{
      const msg=JSON.parse(raw);
      const user=await sessionUser(this.env.DB,peer.token);
      const member=user?await this.env.DB.prepare('SELECT m.role FROM project_members m JOIN projects p ON p.id=m.project_id WHERE m.project_id=? AND m.user_id=? AND p.deleted_at IS NULL').bind(peer.project,user.id).first<{role:string}>():null;
      if(!user||!member){socket.close(1008,'authorization expired');return;}
      if(msg.type==='ping'){this.send(socket,{type:'pong',nonce:msg.nonce});return;}
      if(msg.type==='cursor'&&Number.isFinite(msg.x)&&Number.isFinite(msg.y)){this.broadcast({type:'cursor',x:msg.x,y:msg.y,user:peer.user,name:peer.name},socket);return;}
      if(msg.type==='selection'){peer.selection=Array.isArray(msg.nodes)?msg.nodes.filter((id:unknown)=>typeof id==='string').slice(0,1000):[];socket.serializeAttachment(peer);this.broadcast({type:'selection',nodes:peer.selection,user:peer.user,name:peer.name},socket);return;}
      if(msg.type==='comment'){
        // Comments are already persisted by authorized HTTP routes. Peers reload authoritative comments.
        this.broadcast({type:'comment-refresh'},socket);return;
      }
      if(msg.type==='sync-response'&&typeof msg.to==='string'&&Array.isArray(msg.nodes)&&Array.isArray(msg.edges)){
        if(member.role==='commenter')return;
        for(const target of this.peers(socket)){if((target.deserializeAttachment() as Peer).user===msg.to)this.send(target,{type:'sync-response',version:this.version(),nodes:msg.nodes,edges:msg.edges});}return;
      }
      if(msg.type==='operation'){
        if(member.role==='commenter'){this.send(socket,{type:'error',message:'无权编辑画布'});return;}
        const version=this.version();if(msg.expectedVersion!==version){this.send(socket,{type:'conflict',currentVersion:version,operationId:msg.operationId});return;}
        if(msg.command?.action!=='scene'||!Array.isArray(msg.command.nodes)||!Array.isArray(msg.command.edges))return;
        this.ctx.storage.sql.exec('UPDATE state SET version=version+1 WHERE id=1');
        this.broadcast({type:'operation',version:version+1,operationId:msg.operationId,command:{action:'scene',nodes:msg.command.nodes,edges:msg.command.edges},user:peer.user},socket);
        this.send(socket,{type:'ack',version:version+1,operationId:msg.operationId});
      }
    }catch{this.send(socket,{type:'error',message:'协作消息无效'});}
  }
  webSocketClose(socket:WebSocket){const peer=socket.deserializeAttachment() as Peer;if(!this.peers(socket).some(s=>(s.deserializeAttachment() as Peer).user===peer.user))this.broadcast({type:'presence',event:'leave',user:peer.user},socket);}
  webSocketError(socket:WebSocket){socket.close(1011,'connection failed');}
}
const worker = {
  async fetch(request:Request,env:Cloudflare.Env,ctx:ExecutionContext):Promise<Response>{
    if(new URL(request.url).pathname==='/api/collaboration'){
      const url=new URL(request.url);if(request.headers.get('origin')!==url.origin)return new Response('Invalid origin',{status:403});
      const token=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length+1);
      const user=await sessionUser(env.DB,token);if(!user)return new Response('Unauthorized',{status:401});
      const project=url.searchParams.get('project');if(!project||!/^[a-f0-9-]{36}$/i.test(project))return new Response('Invalid project',{status:400});
      const member=await env.DB.prepare('SELECT 1 FROM project_members m JOIN projects p ON p.id=m.project_id WHERE m.project_id=? AND m.user_id=? AND p.deleted_at IS NULL').bind(project,user.id).first();
      if(!member)return new Response('Forbidden',{status:403});
      const headers=new Headers(request.headers);headers.set('x-canvas-user',user.id);headers.set('x-canvas-name',encodeURIComponent(String(user.user_metadata.display_name||'成员')));headers.set('x-canvas-token',token!);headers.set('x-canvas-project',project);
      return env.CANVAS_ROOMS.getByName(project).fetch(new Request(request,{headers}));
    }
    return handler.fetch(request,env,ctx);
  },
};

export default worker;
