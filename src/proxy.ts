import { NextResponse, type NextRequest } from "next/server";
export function proxy(request:NextRequest) {
  // All mutations are same-origin; authentication and project authorization run in the data layer.
  if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
    const origin=request.headers.get('origin');
    if(origin && origin!==request.nextUrl.origin)return NextResponse.json({error:'请求来源无效'},{status:403});
  }
  return NextResponse.next();
}
export const config={matcher:['/api/:path*','/project/:path*','/admin/:path*','/invite/:path*']};
