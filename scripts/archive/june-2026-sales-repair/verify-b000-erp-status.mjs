import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@clickhouse/client';

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: process.env.CLICKHOUSE_USER || 'admin',
  password: process.env.CLICKHOUSE_PASSWORD,
  database: process.env.CLICKHOUSE_DB || 'datachangsiam',
});

async function q(query) {
  const r = await client.query({ query, format: 'JSONEachRow' });
  return r.json();
}

// Ground truth transcribed from ERP reports (same data reconcile-b000-june.mjs used to fix rows on 2/7)
const ERP = {
  '2026-06-20': { 'CA690620-0001': 116408, 'CA690620-0002': 100591, 'CA690620-0003': 15128, 'CT690620-0001': 89535, 'CT690620-0002': 121893, 'CT690620-0003': 27090, 'CT690620-0004': 475 },
  '2026-06-21': { 'CA690621-0001': 84158, 'CA690621-0002': 4030, 'CT690621-0001': 33716, 'CT690621-0002': 57705, 'CT690621-0003': 880 },
  '2026-06-22': { 'CA690622-0001': 16947.5, 'CA690622-0002': 67686, 'CA690622-0003': 4925, 'CT690622-0001': 26968, 'CT690622-0002': 54204, 'CT690622-0003': 1375 },
  '2026-06-23': { 'CA690623-0001': 90702, 'CA690623-0002': 6965, 'CT690623-0001': 20000, 'CT690623-0002': 25489, 'CT690623-0003': 64216, 'CT690623-0004': 1600 },
  '2026-06-24': { 'CA690624-0001': 47492, 'CA690624-0002': 27690, 'CA690624-0003': 5270, 'CT690624-0001': 30584, 'CT690624-0002': 56829, 'CT690624-0003': 445 },
  '2026-06-25': { 'CA690625-0001': 69679, 'CA690625-0002': 6495, 'CT690625-0001': 32202, 'CT690625-0002': 45227, 'CT690625-0003': 785 },
  '2026-06-26': { 'CA690626-0001': 105534, 'CA690626-0002': 96425, 'CA690626-0003': 19837, 'CT690626-0001': 104772, 'CT690626-0002': 106016, 'CT690626-0003': 32317, 'CT690626-0004': 985 },
  '2026-06-27': { 'CA690627-0001': 90595, 'CA690627-0002': 124060, 'CA690627-0003': 22058, 'CA690627-0004': 12926, 'CT690627-0001': 102043, 'CT690627-0002': 127049, 'CT690627-0003': 44310, 'CT690627-0004': 1005 },
  '2026-06-28': { 'CA690628-0001': 93274, 'CA690628-0002': 5745, 'CT690628-0001': 42447, 'CT690628-0002': 65118, 'CT690628-0003': 600 },
};

async function main() {
  const dates = Object.keys(ERP).sort();
  let allOk = true;

  console.log('=== Doc-level check: b000 vs ERP (2026-06-20 to 2026-06-28) ===\n');
  for (const date of dates) {
    const erpDocs = ERP[date];
    const chRows = await q(`SELECT doc_no, total_amount FROM saleinvoice_transaction WHERE branch_sync='b000' AND toDate(doc_datetime)='${date}' SETTINGS final=1`);
    const chMap = new Map(chRows.map((r) => [r.doc_no, Number(r.total_amount)]));

    const mismatches = [];
    for (const [docNo, erpAmount] of Object.entries(erpDocs)) {
      const chAmount = chMap.get(docNo);
      if (chAmount === undefined || Math.abs(chAmount - erpAmount) >= 0.01) {
        mismatches.push(`  MISMATCH ${docNo}: ERP=${erpAmount}, CH=${chAmount ?? 'MISSING'}`);
        allOk = false;
      }
      chMap.delete(docNo);
    }
    const extra = [...chMap.entries()].map(([docNo, amt]) => `  EXTRA ${docNo}: CH=${amt} (not in ERP list)`);
    if (extra.length) allOk = false;

    const chTotal = chRows.reduce((s, r) => s + Number(r.total_amount), 0);
    const erpTotal = Object.values(erpDocs).reduce((a, b) => a + b, 0);
    const status = mismatches.length === 0 && extra.length === 0 ? 'OK' : 'DIFF';

    console.log(`${date}: CH=${chTotal.toFixed(2)} | ERP=${erpTotal.toFixed(2)} | diff=${(chTotal - erpTotal).toFixed(2)} [${status}]`);
    mismatches.forEach((l) => console.log(l));
    extra.forEach((l) => console.log(l));
  }

  console.log('\n=== Duplicate-row scan: b000, 2026-06-20 to today (catches recurrence of the underlying bug) ===\n');
  const dupHeaders = await q(`
    SELECT doc_no, count() AS cnt
    FROM saleinvoice_transaction
    WHERE branch_sync = 'b000' AND toDate(doc_datetime) >= '2026-06-20'
    GROUP BY doc_no
    HAVING cnt > 1
    SETTINGS final = 1
  `);
  if (dupHeaders.length === 0) {
    console.log('No duplicate doc_no found in saleinvoice_transaction (post-FINAL). Good.');
  } else {
    allOk = false;
    console.log(`Found ${dupHeaders.length} duplicated doc_no:`, JSON.stringify(dupHeaders));
  }

  console.log('\n=== Daily totals, b000, 2026-06-20 to today ===\n');
  const daily = await q(`
    SELECT toDate(doc_datetime) AS d, count() AS docs, toString(sum(total_amount)) AS total
    FROM saleinvoice_transaction
    WHERE branch_sync = 'b000' AND toDate(doc_datetime) >= '2026-06-20' AND status_cancel != 'Cancel'
    GROUP BY d
    ORDER BY d
    SETTINGS final = 1
  `);
  daily.forEach((r) => console.log(`  ${r.d}: ${r.docs} docs, ${r.total} baht`));

  console.log(`\n=== RESULT: ${allOk ? 'ALL MATCH ERP, NO DUPLICATES' : 'DISCREPANCIES FOUND — see above' } ===`);

  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
