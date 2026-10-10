/** 浏览器跨域：Next.js API 与 Kong/GoTrue 共用同一套允许来源。 */
export function corsOrigins(): string[] {
  const raw =
    process.env.CORS_ORIGINS ||
    "http://localhost:3000,http://localhost:3001";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = corsOrigins();
  const matched = origin && allow.includes(origin) ? origin : allow[0] ?? "";
  return {
    "Access-Control-Allow-Origin": matched,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      "Accept,Authorization,Content-Type,apikey,X-Client-Info,X-Supabase-Api-Version,X-Requested-With",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
}

export function applyCors(
  response: Headers,
  origin: string | null,
): void {
  for (const [k, v] of Object.entries(corsHeaders(origin))) response.set(k, v);
}
