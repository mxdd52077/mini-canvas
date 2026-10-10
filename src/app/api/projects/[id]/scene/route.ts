import { getEnv } from "@/lib/backend/env";
import { canEditProject } from "@/lib/project-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/backend/server";
import { hydrateSceneImageUrls,stripSceneImageUrls } from "@/lib/scene-storage";
const payload=z.object({nodes:z.array(z.record(z.string(),z.unknown())).max(1000),edges:z.array(z.record(z.string(),z.unknown())).max(2000)});
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:Context){
  const {id}=await params,supabase=await createClient();
  if(!supabase)return NextResponse.json({demo:true});
  const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});
  const {data:project,error:projectError}=await supabase.from("projects").select("id,name,background,version").eq("id",id).single();
  if(projectError||!project)return NextResponse.json({error:projectError?.message||"项目不存在"},{status:404});
  const {data:viewport}=await supabase.from("project_viewports").select("x,y,zoom").eq("project_id",id).maybeSingle();
  const {data:snapshot}=await supabase.from("canvas_snapshots").select("payload").eq("project_id",id).order("project_version",{ascending:false}).limit(1).maybeSingle();
  const scene=(snapshot?.payload||{nodes:[],edges:[]}) as {nodes:Record<string,unknown>[];edges:unknown[]};
  const nodes=await Promise.all(scene.nodes.map(async node=>{
    const hydrated={...node};
    for(const [pathKey,urlKey] of [["srcPath","src"],["referencePath","reference"]] as const){
      const path=node[pathKey];
      if(typeof path==="string"&&path.startsWith(`${id}/`)){
        const signed=await supabase.storage.from("project-assets").createSignedUrl(path,7*86400);
        if(!signed.error)hydrated[urlKey]=signed.data.signedUrl;
      }
    }
    return hydrateSceneImageUrls(hydrated,id,async path=>{
      const signed=await supabase.storage.from("project-assets").createSignedUrl(path,7*86400);
      return signed.error?undefined:signed.data.signedUrl;
    });
  }));
  return NextResponse.json({project,scene:{nodes,edges:scene.edges},viewport:viewport||null});
}
export async function PUT(request:Request,{params}:Context){
  const {id}=await params,supabase=await createClient();if(!supabase)return NextResponse.json({demo:true});
  const {data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"unauthorized"},{status:401});
  const parsed=payload.safeParse(await request.json());if(!parsed.success)return NextResponse.json({error:"画布数据无效"},{status:400});
  const {data:project}=await supabase.from("projects").select("version").eq("id",id).single();if(!project)return NextResponse.json({error:"项目不存在"},{status:404});
  if(!await canEditProject(id))return NextResponse.json({error:"无权编辑画布"},{status:403});
  const durableScene={...parsed.data,nodes:parsed.data.nodes.map(node=>stripSceneImageUrls({...node,...(node.srcPath?{src:undefined}:{}),...(node.referencePath?{reference:undefined}:{})}))};
  const encoded=JSON.stringify(durableScene);
  if(new TextEncoder().encode(encoded).byteLength>900000)return NextResponse.json({error:"画布快照超过 900 KB，请拆分为多个项目"},{status:413});
  const env=await getEnv(),snapshotId=crypto.randomUUID(),version=Number(project.version)+1;
  try {
    const results=await env.DB.batch([
      env.DB.prepare("INSERT INTO canvas_snapshots(id,project_id,project_version,payload,created_by) SELECT ?,id,version+1,?,? FROM projects WHERE id=? AND version=? AND EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=projects.id AND m.user_id=? AND m.role IN ('owner','editor')) RETURNING id").bind(snapshotId,encoded,user.id,id,project.version,user.id),
      env.DB.prepare("UPDATE projects SET version=?,updated_at=? WHERE id=? AND version=? AND EXISTS (SELECT 1 FROM canvas_snapshots WHERE id=?) RETURNING version").bind(version,new Date().toISOString(),id,project.version,snapshotId),
    ]);
    if(!results[0].results.length||!results[1].results.length)return NextResponse.json({error:"画布版本冲突，请重试"},{status:409});
    return NextResponse.json({version});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"保存画布失败"},{status:500});}
}
