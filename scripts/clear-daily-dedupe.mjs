import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@libsql/client';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL ?? 'file:./auth.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  const rows = await db.execute(
    `SELECT dedupe_key, sent_at FROM notification_dispatch_log WHERE dedupe_key LIKE 'daily:%' ORDER BY sent_at DESC LIMIT 20`
  );
  console.log('Current daily dedupe entries:');
  for (const r of rows.rows) console.log(' ', JSON.stringify(r));

  if (process.argv[2] === '--delete-today') {
    const del = await db.execute(
      `DELETE FROM notification_dispatch_log WHERE dedupe_key LIKE 'daily:%' AND date(sent_at) = date('now')`
    );
    console.log(`\nDeleted ${del.rowsAffected} row(s) for today.`);
  } else {
    console.log('\n(dry run — pass --delete-today to actually clear today\'s entries)');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
