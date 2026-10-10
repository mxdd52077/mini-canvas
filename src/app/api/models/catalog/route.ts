import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "未配置 Supabase" }, { status: 503 });
  const { data, error } = await supabase
    .from("model_configs")
    .select("id,model_id,display_name,kind,capabilities,pricing,updated_at,provider_configs!inner(slug,name,enabled)")
    .eq("enabled", true)
    .eq("provider_configs.enabled", true)
    .in("kind", ["image", "video", "audio"])
    .order("display_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ models: data || [] });
}
