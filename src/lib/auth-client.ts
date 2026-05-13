import { createAuthClient } from "better-auth/react";

function resolveAuthBaseURL(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
    return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
  }

  return "http://localhost:3001";
}

export const authClient = createAuthClient({
  baseURL: resolveAuthBaseURL(),
});

export const { useSession, signIn, signOut } = authClient;
