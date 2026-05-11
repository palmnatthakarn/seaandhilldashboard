import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isEmailAllowed } from "@/lib/auth-allowlist";

export default async function MainRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  if (!await isEmailAllowed(session.user.email)) {
    redirect("/unauthorized");
  }

  return <>{children}</>;
}
