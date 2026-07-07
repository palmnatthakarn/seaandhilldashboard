import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import pg from 'pg';
import { createClient } from '@clickhouse/client';

// Return DATE columns as raw 'YYYY-MM-DD' strings — avoids the pg driver's
// default JS Date parsing, which applies local-timezone midnight and shifts
// the calendar day when later serialized via toISOString() on a non-UTC host.
pg.types.setTypeParser(1082, (val) => val);

const { Client } = pg;

const BRANCHES = [
  { db: 'changsiamcompany_2569', sync: 'b000', name: 'บริษัท ช้าง สยาม กัมปนี จำกัด' },
  { db: 'changsiamruay_2569', sync: 'b001', name: 'บริษัท ช้างสยามรวย จำกัด' },
  { db: 'changsupthawee_2569', sync: 'b002', name: 'บริษัท ช้าง ทรัพย์ ทวี จำกัด' },
  { db: 'chaothalayheha_2569', sync: 'b003', name: 'บริษัท ชาวทะเลเฮฮา จำกัด' },
  { db: 'deejingjung_2569', sync: 'b004', name: 'บริษัท ดีจิงจัง 5665 จำกัด' },
  { db: 'homhug_2569', sync: 'b005', name: 'บริษัท ฮอมฮัก จำกัด' },
];

function accountType(code) {
  const p = (code || '').charAt(0);
  return { '1': 'ASSETS', '2': 'LIABILITIES', '3': 'EQUITY', '4': 'INCOME', '5': 'EXPENSES' }[p] || '';
}

async function main() {
  const version = Date.now(); // lower than any future real ts_ms from ongoing CDC
  const ch = createClient({
    url: process.env.CLICKHOUSE_HOST,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    database: process.env.CLICKHOUSE_DB,
  });

  let totalInserted = 0;

  for (const branch of BRANCHES) {
    const pgClient = new Client({
      host: '147.50.69.68',
      port: 54322,
      user: 'postgres',
      password: 'seaandhill',
      database: branch.db,
    });
    await pgClient.connect();

    const { rows } = await pgClient.query(`
      SELECT doc_date, doc_no, period_number, account_year, book_code, account_code, account_name,
             debit, credit, branch_code, line_number
      FROM gl_journal_detail
    `);
    await pgClient.end();

    const chRows = rows.map((r) => ({
      doc_datetime: r.doc_date ? `${r.doc_date} 00:00:00` : '1970-01-01 00:00:00',
      doc_no: r.doc_no || '',
      period_number: r.period_number == null ? '' : String(r.period_number),
      account_year: r.account_year == null ? '' : String(r.account_year),
      book_code: r.book_code || '',
      book_name: '',
      account_code: r.account_code || '',
      account_name: r.account_name || '',
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      account_type: accountType(r.account_code),
      branch_code: r.branch_code || '',
      branch_name: '',
      branch_sync: branch.sync,
      branch_sync_name: branch.name,
      line_number: r.line_number == null ? 0 : Number(r.line_number),
      _version: version,
    }));

    if (chRows.length > 0) {
      await ch.insert({
        table: 'journal_transaction_detail_v3',
        values: chRows,
        format: 'JSONEachRow',
      });
    }

    console.log(`${branch.sync} (${branch.db}): inserted ${chRows.length} rows`);
    totalInserted += chRows.length;
  }

  console.log(`Total inserted: ${totalInserted}`);
  await ch.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
