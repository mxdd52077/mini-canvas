import type {QuerySpec, Row, Result, User} from './types';
const tables:Record<string,string> = {
  profiles:'id email display_name role disabled_at created_at updated_at',
  projects:'id owner_id name thumbnail_path background version deleted_at created_at updated_at',
  project_members:'project_id user_id role created_at',
  project_invites:'id project_id email role token_hash expires_at accepted_at invited_by created_at',
  canvas_snapshots:'id project_id project_version payload created_by created_at',
  project_viewports:'user_id project_id x y zoom updated_at',
  comments:'id project_id object_id x y body color author_id resolved_at resolved_by created_at updated_at',
  comment_replies:'id comment_id body author_id created_at',
  assets:'id project_id owner_id kind storage_path mime_type byte_size width height duration_seconds source created_at',
  voice_profiles:'id user_id project_id project_name name voice_id source_model last_used_at created_at updated_at',
  provider_configs:'id slug name base_url adapter enabled created_at updated_at',
  model_configs:'id provider_id model_id display_name kind capabilities pricing enabled created_at updated_at',
  credit_accounts:'user_id balance',credit_ledger:'id user_id amount kind created_at',
  chat_sessions:'id project_id user_id title created_at updated_at',chat_messages:'id session_id role content created_at',
};
const jsonFields = new Set(['payload','content','capabilities','pricing']);
const protectedFields = new Set(['id','owner_id','user_id','project_id','session_id','comment_id','author_id','created_by','provider_id','created_at','invited_by','token_hash']);
const writableFields:Record<string,string> = {
  profiles:'display_name', projects:'name thumbnail_path background version deleted_at updated_at',
  project_members:'role',project_invites:'accepted_at',canvas_snapshots:'',project_viewports:'x y zoom updated_at',
  comments:'x y object_id body color resolved_at resolved_by updated_at',comment_replies:'body',assets:'',
  voice_profiles:'project_name name last_used_at updated_at',provider_configs:'enabled name base_url updated_at',
  model_configs:'model_id display_name kind capabilities pricing enabled updated_at',credit_accounts:'',credit_ledger:'',
  chat_sessions:'title updated_at',chat_messages:'',
};
function ident(table:string,column:string) {if(!tables[table]?.split(' ').includes(column))throw new Error('不支持的数据字段');return `"${column}"`;}
function uidLiteral(user:User|null) {if(!user||!/^[a-f0-9-]{36}$/i.test(user.id))throw new Error('请先登录');return `'${user.id}'`;}
export function rowPolicy(table:string, action:string, user:User|null, service=false) {
  if(service)return '1';
  const uid=uidLiteral(user),read=action==='select';
  const member=(project:string,roles?:string)=>`EXISTS (SELECT 1 FROM project_members m JOIN projects p ON p.id=m.project_id WHERE m.project_id=${project} AND m.user_id=${uid} AND p.deleted_at IS NULL${roles?` AND m.role IN (${roles})`:''})`;
  const edit=(p:string)=>member(p,"'owner','editor'"),own=(p:string)=>member(p,"'owner'");
  const admin=`EXISTS (SELECT 1 FROM profiles a WHERE a.id=${uid} AND a.role='admin' AND a.disabled_at IS NULL)`;
  switch(table){
    case 'profiles':return read?`(t.id=${uid} OR EXISTS (SELECT 1 FROM project_members m JOIN project_members n ON m.project_id=n.project_id WHERE m.user_id=${uid} AND n.user_id=t.id))`:`t.id=${uid}`;
    case 'projects':return read?member('t.id'):edit('t.id');
    case 'project_members':return read?member('t.project_id'):`(${own('t.project_id')} AND t.role<>'owner')`;
    case 'project_invites':return own('t.project_id');
    case 'canvas_snapshots':return read?member('t.project_id'):edit('t.project_id');
    case 'project_viewports':return `t.user_id=${uid} AND ${member('t.project_id')}`;
    case 'comments':return read?member('t.project_id'):`(${member('t.project_id')} AND (t.author_id=${uid} OR ${edit('t.project_id')}))`;
    case 'comment_replies':return `EXISTS (SELECT 1 FROM comments c WHERE c.id=t.comment_id AND ${member('c.project_id')}${read?'':` AND t.author_id=${uid}`})`;
    case 'assets':return read?member('t.project_id'):`t.owner_id=${uid} AND ${edit('t.project_id')}`;
    case 'voice_profiles':return `t.user_id=${uid}`;
    case 'provider_configs':return read?'1':admin;
    case 'model_configs':return read?`(t.enabled=1 OR ${admin})`:admin;
    case 'credit_accounts':case 'credit_ledger':return read?`t.user_id=${uid}`:'0';
    case 'chat_sessions':return `t.user_id=${uid} AND ${member('t.project_id')}`;
    case 'chat_messages':return `EXISTS (SELECT 1 FROM chat_sessions s WHERE s.id=t.session_id AND s.user_id=${uid} AND ${member('s.project_id')})`;
    default:throw new Error('不支持的数据表');
  }
}
function encode(value:unknown):string|number|null {if(value===undefined||value===null)return null;if(typeof value==='boolean')return value?1:0;if(typeof value==='object')return JSON.stringify(value);if(typeof value==='number'||typeof value==='string')return value;throw new Error('数据类型无效');}
function decode(row:Row):Row {for(const key of Object.keys(row)){if(jsonFields.has(key)||key==='profiles'||key==='provider_configs'){if(typeof row[key]==='string')row[key]=JSON.parse(row[key]);}if(key==='enabled')row[key]=Boolean(row[key]);}return row;}
export async function executeQuery(db:D1Database,user:User|null,spec:QuerySpec,service=false):Promise<Result<Row[]>> {
  try{
    const {table,action}=spec;
    if(!Object.hasOwn(tables,table))throw new Error('不支持的数据表');
    if(!['select','insert','update','upsert','delete'].includes(action))throw new Error('不支持的数据操作');
    const uid=service?'':uidLiteral(user);
    const args:(string|number|null)[]=[];
    const where=[rowPolicy(table,action,user,service)];
    for(const f of spec.filters){
      let col:string;
      if(f.column.startsWith('provider_configs.')&&table==='model_configs') col=`(SELECT p.${ident('provider_configs',f.column.split('.')[1])} FROM provider_configs p WHERE p.id=t.provider_id)`;
      else col=`t.${ident(table,f.column)}`;
      if(f.op==='in'){if(!Array.isArray(f.value)||f.value.length>500)throw new Error('筛选条件无效');where.push(f.value.length?`${col} IN (${f.value.map(()=>'?').join(',')})`:'0');args.push(...f.value.map(encode));}
      else if(f.op==='is'&&f.value===null)where.push(`${col} IS NULL`);
      else if(f.op==='eq'||f.op==='lt'){where.push(`${col}${f.op==='eq'?'=':'<'}?`);args.push(encode(f.value));}
      else throw new Error('筛选操作无效');
    }
    // The voice cleanup is the only OR filter used by the application; never accept SQL fragments.
    if(spec.or){const match=/^last_used_at\.lt\.([^,]+),and\(last_used_at\.is\.null,created_at\.lt\.([^,]+)\)$/.exec(spec.or);if(table!=='voice_profiles'||!match)throw new Error('筛选表达式无效');where.push('(t.last_used_at<? OR (t.last_used_at IS NULL AND t.created_at<?))');args.push(match[1],match[2]);}
    const condition=where.map(x=>`(${x})`).join(' AND ');
    const joins:string[]=[];
    const requested=spec.columns||'*';
    const projection=requested.replace(/(?:profiles|provider_configs)(?:![\w]+)?\([^)]*\)/g,full=>{
      if(full.startsWith('profiles')){const fk:Record<string,string>={project_members:'user_id',canvas_snapshots:'created_by',comments:'author_id',comment_replies:'author_id'};const key=fk[table];if(!key)throw new Error('关联无效');joins.push(`(SELECT json_object('email',p.email,'display_name',p.display_name) FROM profiles p WHERE p.id=t.${key}) AS profiles`);}
      else {if(table!=='model_configs')throw new Error('关联无效');joins.push(`(SELECT json_object('slug',p.slug,'name',p.name,'enabled',json(CASE WHEN p.enabled THEN 'true' ELSE 'false' END)) FROM provider_configs p WHERE p.id=t.provider_id) AS provider_configs`);}
      return '';
    }).split(',').filter(Boolean).map(c=>c==='*'?'t.*':`t.${ident(table,c)}`);
    if(!projection.length&&!joins.length)throw new Error('选择字段无效');
    if(action==='select'){
      const order=spec.orders.length?' ORDER BY '+spec.orders.map(o=>`t.${ident(table,o.column)} ${o.ascending?'ASC':'DESC'}`).join(','):'';
      const limit=Math.min(1000,Math.max(1,Math.floor(spec.limit??1000)));
      if(!Number.isFinite(limit))throw new Error('条数无效');
      const r=await db.prepare(`SELECT ${[...projection,...joins].join(',')} FROM "${table}" t WHERE ${condition}${order} LIMIT ${limit}`).bind(...args).all<Row>();
      return {data:r.results.map(decode),error:null};
    }
    if(action==='delete'){
      if(!service&&!['project_members','voice_profiles','assets','chat_sessions'].includes(table))throw new Error('此数据不可删除');
      const r=await db.prepare(`DELETE FROM "${table}" AS t WHERE ${condition} RETURNING *`).bind(...args).all<Row>();return {data:r.results.map(decode),error:null};
    }
    const values=Array.isArray(spec.values)?spec.values:[spec.values];
    if(!values.length||values.length>500||!values.every(v=>v&&typeof v==='object'))throw new Error('写入数据无效');
    if(action==='update'){
      const value=values[0]!;const keys=Object.keys(value);
      for(const k of keys){ident(table,k);if(!service&&(!writableFields[table].split(' ').includes(k)||protectedFields.has(k)))throw new Error('无权修改此字段');}
      const r=await db.prepare(`UPDATE "${table}" AS t SET ${keys.map(k=>`${ident(table,k)}=?`).join(',')} WHERE ${condition} RETURNING *`).bind(...keys.map(k=>encode(value[k])),...args).all<Row>();
      return {data:r.results.map(decode),error:null};
    }
    const statements:D1PreparedStatement[]=[];
    for(const input of values){
      const value={...input};
      if(tables[table].split(' ').includes('id')&&!value.id)value.id=crypto.randomUUID();
      const keys=Object.keys(value);keys.forEach(k=>ident(table,k));
      if(!service){
        if(table==='profiles'||table==='credit_accounts'||table==='credit_ledger'||table==='project_members')throw new Error('无权创建此记录');
        const ownerKey:Record<string,string>={projects:'owner_id',canvas_snapshots:'created_by',comments:'author_id',comment_replies:'author_id',assets:'owner_id',voice_profiles:'user_id',project_viewports:'user_id',chat_sessions:'user_id',project_invites:'invited_by'};
        if(ownerKey[table]&&value[ownerKey[table]]!==user?.id)throw new Error('记录归属无效');
        if(table==='assets'&&(typeof value.storage_path!=='string'||!value.storage_path.startsWith(`${value.project_id}/`)))throw new Error('素材路径无效');
        if(table==='voice_profiles'&&value.project_id){const m=await db.prepare("SELECT 1 FROM project_members WHERE project_id=? AND user_id=? AND role IN ('owner','editor')").bind(value.project_id,user!.id).first();if(!m)throw new Error('无权访问此项目');}
      }
      let policy=table==='projects'?`t.owner_id=${uid}`:rowPolicy(table,'insert',user,service);
      if(service)policy='1';
      // Check the proposed row through the same scope rule; omitted defaults never grant access.
      const candidate=tables[table].split(' ').map(k=>`${keys.includes(k)?'?':'NULL'} AS ${ident(table,k)}`).join(',');
      const candidateArgs=tables[table].split(' ').filter(k=>keys.includes(k)).map(k=>encode(value[k]));
      let sql=`INSERT INTO "${table}" (${keys.map(k=>ident(table,k)).join(',')}) SELECT ${keys.map(k=>`t.${ident(table,k)}`).join(',')} FROM (SELECT ${candidate}) t WHERE (${policy})`;
      if(action==='upsert'){
        const conflict=(spec.conflict||'id').split(',');conflict.forEach(k=>ident(table,k));
        const allowed:Record<string,string[]>={project_viewports:['user_id,project_id'],voice_profiles:['user_id,voice_id'],model_configs:['provider_id,model_id'],project_members:['project_id,user_id']};
        if(!allowed[table]?.includes(conflict.join(',')))throw new Error('不支持的合并条件');
        const updates=keys.filter(k=>!conflict.includes(k)&&k!=='id'&&(!protectedFields.has(k)||service));
        if(!service&&updates.some(k=>!writableFields[table].split(' ').includes(k)))throw new Error('合并字段无效');
        const existingPolicy=rowPolicy(table,'update',user,service).replaceAll('t.',`"${table}".`);
        sql+=` ON CONFLICT (${conflict.map(k=>ident(table,k)).join(',')}) DO UPDATE SET ${updates.map(k=>`${ident(table,k)}=excluded.${ident(table,k)}`).join(',')} WHERE (${existingPolicy})`;
      }
      sql+=' RETURNING *';statements.push(db.prepare(sql).bind(...candidateArgs));
    }
    const results=await db.batch<Row>(statements);const data=results.flatMap(r=>r.results).map(decode);
    if(data.length!==values.length)throw new Error('无权写入此记录');
    return {data,error:null};
  }catch(error){return {data:[],error:{message:error instanceof Error?error.message:'数据库操作失败'}};}
}
