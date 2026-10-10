import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { supabaseServerFetch } from "@/lib/supabase/server-fetch";

export async function updateSession(request: NextRequest) {
  const origin = request.headers.get("origin");
  // 跨域预检：直接应答，避免落到业务路由
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const response = NextResponse.next({ request });
    for (const [k, v] of Object.entries(corsHeaders(origin))) response.headers.set(k, v);
    return response;
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    global: { fetch: supabaseServerFetch },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });

  await supabase.auth.getClaims();
  for (const [k, v] of Object.entries(corsHeaders(origin))) response.headers.set(k, v);
  return response;
}
