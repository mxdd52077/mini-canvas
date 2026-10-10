import {createHmac,timingSafeEqual} from 'node:crypto';
import type {User} from './types';
export const MIME_TYPES=new Set(['image/jpeg','image/png','image/webp','image/svg+xml','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/aac','audio/x-aac','audio/ogg','application/ogg','audio/webm','audio/wav','audio/x-wav','audio/vnd.wav','audio/flac','audio/x-m4a']);
export const UPLOAD_LIMIT=90_000_000;
export function validPath(path:string){return /^[a-f0-9-]{36}\/[\w./-]+$/i.test(path)&&!path.split('/').some(p=>p==='..'||p==='.'||p==='');}
export async function assetAccess(env:Cloudflare.Env,user:User|null,path:string,write=false){
  if(!user||!validPath(path))return false;
  const row=await env.DB.prepare(`SELECT 1 FROM project_members m JOIN projects p ON p.id=m.project_id WHERE m.project_id=? AND m.user_id=? AND p.deleted_at IS NULL${write?" AND m.role IN ('owner','editor')":''}`).bind(path.split('/')[0],user.id).first();return Boolean(row);
}
function signature(env:Cloudflare.Env,path:string,expires:number){if(!env.ASSET_SIGNING_KEY)throw new Error('素材签名密钥尚未配置');return createHmac('sha256',env.ASSET_SIGNING_KEY).update(`${path}\n${expires}`).digest('hex');}
export function verifyAssetSignature(env:Cloudflare.Env,path:string,expires:number,sig:string){if(!validPath(path)||!Number.isInteger(expires)||expires<Date.now()||expires>Date.now()+7*86400000||!/^\w{64}$/.test(sig))return false;return timingSafeEqual(Buffer.from(signature(env,path,expires)),Buffer.from(sig));}
export function serverStorage(env:Cloudflare.Env,user:User|null){return {
  async createSignedUrl(path:string,seconds:number){if(!await assetAccess(env,user,path))return {data:{signedUrl:''},error:{message:'无权访问素材'}};const expires=Date.now()+Math.min(7*86400,Math.max(1,seconds))*1000;const signedUrl=`${env.SITE_URL}/api/backend/storage/${path}?expires=${expires}&signature=${signature(env,path,expires)}`;return {data:{signedUrl},error:null};},
  async upload(path:string,file:Blob,options?:{contentType?:string}){if(!await assetAccess(env,user,path,true))return {data:null,error:{message:'无权上传素材'}};if(file.size>UPLOAD_LIMIT||!MIME_TYPES.has(options?.contentType||file.type))return {data:null,error:{message:'素材类型不支持或超过 90 MB'}};if(await env.MEDIA.head(path))return {data:null,error:{message:'素材已存在'}};await env.MEDIA.put(path,await file.arrayBuffer(),{httpMetadata:{contentType:options?.contentType||file.type},customMetadata:{owner:user!.id}});return {data:{path},error:null};},
  async remove(paths:string[]){for(const path of paths){if(!await assetAccess(env,user,path,true))return {data:null,error:{message:'无权删除素材'}};const object=await env.MEDIA.head(path);if(object&&object.customMetadata?.owner!==user!.id)return {data:null,error:{message:'只能删除自己上传的素材'}};}
    await env.MEDIA.delete(paths);return {data:paths.map(name=>({name})),error:null};},
};}
