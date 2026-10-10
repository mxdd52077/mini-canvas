import { createClient } from "@/lib/backend/server";
export async function canEditProject(projectId:string){
  const supabase=await createClient();if(!supabase)return false;
  const {data:{user}}=await supabase.auth.getUser();if(!user)return false;
  const {data:project}=await supabase.from("projects").select("owner_id").eq("id",projectId).single();
  if(project?.owner_id===user.id)return true;
  const {data:member}=await supabase.from("project_members").select("role").eq("project_id",projectId).eq("user_id",user.id).maybeSingle();
  return member?.role==="editor";
}
