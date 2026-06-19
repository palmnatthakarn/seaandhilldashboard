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

  // Check current state
  const before = await c.query(`
    SELECT slot_name, active, active_pid,
      pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_lag
    FROM pg_replication_slots
    WHERE slot_name = 'debezium_slot_005'
  `);
  console.log('Before:');
  console.table(before.rows);

  const pid = before.rows[0]?.active_pid;
  if (!pid) {
    console.log('Slot is not active, dropping directly...');
  } else {
    console.log(`Terminating WAL sender PID ${pid}...`);
    await c.query(`SELECT pg_terminate_backend($1)`, [pid]);
    console.log('Terminated.');
  }

  // Drop the slot
  try {
    await c.query(`SELECT pg_drop_replication_slot('debezium_slot_005')`);
    console.log('\ndebezium_slot_005 dropped successfully.');
    console.log('PostgreSQL will now reclaim ~27 GB of WAL on next checkpoint.');
  } catch (e) {
    console.error('Drop failed:', e.message);
    console.log('Debezium may have reconnected. Run this script again in a few seconds.');
  }

  // Verify
  const after = await c.query(`SELECT slot_name FROM pg_replication_slots WHERE slot_name = 'debezium_slot_005'`);
  if (after.rows.length === 0) {
    console.log('\nVerified: slot no longer exists.');
  } else {
    console.log('\nWarning: slot still exists — Debezium reconnected. Run again.');
  }

  await c.end();
}

main().catch(console.error);
