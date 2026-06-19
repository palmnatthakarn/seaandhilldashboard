const { Client } = require('pg');

const c = new Client({
  host: '147.50.69.68',
  port: 54322,
  user: 'postgres',
  password: 'seaandhill',
  database: 'postgres',
});

async function main() {
  await c.connect();

  await c.query(`ALTER SYSTEM SET max_slot_wal_keep_size = '500MB'`);
  await c.query(`SELECT pg_reload_conf()`);
  console.log('max_slot_wal_keep_size = 500MB set.');
  console.log('Any slot that lags over 500MB will be invalidated automatically.');
  console.log('PostgreSQL will NOT accumulate WAL beyond 500MB per slot going forward.');

  const check = await c.query(`SHOW max_slot_wal_keep_size`);
  console.log('Confirmed:', check.rows[0]);

  await c.end();
}

main().catch(console.error);
