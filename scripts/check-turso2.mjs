import { createClient } from '@libsql/client';

async function main() {
  console.log('Connecting to Turso...');
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL ?? 'file:./auth.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    const tables = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    console.log('Tables:', tables.rows.map(r => r.name));

    for (const t of tables.rows) {
      const name = t.name;
      if (typeof name === 'string' && name.startsWith('telegram')) {
        const rows = await db.execute(`SELECT * FROM "${name}" LIMIT 5`);
        console.log(`\n${name}: ${rows.rows.length} rows`);
        for (const r of rows.rows) {
          console.log('  ', JSON.stringify(r));
        }
      }
    }
  } catch (err) {
    console.error('Error:', err.message || err);
  }
  console.log('Done');
}

main();
