import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getAuthSession(): Promise<AuthSession | null> {
  try {
    return await auth.api.getSession({
      headers: await headers(),
    });
  } catch (error) {
    console.error("Failed to read auth session", error);
    return null;
  }
}
