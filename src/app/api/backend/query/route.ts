import {NextResponse} from 'next/server';
import {getEnv} from '@/lib/backend/env';
import {createClient} from '@/lib/backend/server';
import {executeQuery} from '@/lib/backend/database';
import type {QuerySpec} from '@/lib/backend/types';
export async function POST(request:Request){
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'请求来源无效'},{status:403});
  const {data:{user}}=await (await createClient()).auth.getUser();if(!user)return NextResponse.json({error:'请先登录'},{status:401});
  const spec=await request.json().catch(()=>null) as QuerySpec|null;
  // Only the two browser data paths are exposed; all other queries originate in server route handlers.
  if(!spec||!Array.isArray(spec.filters)||!Array.isArray(spec.orders)||!((spec.table==='profiles'&&spec.action==='select')||(spec.table==='assets'&&spec.action==='insert')))return NextResponse.json({error:'不支持此客户端操作'},{status:403});
  if(spec.table==='profiles')spec.filters.push({column:'id',op:'eq',value:user.id});
  const result=await executeQuery((await getEnv()).DB,user,spec);return NextResponse.json(result,{status:result.error?400:200});
}
