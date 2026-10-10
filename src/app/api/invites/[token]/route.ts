import { createHash } from "node:crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function POST(_request:Request,{params}:{params:Promise<{token:string}>}){
  const {token}=await params,s=await createClient();if(!s)return NextResponse.json({error:"请先配置 Supabase"},{status:503});
  const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const url=process.env.SUPABASE_INTERNAL_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;if(!url||!key)return NextResponse.json({error:"服务端尚未配置 SUPABASE_SECRET_KEY"},{status:503});
  const admin=createAdminClient(url,key,{auth:{persistSession:false}});
  const hash=createHash("sha256").update(token).digest("hex");
  const {data:invite}=await admin.from("project_invites").select("id,project_id,email,role,expires_at,accepted_at").eq("token_hash",hash).single();
  if(!invite||invite.accepted_at||new Date(invite.expires_at).getTime()<Date.now())return NextResponse.json({error:"邀请已失效"},{status:410});
  if(invite.email.toLowerCase()!==user.email?.toLowerCase())return NextResponse.json({error:"请使用受邀邮箱登录"},{status:403});
  const {error}=await admin.from("project_members").upsert({project_id:invite.project_id,user_id:user.id,role:invite.role},{onConflict:"project_id,user_id"});if(error)return NextResponse.json({error:error.message},{status:400});
  await admin.from("project_invites").update({accepted_at:new Date().toISOString()}).eq("id",invite.id);
  return NextResponse.json({projectId:invite.project_id});
}
