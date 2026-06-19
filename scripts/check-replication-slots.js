const { Client } = require('pg');

const c = new Client({
  host: '147.50.69.68',
  port: 54322,
  user: 'postgres',
  password: 'seaandhill',
  database: 'postgres',
});

c.connect()
  .then(() => c.query(`
    SELECT slot_name, active,
      pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_lag,
      database
    FROM pg_replication_slots
    ORDER BY pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) DESC
  `))
  .then((r) => {
    console.table(r.rows);
    c.end();
  })
  .catch((e) => {
    console.error(e);
    c.end();
  });
