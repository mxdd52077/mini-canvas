import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {createClient} from '@/lib/backend/server';
import {getEnv} from '@/lib/backend/env';
export async function POST(_request:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params;const {data:{user}}=await (await createClient()).auth.getUser();if(!user)return NextResponse.json({error:'请先登录'},{status:401});
  // Unverified email/password registrations cannot claim another person's email invitation.
  if(!user.email_confirmed_at)return NextResponse.json({error:'接受邮箱邀请前需要验证邮箱；站点尚未配置邮件验证服务，请联系项目所有者。'},{status:403});
  const env=await getEnv(),hash=createHash('sha256').update(token).digest('hex');
  const invite=await env.DB.prepare('SELECT * FROM project_invites WHERE token_hash=? AND accepted_at IS NULL AND expires_at>? AND email=? COLLATE NOCASE').bind(hash,new Date().toISOString(),user.email??'').first<{id:string;project_id:string;role:string}>();
  if(!invite)return NextResponse.json({error:'邀请已失效或邮箱不匹配'},{status:410});
  await env.DB.batch([
    env.DB.prepare('INSERT INTO project_members(project_id,user_id,role) SELECT project_id,?,role FROM project_invites WHERE id=? AND accepted_at IS NULL AND expires_at>? ON CONFLICT(project_id,user_id) DO NOTHING').bind(user.id,invite.id,new Date().toISOString()),
    env.DB.prepare('UPDATE project_invites SET accepted_at=? WHERE id=? AND accepted_at IS NULL').bind(new Date().toISOString(),invite.id),
  ]);
  return NextResponse.json({projectId:invite.project_id});
}
