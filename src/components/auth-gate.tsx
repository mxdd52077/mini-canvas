"use client";
import { LoginModal } from "@/components/login-modal";

/** 全局挂载登录弹窗，供任意页面的未登录拦截复用。 */
export function AuthGate() {
  return <LoginModal />;
}
