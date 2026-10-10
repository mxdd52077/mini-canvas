import type {User} from './types';
export const SESSION_COOKIE='mc_session';
export async function digest(value:string) {const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Buffer.from(hash).toString('hex');}
export async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);return Buffer.from(bits).toString('hex');}
export async function sessionUser(db:D1Database,token:string|undefined):Promise<User|null>{
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const row=await db.prepare('SELECT u.id,u.email,u.email_verified,p.display_name FROM sessions s JOIN users u ON u.id=s.user_id JOIN profiles p ON p.id=u.id WHERE s.token_hash=? AND s.expires_at>? AND p.disabled_at IS NULL').bind(await digest(token),Date.now()).first<{id:string;email:string;email_verified:number;display_name:string}>();
  return row?{id:row.id,email:row.email,user_metadata:{display_name:row.display_name},...(row.email_verified?{email_confirmed_at:'verified'}:{})}:null;
}
export async function authRateLimit(db:D1Database,key:string){
  const now=Date.now(),hash=await digest(key);
  const row=await db.prepare('INSERT INTO auth_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING count').bind(hash,now+900000,now,now).first<{count:number}>();
  return Boolean(row&&row.count<=12);
}
