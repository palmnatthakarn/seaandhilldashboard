'use client';

import { authClient } from "@/lib/auth-client";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export { authClient };
