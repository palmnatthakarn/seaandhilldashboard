import { createClient } from '@clickhouse/client';

const client = createClient({
  url: process.env.CLICKHOUSE_HOST,
  username: 'admin',
  password: 'Admin123',
  database: 'datachangsiam',
});

async function q(query) {
  const r = await client.query({ query, format: 'JSONEachRow' });
  return r.json();
}
async function exec(query) {
  await client.command({ query });
}

const FIXES = [
  { docNo: 'CA690622-0002', erpAmount: 67686 },
  { docNo: 'CA690622-0003', erpAmount: 4925 },
  { docNo: 'CA690625-0002', erpAmount: 6495 },
];

async function main() {
  for (const { docNo, erpAmount } of FIXES) {
    const headerRows = await q(`SELECT * FROM saleinvoice_transaction WHERE branch_sync='b000' AND doc_no='${docNo}' SETTINGS final=1`);
    if (headerRows.length !== 1) {
      console.log(`SKIP ${docNo}: expected 1 header row, found ${headerRows.length}`);
      continue;
    }
    const header = headerRows[0];
    const oldTotal = Number(header.total_amount);
    const scale = erpAmount / oldTotal;
    console.log(`${docNo}: old total=${oldTotal}, new total=${erpAmount}, scale=${scale.toFixed(6)}`);

    const detailRows = await q(`SELECT * FROM saleinvoice_transaction_detail WHERE branch_sync='b000' AND doc_no='${docNo}' SETTINGS final=1`);
    console.log(`  ${detailRows.length} detail rows to scale`);

    // update header total_amount (and related value fields) to match ERP
    await exec(`
      ALTER TABLE saleinvoice_transaction UPDATE
        total_amount = ${erpAmount},
        total_value = total_value * ${scale},
        total_before_vat = total_before_vat * ${scale},
        total_vat_value = total_vat_value * ${scale},
        total_after_vat = total_after_vat * ${scale},
        total_except_vat = total_except_vat * ${scale}
      WHERE branch_sync='b000' AND doc_no='${docNo}'
    `);

    // scale each detail line's sum_amount proportionally
    await exec(`
      ALTER TABLE saleinvoice_transaction_detail UPDATE
        sum_amount = sum_amount * ${scale},
        price = price * ${scale}
      WHERE branch_sync='b000' AND doc_no='${docNo}'
    `);

    console.log(`  Updated header + ${detailRows.length} detail rows`);
  }

  console.log('\nWaiting for mutations to complete...');
  await new Promise((r) => setTimeout(r, 3000));

  for (const { docNo, erpAmount } of FIXES) {
    const check = await q(`SELECT total_amount FROM saleinvoice_transaction WHERE branch_sync='b000' AND doc_no='${docNo}' SETTINGS final=1`);
    const detailSum = await q(`SELECT sum(sum_amount) s FROM saleinvoice_transaction_detail WHERE branch_sync='b000' AND doc_no='${docNo}' SETTINGS final=1`);
    console.log(`${docNo}: header total_amount=${check[0]?.total_amount}, detail sum=${detailSum[0]?.s}, target=${erpAmount}`);
  }

  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
