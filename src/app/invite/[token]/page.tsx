"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginPath } from "@/lib/auth-redirect";
export default function InvitePage({params}:{params:Promise<{token:string}>}){const {token}=use(params),router=useRouter(),[message,setMessage]=useState("正在接受邀请…");useEffect(()=>{fetch(`/api/invites/${token}`,{method:"POST"}).then(async r=>{if(r.status===401){router.replace(loginPath(`/invite/${token}`));return null}const data=await r.json();if(!r.ok)throw new Error(data.error||"接受邀请失败");return data}).then(data=>{if(data)router.replace(`/project/${data.projectId}`)}).catch(e=>setMessage(e.message))},[token,router]);return <main className="flex min-h-screen flex-col items-center justify-center gap-4"><p>{message}</p><Link href={loginPath(`/invite/${token}`)} className="rounded-lg bg-black px-4 py-2 text-white">登录后重试</Link></main>}
