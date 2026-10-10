import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type Context={params:Promise<{id:string;commentId:string}>};
export async function POST(request:Request,{params}:Context){
  const {id,commentId}=await params,supabase=await createClient();
  if(!supabase)return NextResponse.json({error:"Supabase 尚未配置"},{status:503});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const parsed=z.object({body:z.string().trim().min(1).max(5000)}).safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"请输入回复内容"},{status:400});
  const comment=await supabase.from("comments").select("id").eq("id",commentId).eq("project_id",id).is("resolved_at",null).maybeSingle();
  if(!comment.data)return NextResponse.json({error:"评论不存在"},{status:404});
  const {data,error}=await supabase.from("comment_replies").insert({comment_id:commentId,author_id:user.id,body:parsed.data.body}).select("id,body,author_id,created_at").single();
  if(error||!data)return NextResponse.json({error:error?.message||"回复失败"},{status:400});
  const profile=await supabase.from("profiles").select("display_name").eq("id",user.id).maybeSingle();
  return NextResponse.json({reply:{id:data.id,text:data.body,author:profile.data?.display_name||user.email?.split("@")[0]||"我",authorId:user.id,createdAt:data.created_at}},{status:201});
}
