import {cookies} from 'next/headers';
import {getEnv} from './env';
import {sessionUser,SESSION_COOKIE} from './auth';
import {executeQuery} from './database';
import {Query} from './query';
import type {User} from './types';
import {serverStorage} from './storage';
export async function createClient(){const env=await getEnv();const user=await sessionUser(env.DB,(await cookies()).get(SESSION_COOKIE)?.value);return makeClient(env,user);}
export async function createServiceClient(){return makeClient(await getEnv(),null,true);}
function makeClient(env:Cloudflare.Env,user:User|null,service=false){return {
  auth:{async getUser(){return {data:{user},error:null};}},
  from(table:string){return new Query(table,spec=>executeQuery(env.DB,user,spec,service));},
  storage:{from:(bucket:string)=>{if(bucket!=='project-assets')throw new Error('未知素材库');return serverStorage(env,user);}},
  async rpc(_name:string,_values:unknown){void _name;void _values;return {data:null,error:{message:'旧版画布命令 API 不可用，请使用画布快照保存接口'}};},
};}
