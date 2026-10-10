import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {z} from 'zod';
import {timingSafeEqual} from 'node:crypto';
import {getEnv} from '@/lib/backend/env';
import {SESSION_COOKIE,digest,passwordHash,sessionUser,authRateLimit} from '@/lib/backend/auth';
const input=z.object({email:z.email().max(254).transform(v=>v.toLowerCase().trim()),password:z.string().min(8).max(128),name:z.string().trim().min(1).max(80).optional()});
type Context={params:Promise<{action:string}>};
export async function GET(_request:Request,{params}:Context){
  if((await params).action!=='session')return NextResponse.json({error:'无此操作'},{status:404});
  const env=await getEnv();const user=await sessionUser(env.DB,(await cookies()).get(SESSION_COOKIE)?.value);
  return NextResponse.json({user},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request,{params}:Context){
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({error:'请求来源无效'},{status:403});
  const {action}=await params,env=await getEnv(),jar=await cookies();
  if(action==='logout'){
    const token=jar.get(SESSION_COOKIE)?.value;if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run();
    jar.set(SESSION_COOKIE,'',{httpOnly:true,secure:new URL(request.url).protocol==='https:',sameSite:'lax',path:'/',maxAge:0});return NextResponse.json({ok:true});
  }
  if(!['login','register'].includes(action))return NextResponse.json({error:'邮件服务尚未配置，暂不支持密码重置。请联系站点管理员。'},{status:503});
  const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'请输入有效邮箱及 8–128 位密码'},{status:400});
  const {email,password,name}=parsed.data;
  const ip=request.headers.get('cf-connecting-ip')||'local';
  if(!await authRateLimit(env.DB,`ip:${ip}`)||!await authRateLimit(env.DB,`email:${email}`))return NextResponse.json({error:'尝试过于频繁，请 15 分钟后重试'},{status:429});
  let id:string;
  if(action==='register'){
    const exists=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first();if(exists)return NextResponse.json({error:'此邮箱已注册，请登录'},{status:409});
    id=crypto.randomUUID();const salt=crypto.randomUUID(),hash=await passwordHash(password,salt);
    try{await env.DB.batch([
      env.DB.prepare('INSERT INTO users(id,email,password_hash,salt) VALUES(?,?,?,?)').bind(id,email,hash,salt),
      env.DB.prepare('INSERT INTO profiles(id,email,display_name) VALUES(?,?,?)').bind(id,email,name||email.split('@')[0]),
      env.DB.prepare('INSERT INTO credit_accounts(user_id) VALUES(?)').bind(id),
    ]);}catch{return NextResponse.json({error:'注册失败，请稍后重试或登录已有账户'},{status:409});}
  }else{
    const account=await env.DB.prepare('SELECT id,password_hash,salt FROM users WHERE email=?').bind(email).first<{id:string;password_hash:string;salt:string}>();
    const hash=await passwordHash(password,account?.salt||'invalid-account-salt');
    if(!account||!timingSafeEqual(Buffer.from(hash),Buffer.from(account.password_hash)))return NextResponse.json({error:'邮箱或密码错误'},{status:401});
    id=account.id;
    const active=await env.DB.prepare('SELECT id FROM profiles WHERE id=? AND disabled_at IS NULL').bind(id).first();if(!active)return NextResponse.json({error:'账户已停用'},{status:403});
  }
  const token=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await digest(token),id,Date.now()+30*86400000).run();
  jar.set(SESSION_COOKIE,token,{httpOnly:true,secure:new URL(request.url).protocol==='https:',sameSite:'lax',path:'/',maxAge:30*86400});
  return NextResponse.json({user:await sessionUser(env.DB,token)},{headers:{'Cache-Control':'no-store'}});
}
