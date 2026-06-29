require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@libsql/client');

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  await client.execute(
    'CREATE TABLE IF NOT EXISTS notification_dispatch_log (dedupe_key TEXT PRIMARY KEY, sent_at TEXT NOT NULL)'
  );

  const before = await client.execute(
    "SELECT COUNT(*) AS count FROM notification_dispatch_log WHERE dedupe_key LIKE 'daily:%'"
  );

  await client.execute("DELETE FROM notification_dispatch_log WHERE dedupe_key LIKE 'daily:%'");

  const after = await client.execute(
    "SELECT COUNT(*) AS count FROM notification_dispatch_log WHERE dedupe_key LIKE 'daily:%'"
  );

  console.log('Daily dedupe rows before:', Number(before.rows[0].count || 0));
  console.log('Daily dedupe rows after:', Number(after.rows[0].count || 0));

  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
