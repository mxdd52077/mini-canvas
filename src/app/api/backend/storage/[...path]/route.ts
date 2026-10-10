import {NextResponse} from 'next/server';
import {getEnv} from '@/lib/backend/env';
import {createClient} from '@/lib/backend/server';
import {assetAccess,validPath,verifyAssetSignature,serverStorage,MIME_TYPES,UPLOAD_LIMIT} from '@/lib/backend/storage';
type Context={params:Promise<{path:string[]}>};
async function currentUser(){return (await (await createClient()).auth.getUser()).data.user;}
export async function GET(request:Request,{params}:Context){
  const path=(await params).path.join('/'),env=await getEnv(),url=new URL(request.url);
  if(!validPath(path))return NextResponse.json({error:'素材路径无效'},{status:400});
  const signed=verifyAssetSignature(env,path,Number(url.searchParams.get('expires')),url.searchParams.get('signature')||'');
  if(!signed&&!await assetAccess(env,await currentUser(),path))return NextResponse.json({error:'无权访问素材'},{status:403});
  const object=await env.MEDIA.get(path,{range:request.headers});if(!object)return NextResponse.json({error:'素材不存在'},{status:404});
  const headers=new Headers({'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes','Content-Security-Policy':"sandbox; default-src 'none'"});object.writeHttpMetadata(headers);headers.set('ETag',object.httpEtag);
  let status=200;
  if(request.headers.has('range')&&object.range&&'offset' in object.range){const offset=object.range.offset??0,length=object.range.length??object.size;headers.set('Content-Range',`bytes ${offset}-${offset+length-1}/${object.size}`);headers.set('Content-Length',String(length));status=206;}else headers.set('Content-Length',String(object.size));
  return new Response(object.body,{status,headers});
}
export async function PUT(request:Request,{params}:Context){
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'请求来源无效'},{status:403});
  const path=(await params).path.join('/'),env=await getEnv(),user=await currentUser();
  if(!await assetAccess(env,user,path,true))return NextResponse.json({error:'无权上传素材'},{status:403});
  const mime=request.headers.get('content-type')?.split(';')[0]||'';const size=Number(request.headers.get('content-length'));
  if(!MIME_TYPES.has(mime)||!Number.isFinite(size)||size<=0||size>UPLOAD_LIMIT||!request.body)return NextResponse.json({error:'素材类型不支持或超过 90 MB'},{status:400});
  if(await env.MEDIA.head(path))return NextResponse.json({error:'素材已存在'},{status:409});
  await env.MEDIA.put(path,request.body,{httpMetadata:{contentType:mime},customMetadata:{owner:user!.id}});return NextResponse.json({path});
}
export async function POST(request:Request,{params}:Context){
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'请求来源无效'},{status:403});
  const path=(await params).path.join('/'),env=await getEnv(),user=await currentUser();if(!user)return NextResponse.json({error:'请先登录'},{status:401});
  const body=await request.json().catch(()=>null);
  if(path==='sign'&&typeof body?.path==='string'&&Number.isFinite(body.expiresIn)){const r=await serverStorage(env,user).createSignedUrl(body.path,body.expiresIn);return NextResponse.json(r.error?{error:r.error.message}:r.data,{status:r.error?403:200});}
  if(path==='remove'&&Array.isArray(body?.paths)&&body.paths.length<=50&&body.paths.every((p:unknown)=>typeof p==='string')){const r=await serverStorage(env,user).remove(body.paths);return NextResponse.json(r.error?{error:r.error.message}:r.data,{status:r.error?403:200});}
  return NextResponse.json({error:'参数无效'},{status:400});
}
