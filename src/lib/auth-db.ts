import { createClient } from "@libsql/client";

export const authDbClient = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:./auth.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let schemaReady: Promise<void> | null = null;

async function addColumnIfMissing(sql: string) {
  try {
    await authDbClient.execute(sql);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("duplicate column") && !message.includes("already exists")) {
      throw error;
    }
  }
}

export function ensureAuthUserPolicyColumns() {
  schemaReady ??= (async () => {
    await addColumnIfMissing('ALTER TABLE "user" ADD COLUMN role TEXT NOT NULL DEFAULT \'user\'');
    await addColumnIfMissing('ALTER TABLE "user" ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
    await addColumnIfMissing('ALTER TABLE "user" ADD COLUMN allowed_branches TEXT NOT NULL DEFAULT \'[]\'');
  })();

  return schemaReady;
}
