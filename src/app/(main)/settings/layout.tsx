import { redirect } from "next/navigation";
import { getCurrentSessionUser, isAdminUser } from "@/lib/auth-policy";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentSessionUser();

  if (!isAdminUser(user)) {
    redirect("/");
  }

  return <>{children}</>;
}
