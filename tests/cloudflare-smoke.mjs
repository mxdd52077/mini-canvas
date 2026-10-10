/** Run against a local Worker after build + local migrations + wrangler dev. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {WebSocket} from 'ws';
const base=process.env.TEST_BASE_URL||'http://localhost:3001';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname),'Smoke test creates disposable users: run only against a local Worker.');
async function request(path,{cookie,body,method=body===undefined?'GET':'POST',headers={}}={}){
  const response=await fetch(base+path,{method,headers:{origin:base,...(cookie?{cookie}:{}),...(body===undefined?{}:{'content-type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json().catch(()=>null);return {response,data};
}
async function register(name){const email=`${name}-${randomUUID()}@example.com`,password=randomUUID();const {response,data}=await request('/api/auth/register',{body:{email,password,name}});assert.equal(response.status,200,JSON.stringify(data));assert.match(response.headers.get('set-cookie'),/HttpOnly/i);return {cookie:response.headers.get('set-cookie').split(';')[0],user:data.user,email,password};}
const a=await register('owner'),b=await register('outsider');
const {response:login,data:loginData}=await request('/api/auth/login',{body:{email:a.email,password:a.password}});assert.equal(login.status,200,JSON.stringify(loginData));
let r=await request('/api/projects',{cookie:a.cookie,body:{name:'Cloudflare smoke test'}});assert.equal(r.response.status,201,JSON.stringify(r.data));const project=r.data.id;
r=await request(`/project/${project}`,{cookie:a.cookie});assert.equal(r.response.status,200);
r=await request('/api/projects',{cookie:b.cookie});assert.equal(r.response.status,200);assert.equal(r.data.projects.length,0);
r=await request(`/api/projects/${project}/scene`,{cookie:b.cookie});assert.equal(r.response.status,404);
r=await request(`/api/projects/${project}/scene`,{cookie:b.cookie,method:'PUT',body:{nodes:[],edges:[]}});assert.equal(r.response.status,404);
const node={id:randomUUID(),kind:'text',name:'Hello Cloudflare',content:'Saved to D1',x:20,y:30,width:200,height:60,rotation:0,fill:'#fff',stroke:'#000',visible:true,locked:false,version:1};
r=await request(`/api/projects/${project}/scene`,{cookie:a.cookie,method:'PUT',body:{nodes:[node],edges:[]}});assert.equal(r.response.status,200,JSON.stringify(r.data));
r=await request(`/api/projects/${project}/scene`,{cookie:a.cookie});assert.equal(r.data.scene.nodes[0].content,'Saved to D1');
r=await request(`/api/projects/${project}/history`,{cookie:a.cookie});assert.equal(r.response.status,200,JSON.stringify(r.data));assert.equal(r.data.history.length,1);assert.equal(r.data.history[0].author,'owner');
r=await request(`/api/projects/${project}/viewport`,{cookie:a.cookie,method:'PUT',body:{x:3,y:4,zoom:1.2}});assert.equal(r.response.status,200,JSON.stringify(r.data));
r=await request(`/api/projects/${project}/scene`,{cookie:a.cookie});assert.equal(r.data.viewport.zoom,1.2);
r=await request(`/api/projects/${project}/comments`,{cookie:a.cookie,body:{x:1,y:2,body:'Looks good'}});assert.equal(r.response.status,201,JSON.stringify(r.data));const comment=r.data.comment.id;
r=await request(`/api/projects/${project}/comments/${comment}/replies`,{cookie:a.cookie,body:{body:'Agreed'}});assert.equal(r.response.status,201,JSON.stringify(r.data));
r=await request(`/api/projects/${project}/comments`,{cookie:a.cookie});assert.equal(r.data.comments[0].replies.length,1);
r=await request('/api/backend/query',{cookie:b.cookie,body:{table:'project_members',action:'insert',values:{project_id:project,user_id:b.user.id,role:'owner'},columns:'*',filters:[],orders:[]}});assert.equal(r.response.status,403);
r=await request('/api/admin/models',{cookie:b.cookie});assert.equal(r.response.status,403);
const path=`${project}/uploads/${randomUUID()}.png`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
let upload=await fetch(base+'/api/backend/storage/'+path,{method:'PUT',headers:{cookie:a.cookie,origin:base,'content-type':'image/png'},body:png});assert.equal(upload.status,200,await upload.text());
upload=await fetch(base+'/api/backend/storage/'+path,{method:'PUT',headers:{cookie:b.cookie,origin:base,'content-type':'image/png'},body:png});assert.equal(upload.status,403);
r=await request('/api/backend/query',{cookie:a.cookie,body:{table:'assets',action:'insert',values:{project_id:project,owner_id:a.user.id,kind:'image',storage_path:path,mime_type:'image/png',byte_size:png.length,source:'upload'},columns:'id',filters:[],orders:[]}});assert.equal(r.response.status,200,JSON.stringify(r.data));
r=await request('/api/backend/storage/sign',{cookie:a.cookie,body:{path,expiresIn:3600}});assert.equal(r.response.status,200,JSON.stringify(r.data));const signed=r.data.signedUrl;
let download=await fetch(signed);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),png);
download=await fetch(signed,{headers:{range:'bytes=0-7'}});assert.equal(download.status,206);assert.equal((await download.arrayBuffer()).byteLength,8);
download=await fetch(signed.replace(/signature=./,'signature=x'));assert.equal(download.status,403);
async function connect(cookie){const ws=new WebSocket(base.replace(/^http/,'ws')+`/api/collaboration?project=${project}`,{headers:{cookie,origin:base}});const messages=[];ws.on('message',raw=>messages.push(JSON.parse(raw.toString())));await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});await until(()=>messages.find(m=>m.type==='ready'));return {ws,messages};}
async function until(fn){const deadline=Date.now()+5000;while(Date.now()<deadline){const value=fn();if(value)return value;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Timed out waiting for collaboration message');}
const c1=await connect(a.cookie),c2=await connect(a.cookie);const ready=c1.messages.find(m=>m.type==='ready');
c1.ws.send(JSON.stringify({type:'operation',operationId:randomUUID(),expectedVersion:ready.version,command:{action:'scene',nodes:[node],edges:[]}}));
const operation=await until(()=>c2.messages.find(m=>m.type==='operation'));assert.equal(operation.command.nodes[0].content,'Saved to D1');
c1.ws.close();c2.ws.close();
r=await request('/api/auth/logout',{cookie:a.cookie,body:{}});assert.equal(r.response.status,200);
r=await request('/api/projects',{cookie:a.cookie});assert.equal(r.response.status,401);
console.log('Cloudflare smoke: login, project isolation, snapshots, history, viewport, comments, R2 signed URLs/ranges, WebSocket collaboration, session revocation passed.');
