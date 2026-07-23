import { createClient } from '@clickhouse/client';

const DB = 'datachangsiam';

const tables = [
  {
    name: 'stock_transaction',
    orderBy: '(doc_no, branch_sync, item_code)',
    versionCol: 'doc_datetime',
    partitionBy: 'toYYYYMM(doc_datetime)',
  },
  {
    name: 'payment_transaction',
    orderBy: '(doc_no, branch_sync)',
    versionCol: 'doc_datetime',
    partitionBy: 'toYYYYMM(doc_datetime)',
  },
  {
    name: 'journal_transaction_detail',
    orderBy: '(doc_no, branch_sync, account_code, debit, credit)',
    versionCol: 'doc_datetime',
    partitionBy: 'toYYYYMM(doc_datetime)',
  },
];

async function run() {
  const client = createClient({
    url: process.env.CLICKHOUSE_HOST || 'http://147.50.69.68:8123',
    username: process.env.CLICKHOUSE_USER || 'admin',
    password: process.env.CLICKHOUSE_PASSWORD || 'Admin123',
    database: DB,
  });

  async function q(query) {
    const result = await client.query({ query, format: 'JSONEachRow' });
    return result.json();
  }

  async function exec(query) {
    await client.exec({ query });
  }

  for (const table of tables) {
    const { name, orderBy, versionCol, partitionBy } = table;
    const newName = `${name}_new`;
    const backupName = `${name}_old`;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== ${name}`);
    console.log(`${'='.repeat(60)}`);

    // 0. Count duplicates
    const dupCols = orderBy.slice(1, -1); // remove parens
    const dupQ = `
      SELECT count() AS cnt
      FROM (SELECT ${dupCols} FROM ${DB}.${name} WHERE toDate(${versionCol}) >= '2026-06-01' GROUP BY ${dupCols} HAVING count(*) > 1)
    `;
    const dupCount = await q(`SELECT count() AS cnt FROM (SELECT ${dupCols} FROM ${DB}.${name} WHERE toDate(${versionCol}) >= '2026-06-01' GROUP BY ${dupCols} HAVING count(*) > 1)`);
    const rowCount = await q(`SELECT count() AS cnt FROM ${DB}.${name} WHERE toDate(${versionCol}) >= '2026-06-01'`);
    console.log(`  Duplicates (June): ${dupCount[0]?.cnt ?? 'N/A'} groups (${rowCount[0]?.cnt ?? '?'} total rows)`);

    // 1. Get CREATE TABLE
    const ct = await q(`SHOW CREATE TABLE ${DB}.${name}`);
    const createStmt = ct[0][Object.keys(ct[0])[0]];
    console.log(`  Current engine: MergeTree`);

    // 2. Drop new table if exists
    await exec(`DROP TABLE IF EXISTS ${DB}.${newName}`);
    console.log(`  Dropped ${newName}`);

    // 3. Build CREATE TABLE as ReplacingMergeTree
    const cols = await q(`SELECT name, type FROM system.columns WHERE database='${DB}' AND table='${name}' ORDER BY position`);
    const colDefs = cols.map(c => `\`${c.name}\` ${c.type}`).join(',\n    ');
    const createQuery = `CREATE TABLE ${DB}.${newName} (\n    ${colDefs}\n) ENGINE = ReplacingMergeTree(${versionCol})\nPARTITION BY ${partitionBy}\nORDER BY ${orderBy}\nSETTINGS index_granularity = 8192`;

    await exec(createQuery);
    console.log(`  Created ${newName} as ReplacingMergeTree`);

    // 4. Copy deduped data
    console.log(`  Copying data...`);
    const copyStart = Date.now();
    const groupCols = orderBy.slice(1, -1);
    const copyQuery = `
      INSERT INTO ${DB}.${newName}
      SELECT * EXCEPT (_rn)
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY ${groupCols}
            ORDER BY ${versionCol} DESC
          ) AS _rn
        FROM ${DB}.${name}
      )
      WHERE _rn = 1
    `;
    await exec(copyQuery);
    console.log(`  Copied in ${Date.now() - copyStart}ms`);

    // 5. Compare row counts
    const oldRows = await q(`SELECT count() AS cnt FROM ${DB}.${name}`);
    const newRows = await q(`SELECT count() AS cnt FROM ${DB}.${newName}`);
    console.log(`  Old rows: ${oldRows[0]?.cnt}, New rows: ${newRows[0]?.cnt}`);

    // 6. RENAME: old -> _old, new -> table
    await exec(`RENAME TABLE ${DB}.${name} TO ${DB}.${backupName}, ${DB}.${newName} TO ${DB}.${name}`);
    console.log(`  Renamed: ${name} -> ${backupName}, ${newName} -> ${name}`);

    // 7. OPTIMIZE FINAL
    await exec(`OPTIMIZE TABLE ${DB}.${name} FINAL`);
    console.log(`  Optimized ${name}`);

    // 8. Verify
    const verifyDup = await q(`SELECT count() AS cnt FROM (SELECT ${groupCols} FROM ${DB}.${name} WHERE toDate(${versionCol}) >= '2026-06-01' GROUP BY ${groupCols} HAVING count(*) > 1)`);
    console.log(`  Duplicates after migration: ${verifyDup[0]?.cnt ?? 'N/A'}`);

    console.log(`  ✅ ${name} migrated successfully`);
    console.log(`  Old table kept as: ${backupName}`);
    console.log(`  Drop when confident: DROP TABLE ${DB}.${backupName};`);
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('=== SUMMARY ===');
  console.log(`${'='.repeat(60)}`);
  console.log('Tables migrated:');
  for (const t of tables) {
    console.log(`  ✅ ${t.name} -> ReplacingMergeTree`);
    console.log(`     ORDER BY ${t.orderBy}`);
    console.log(`     Old table: ${t.name}_old`);
  }
  console.log('\nRun DROP TABLE when confident:');
  for (const t of tables) {
    console.log(`  DROP TABLE ${DB}.${t.name}_old;`);
  }

  await client.close();
}

run().catch((err) => { console.error(err); process.exit(1); });
