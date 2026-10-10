'use client';
import {Query} from './query';
import type {User,Result,Row,QuerySpec} from './types';
type Session={user:User};
const listeners=new Set<(event:string,session:Session|null)=>void>();
async function call(path:string,body?:unknown){try{const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const data=await response.json();return {data,error:response.ok?null:{message:data.error||'请求失败'}};}catch{return {data:null,error:{message:'网络连接失败，请重试'}};}}
async function session(){const r=await call('/api/auth/session');return {data:{session:r.data?.user?{user:r.data.user as User}:null},error:r.error};}
async function sign(action:string,values?:{email:string;password:string;options?:{data?:{display_name?:string}}}){const r=await call(`/api/auth/${action}`,values?{email:values.email,password:values.password,name:values.options?.data?.display_name}:{});const value=r.data?.user?{user:r.data.user as User}:null;if(!r.error)for(const listener of listeners)listener(action==='logout'?'SIGNED_OUT':'SIGNED_IN',value);return {data:{session:value,user:value?.user??null},error:r.error};}
const client={
  auth:{getSession:session,async getUser(){const r=await session();return {data:{user:r.data.session?.user??null},error:r.error};},
    onAuthStateChange(fn:(event:string,session:Session|null)=>void){listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn);}}}};},
    signUp:(values:{email:string;password:string;options?:{data?:{display_name?:string}}})=>sign('register',values),
    signInWithPassword:(values:{email:string;password:string})=>sign('login',values),signOut:()=>sign('logout'),
    async resetPasswordForEmail(_email:string,_options?:{redirectTo?:string}){void _email;void _options;return {data:{},error:{message:'邮件服务尚未配置，暂不支持密码重置。请联系站点管理员。'}};},
  },
  from(table:string){return new Query(table,async(spec:QuerySpec):Promise<Result<Row[]>>=>{const r=await call('/api/backend/query',spec);return r.error?{data:[],error:r.error}:r.data;});},
  storage:{from(bucket:string){if(bucket!=='project-assets')throw new Error('未知素材库');return {
    async upload(path:string,file:Blob,options?:{contentType?:string}){try{const r=await fetch(`/api/backend/storage/${path.split('/').map(encodeURIComponent).join('/')}`,{method:'PUT',headers:{'content-type':options?.contentType||file.type},body:file});const data=await r.json();return {data,error:r.ok?null:{message:data.error||'上传失败'}};}catch{return {data:null,error:{message:'上传失败，请检查网络'}};}},
    async remove(paths:string[]){const r=await call('/api/backend/storage/remove',{paths});return {data:r.data,error:r.error};},
    async createSignedUrl(path:string,expiresIn:number){const r=await call('/api/backend/storage/sign',{path,expiresIn});return {data:r.data??{signedUrl:''},error:r.error};},
  };}},
};
export const hasBackendConfig=true;
export function createClient(){return client;}
