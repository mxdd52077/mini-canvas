import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/backend/server";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params,s=await createClient();if(!s)return NextResponse.json({error:"Cloudflare 后端尚未配置"},{status:503});
  const {data:{user}}=await s.auth.getUser();if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const parsed=z.object({email:z.email(),role:z.enum(["editor","commenter"]).default("editor")}).safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"邮箱地址无效"},{status:400});
  const {data:project}=await s.from("projects").select("owner_id").eq("id",id).single();if(project?.owner_id!==user.id)return NextResponse.json({error:"只有项目所有者可以邀请"},{status:403});
  const token=randomBytes(32).toString("hex"),token_hash=createHash("sha256").update(token).digest("hex");
  const {error}=await s.from("project_invites").insert({project_id:id,email:parsed.data.email,role:parsed.data.role,token_hash,expires_at:new Date(Date.now()+7*86400000).toISOString(),invited_by:user.id});
  if(error)return NextResponse.json({error:error.message},{status:400});
  // 反代后 request.url 可能是容器内部地址（0.0.0.0:3000），邀请链接必须用对外域名
  const origin=(process.env.SITE_URL||new URL(request.url).origin).replace(/\/+$/,"");
  return NextResponse.json({url:`${origin}/invite/${token}`});
}
