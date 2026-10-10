import { redirect } from "next/navigation";
import { CanvasEditor } from "@/components/canvas-editor";
import { createClient } from "@/lib/supabase/server";
import { loginPath } from "@/lib/auth-redirect";

export default async function ProjectPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const supabase=await createClient();
  if(supabase){
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)redirect(loginPath(`/project/${id}`));
  }
  return <CanvasEditor projectId={id}/>;
}
