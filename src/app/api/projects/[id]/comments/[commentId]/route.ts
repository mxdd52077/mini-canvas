import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canEditProject } from "@/lib/project-access";

type Context={params:Promise<{id:string;commentId:string}>};
const patchInput=z.object({x:z.number().finite(),y:z.number().finite(),objectId:z.string().min(1).max(64).nullable().optional()});
export async function PATCH(request:Request,{params}:Context){
  const {id,commentId}=await params,supabase=await createClient();
  if(!supabase)return NextResponse.json({error:"Supabase 尚未配置"},{status:503});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const parsed=patchInput.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"坐标无效"},{status:400});
  const existing=await supabase.from("comments").select("author_id").eq("id",commentId).eq("project_id",id).is("resolved_at",null).maybeSingle();
  if(!existing.data)return NextResponse.json({error:"评论不存在"},{status:404});
  if(existing.data.author_id!==user.id&&!await canEditProject(id))return NextResponse.json({error:"无权移动此评论"},{status:403});
  const {error}=await supabase.from("comments").update({x:parsed.data.x,y:parsed.data.y,object_id:parsed.data.objectId??null}).eq("id",commentId).eq("project_id",id);
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({ok:true});
}
export async function DELETE(_request:Request,{params}:Context){
  const {id,commentId}=await params,supabase=await createClient();
  if(!supabase)return NextResponse.json({error:"Supabase 尚未配置"},{status:503});
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const existing=await supabase.from("comments").select("author_id").eq("id",commentId).eq("project_id",id).is("resolved_at",null).maybeSingle();
  if(!existing.data)return NextResponse.json({error:"评论不存在"},{status:404});
  if(existing.data.author_id!==user.id&&!await canEditProject(id))return NextResponse.json({error:"无权删除此评论"},{status:403});
  const {data,error}=await supabase.from("comments").update({resolved_at:new Date().toISOString(),resolved_by:user.id}).eq("id",commentId).eq("project_id",id).select("id").maybeSingle();
  if(error||!data)return NextResponse.json({error:error?.message||"删除失败"},{status:400});
  return NextResponse.json({ok:true});
}
