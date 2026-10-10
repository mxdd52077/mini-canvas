import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseServerFetch } from "@/lib/supabase/server-fetch";
export async function createClient(){const jar=await cookies();const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)return null;return createServerClient(url,key,{global:{fetch:supabaseServerFetch},cookies:{getAll:()=>jar.getAll(),setAll(items){try{items.forEach(({name,value,options})=>jar.set(name,value,options))}catch{}}}})}
