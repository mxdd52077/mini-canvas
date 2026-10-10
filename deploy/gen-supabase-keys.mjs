#!/usr/bin/env node
// 生成自托管 Supabase 所需的 JWT（anon / service_role）。
// 用法: node deploy/gen-supabase-keys.mjs [JWT_SECRET]
// 未传 JWT_SECRET 时会生成一个随机密钥并一并输出。
import { createHmac, randomBytes } from "node:crypto";

const b64url = (input) =>
  Buffer.from(input).toString("base64url");

const sign = (payload, secret) => {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
};

const jwtSecret = process.argv[2] || randomBytes(32).toString("hex");
const now = Math.floor(Date.now() / 1000);
// 自托管场景下给一个足够长的有效期，避免频繁轮换
const exp = now + 10 * 365 * 24 * 60 * 60;

const anon = sign({ iss: "supabase", role: "anon", iat: now, exp }, jwtSecret);
const serviceRole = sign({ iss: "supabase", role: "service_role", iat: now, exp }, jwtSecret);

if (!process.argv[2]) {
  console.log(`JWT_SECRET=${jwtSecret}`);
}
console.log(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${anon}`);
console.log(`SUPABASE_SECRET_KEY=${serviceRole}`);
