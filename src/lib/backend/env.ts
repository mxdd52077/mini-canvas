export async function getEnv():Promise<Cloudflare.Env> {
  const {env}=await import('cloudflare:workers');
  if(!env.DB)throw new Error('Cloudflare D1 尚未绑定');
  return env;
}
