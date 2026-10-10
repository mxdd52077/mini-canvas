import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/admin";
import { loginPath } from "@/lib/auth-redirect";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAppUser();
  if (!user) redirect(loginPath("/admin"));
  if (user.role !== "admin") redirect("/");
  return <>{children}</>;
}
