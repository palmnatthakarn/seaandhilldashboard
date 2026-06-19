import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-session";
import { isEmailAllowed } from "@/lib/auth-allowlist";

export default async function MainRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  if (!await isEmailAllowed(session.user.email)) {
    redirect("/unauthorized");
  }

  return <>{children}</>;
}
