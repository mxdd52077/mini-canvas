import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type Context={params:Promise<{id:string}>};
const input=z.object({x:z.number().finite(),y:z.number().finite(),body:z.string().trim().min(1).max(5000),color:z.string().regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/).optional(),objectId:z.string().min(1).max(64).nullable().optional()});

export async function GET(_request:Request,{params}:Context){
  const {id}=await params,supabase=await createClient();
  if(!supabase)return NextResponse.json({error:"Supabase 尚未配置"},{status:503});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const project=await supabase.from("projects").select("id").eq("id",id).maybeSingle();
  if(!project.data)return NextResponse.json({error:"项目不存在或无权访问"},{status:404});
  const member=await supabase.from("project_members").select("role").eq("project_id",id).eq("user_id",user.id).maybeSingle();
  const {data:rows,error}=await supabase.from("comments").select("id,x,y,body,color,object_id,author_id,created_at,profiles!comments_author_id_fkey(display_name)").eq("project_id",id).is("resolved_at",null).order("created_at");
  if(error)return NextResponse.json({error:error.message},{status:400});
  const ids=(rows||[]).map(row=>row.id);
  const replies=ids.length?await supabase.from("comment_replies").select("id,comment_id,body,author_id,created_at,profiles!comment_replies_author_id_fkey(display_name)").in("comment_id",ids).order("created_at"):null;
  if(replies?.error)return NextResponse.json({error:replies.error.message},{status:400});
  const authorName=(profile:unknown)=>{const item=Array.isArray(profile)?profile[0]:profile;return item&&typeof item==="object"&&"display_name" in item?String(item.display_name):"成员"};
  const comments=(rows||[]).map(row=>{const author=authorName(row.profiles);return{id:row.id,x:row.x,y:row.y,text:row.body,color:row.color||undefined,objectId:row.object_id||undefined,author,avatar:author.slice(0,1),authorId:row.author_id,createdAt:row.created_at,replies:(replies?.data||[]).filter(reply=>reply.comment_id===row.id).map(reply=>({id:reply.id,text:reply.body,author:authorName(reply.profiles),authorId:reply.author_id,createdAt:reply.created_at}))}});
  return NextResponse.json({comments,userId:user.id,role:member.data?.role||null});
}

export async function POST(request:Request,{params}:Context){
  const {id}=await params,supabase=await createClient();
  if(!supabase)return NextResponse.json({error:"Supabase 尚未配置"},{status:503});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const parsed=input.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"请输入评论内容"},{status:400});
  const {data,error}=await supabase.from("comments").insert({project_id:id,author_id:user.id,x:parsed.data.x,y:parsed.data.y,body:parsed.data.body,color:parsed.data.color||null,object_id:parsed.data.objectId||null}).select("id,x,y,body,color,object_id,author_id,created_at").single();
  if(error||!data)return NextResponse.json({error:error?.message||"评论保存失败"},{status:400});
  const profile=await supabase.from("profiles").select("display_name").eq("id",user.id).maybeSingle();
  const author=profile.data?.display_name||user.email?.split("@")[0]||"我";
  return NextResponse.json({comment:{id:data.id,x:data.x,y:data.y,text:data.body,color:data.color||undefined,objectId:data.object_id||undefined,author,avatar:author.slice(0,1),authorId:user.id,createdAt:data.created_at,replies:[]}}, {status:201});
}
