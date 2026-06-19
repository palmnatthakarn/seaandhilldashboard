const { Client } = require('pg');

const MAX_LAG_BYTES = 500 * 1024 * 1024; // 500 MB
const SAFE_TO_DROP = ['debezium_slot_005']; // closed branches - always drop if they appear

const c = new Client({
  host: '147.50.69.68',
  port: 54322,
  user: 'postgres',
  password: 'seaandhill',
  database: 'postgres',
});

async function main() {
  await c.connect();

  const { rows } = await c.query(`
    SELECT
      slot_name,
      database,
      active,
      active_pid,
      pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS lag_bytes,
      pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_lag
    FROM pg_replication_slots
    ORDER BY lag_bytes DESC
  `);

  const now = new Date().toISOString();
  console.log(`\n[${now}] Replication slot status:`);
  console.table(rows.map((r) => ({
    slot: r.slot_name,
    database: r.database,
    active: r.active,
    wal_lag: r.wal_lag,
    lag_mb: Math.round(Number(r.lag_bytes) / 1024 / 1024),
  })));

  for (const row of rows) {
    const lagBytes = Number(row.lag_bytes);
    const isSafeToDrop = SAFE_TO_DROP.includes(row.slot_name);

    // Always drop closed-branch slots
    if (isSafeToDrop) {
      console.log(`\nWARN: ${row.slot_name} is a closed-branch slot (lag=${row.wal_lag}). Dropping...`);
      if (row.active_pid) {
        await c.query(`SELECT pg_terminate_backend($1)`, [row.active_pid]);
      }
      try {
        await c.query(`SELECT pg_drop_replication_slot($1)`, [row.slot_name]);
        console.log(`  Dropped ${row.slot_name}`);
      } catch (e) {
        console.log(`  Drop failed: ${e.message}`);
      }
      continue;
    }

    // Warn if active branch slot exceeds threshold
    if (lagBytes > MAX_LAG_BYTES) {
      console.log(`\nALERT: ${row.slot_name} (${row.database}) lag=${row.wal_lag} exceeds 500MB!`);
      console.log(`  active=${row.active} pid=${row.active_pid}`);
      console.log(`  ACTION NEEDED: Debezium connector may be stalled. Check Debezium logs.`);
    }
  }

  await c.end();
}

main().catch(console.error);
