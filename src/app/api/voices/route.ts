import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canEditProject } from "@/lib/project-access";

const voiceInput=z.object({
  projectId:z.uuid(),
  name:z.string().trim().min(1).max(80),
  voiceId:z.string().trim().min(1).max(160).regex(/^[\w.-]+$/),
  sourceModel:z.string().trim().min(1).max(160),
});

const VOICE_EXPIRY_MS=7*24*3600*1000;

const mapVoice=(row:{id:string;project_id:string|null;project_name:string;name:string;voice_id:string;source_model:string;last_used_at:string|null;created_at:string;updated_at:string})=>({
  id:row.id,
  projectId:row.project_id,
  projectName:row.project_name,
  name:row.name,
  voiceId:row.voice_id,
  sourceModel:row.source_model,
  lastUsedAt:row.last_used_at,
  createdAt:row.created_at,
  updatedAt:row.updated_at,
});

export async function GET(){
  const supabase=await createClient();
  if(!supabase)return NextResponse.json({error:"Supabase 尚未配置"},{status:503});
  const{data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  // MiniMax 克隆音色 7 天未使用会被云端删除，本地记录随读取惰性清理
  const cutoff=new Date(Date.now()-VOICE_EXPIRY_MS).toISOString();
  await supabase.from("voice_profiles").delete().or(`last_used_at.lt.${cutoff},and(last_used_at.is.null,created_at.lt.${cutoff})`);
  const{data,error}=await supabase.from("voice_profiles").select("id,project_id,project_name,name,voice_id,source_model,last_used_at,created_at,updated_at").eq("user_id",user.id).order("project_name").order("name");
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({voices:(data||[]).map(mapVoice)});
}

export async function POST(request:Request){
  const parsed=voiceInput.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"音色信息无效"},{status:400});
  const{projectId,name,voiceId,sourceModel}=parsed.data;
  if(!await canEditProject(projectId))return NextResponse.json({error:"无权编辑此项目"},{status:403});
  const supabase=await createClient();
  if(!supabase)return NextResponse.json({error:"Supabase 尚未配置"},{status:503});
  const{data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"请先登录"},{status:401});
  const project=await supabase.from("projects").select("name").eq("id",projectId).single();
  if(project.error||!project.data)return NextResponse.json({error:"来源项目不存在"},{status:404});
  const now=new Date().toISOString();
  const{data,error}=await supabase.from("voice_profiles").upsert({user_id:user.id,project_id:projectId,project_name:project.data.name,name,voice_id:voiceId,source_model:sourceModel,updated_at:now},{onConflict:"user_id,voice_id"}).select("id,project_id,project_name,name,voice_id,source_model,last_used_at,created_at,updated_at").single();
  if(error||!data)return NextResponse.json({error:error?.message||"保存音色失败"},{status:400});
  return NextResponse.json({voice:mapVoice(data)});
}
