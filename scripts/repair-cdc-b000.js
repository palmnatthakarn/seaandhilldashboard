const { Client: PgClient } = require('pg');
const {
  branchNameExpr,
  branchSyncExpr,
  createClickHouse,
  queryRows,
  readConfig,
} = require('./cdc-clickhouse-utils');

const APPLY = process.argv.includes('--apply');
const SKIP_MV = process.argv.includes('--skip-mv');
const CLICKHOUSE_CONFIG_ARG = process.argv.slice(2).find((arg) => arg.startsWith('--clickhouse-config='));
let BRANCH_SYNC = 'b000';
const BRANCH_NAME = 'บริษัท ช้าง สยาม กัมปนี จำกัด';

let FROM_DATE = '2024-01-01';
let TO_DATE = '2027-12-31';
let ACTIVE_BRANCH_NAME = BRANCH_NAME;

const TARGETS = [
  'purchase_transaction',
  'purchase_transaction_detail',
  'saleinvoice_transaction',
  'saleinvoice_transaction_detail',
  'stock_transaction',
  'payment_transaction',
  'journal_transaction_detail',
];

const DETAIL_DIMENSION_COLUMNS = `
  item_brand_code String, item_brand_name String, item_pattern_code String, item_pattern_name String,
  item_design_code String, item_design_name String, item_grade_code String, item_grade_name String,
  item_model_code String, item_model_name String, item_category_code String, item_category_name String,
  item_class_code String, item_class_name String, group_main_code String, group_main_name String,
  group_sub_code String, group_sub_name String, group_sub2_code String, group_sub2_name String
`;

const DETAIL_DIMENSION_SELECT = `
  ifNull(im.item_brand_code, '') AS item_brand_code,
  ifNull(im.item_brand_name, '') AS item_brand_name,
  JSONExtractString(r.raw_data, 'payload', 'after', 'ic_pattern') AS item_pattern_code,
  '' AS item_pattern_name,
  '' AS item_design_code,
  '' AS item_design_name,
  '' AS item_grade_code,
  '' AS item_grade_name,
  '' AS item_model_code,
  '' AS item_model_name,
  ifNull(im.item_category_code, '') AS item_category_code,
  ifNull(im.item_category_name, '') AS item_category_name,
  '' AS item_class_code,
  '' AS item_class_name,
  ifNull(im.group_main_code, '') AS group_main_code,
  ifNull(im.group_main_name, '') AS group_main_name,
  ifNull(im.group_sub_code, '') AS group_sub_code,
  ifNull(im.group_sub_name, '') AS group_sub_name,
  ifNull(im.group_sub2_code, '') AS group_sub2_code,
  ifNull(im.group_sub2_name, '') AS group_sub2_name
`;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dt(value) {
  if (!value) return '1970-01-01 00:00:00';
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]} ${match[4] || '00'}:${match[5] || '00'}:${match[6] || '00'}`;
    }
  }
  const d = value instanceof Date ? value : new Date(value);
  return [
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
  ].join(' ');
}

function s(value) {
  return value === null || value === undefined ? '' : String(value);
}

function n(value) {
  return value === null || value === undefined || value === '' ? 0 : Number(value);
}

function statusCancel(row) {
  return row.is_cancel === true || row.is_cancel === 1 || row.is_cancel === '1' ? 'Cancel' : '';
}

function paymentStatus(row) {
  const total = n(row.total_amount);
  const paid = n(row.sum_pay_money ?? row.pay_amount ?? row.total_pay_money);
  if (paid <= 0) return 'Outstanding';
  if (paid >= total) return 'Fully Paid';
  return 'Partially Paid';
}

function docType(row) {
  return n(row.doc_type) === 1 ? 'CREDIT' : n(row.doc_type) === 0 ? 'CASH' : s(row.doc_type);
}

async function execCh(ch, sql) {
  console.log(`${APPLY ? 'EXEC' : 'DRY'}: ${sql.split('\n')[0].slice(0, 140)}`);
  if (!APPLY) return;
  await ch.command({ query: sql });
}

async function insertRows(ch, table, rows) {
  console.log(`${APPLY ? 'INSERT' : 'DRY INSERT'}: ${table} rows=${rows.length}`);
  if (!APPLY || rows.length === 0) return;
  const batchSize = 1000;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    console.log(`  batch ${Math.floor(index / batchSize) + 1}/${Math.ceil(rows.length / batchSize)} rows=${batch.length}`);
    await ch.insert({
      table,
      values: batch,
      format: 'JSONEachRow',
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMutations(ch, tables) {
  if (!APPLY) return;

  const tableList = tables.map((table) => `'${table}'`).join(', ');
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    let rows;
    try {
      rows = await queryRows(ch, `
        SELECT table, mutation_id, command
        FROM system.mutations
        WHERE database = currentDatabase()
          AND table IN (${tableList})
          AND is_done = 0
        ORDER BY create_time
      `);
    } catch (error) {
      if (!String(error?.message || error).includes('system.mutations')) throw error;
      const counts = [];
      for (const table of tables) {
        const countRows = await queryRows(ch, `
          SELECT count() AS rows
          FROM {table:Identifier}
          WHERE branch_sync = {branchSync:String}
        `, { table, branchSync: BRANCH_SYNC });
        counts.push({ table, rows: Number(countRows[0]?.rows || 0) });
      }
      const remaining = counts.filter((item) => item.rows > 0);
      if (remaining.length === 0) {
        console.log('Delete verification complete');
        return;
      }
      console.log(`Waiting for delete verification attempt=${attempt}: ${remaining.map((item) => `${item.table}=${item.rows}`).join(', ')}`);
      await sleep(5000);
      continue;
    }

    if (rows.length === 0) {
      console.log('Mutations complete');
      return;
    }

    console.log(`Waiting for ${rows.length} ClickHouse mutation(s) attempt=${attempt}`);
    await sleep(5000);
  }

  throw new Error('Timed out waiting for ClickHouse mutations to finish');
}

async function ensureItemMaster(ch) {
  await execCh(ch, `
CREATE TABLE IF NOT EXISTS item_master
(
  branch_sync String,
  branch_sync_name String,
  item_code String,
  item_name String,
  item_brand_code String,
  item_brand_name String,
  item_category_code String,
  item_category_name String,
  group_main_code String,
  group_main_name String,
  group_sub_code String,
  group_sub_name String,
  group_sub2_code String,
  group_sub2_name String,
  updated_at DateTime DEFAULT now()
)
ENGINE = MergeTree
ORDER BY (branch_sync, item_code)
`);
}

async function countPg(pg, sql) {
  const result = await pg.query(`SELECT count(*)::int AS rows FROM (${sql}) counted`);
  return result.rows[0]?.rows || 0;
}

async function pgAll(pg, sql, params = []) {
  const result = await pg.query(sql, params);
  return result.rows;
}

function mapHeader(row, kind) {
  const isPurchase = kind === 'purchase';
  return {
    doc_datetime: dt(row.doc_date),
    doc_no: s(row.doc_no),
    status_cancel: statusCancel(row),
    creator_code: s(row.creator_code),
    creator_name: '',
    pos_id: s(row.pos_id),
    supplier_code: isPurchase ? s(row.cust_code) : '',
    supplier_name: isPurchase ? s(row.supplier_name) : '',
    customer_code: isPurchase ? undefined : s(row.cust_code),
    customer_name: isPurchase ? undefined : s(row.customer_name),
    sale_code: s(row.sale_code),
    sale_name: '',
    doc_type: docType(row),
    due_date: dt(row.due_date),
    sum_point: n(row.sum_point),
    total_value: n(row.total_value),
    total_discount: n(row.total_discount),
    total_before_vat: n(row.total_before_vat),
    total_vat_value: n(row.total_vat_value),
    total_after_vat: n(row.total_after_vat),
    total_except_vat: n(row.total_except_vat),
    total_amount: n(row.total_amount),
    remark: s(row.remark),
    branch_code: s(row.branch_code),
    branch_name: '',
    department_code: s(row.department_code),
    department_name: '',
    side_code: s(row.side_code),
    side_name: '',
    project_code: s(row.project_code),
    project_name: '',
    job_code: s(row.job_code),
    job_name: '',
    allocate_code: s(row.allocate_code),
    allocate_name: '',
    billing_no_array: '',
    sum_pay_money: n(row.pay_amount ?? row.total_pay_money),
    status_payment: paymentStatus(row),
    branch_sync: BRANCH_SYNC,
    branch_sync_name: ACTIVE_BRANCH_NAME,
  };
}

function mapDetail(row) {
  return {
    doc_datetime: dt(row.doc_date),
    doc_no: s(row.doc_no),
    branch_code: s(row.branch_code),
    branch_name: '',
    item_code: s(row.item_code),
    barcode: s(row.barcode),
    item_name: s(row.item_name),
    unit_code: s(row.unit_code),
    unit_name: '',
    wh_code: s(row.wh_code),
    wh_name: '',
    shelf_code: s(row.shelf_code),
    shelf_name: '',
    qty: n(row.qty),
    price: n(row.price),
    discount_amount: n(row.discount_amount),
    sum_amount: n(row.sum_amount),
    sum_of_cost: n(row.sum_of_cost),
    average_cost: n(row.average_cost),
    stand_value: n(row.stand_value),
    divide_value: n(row.divide_value),
    tax_type: s(row.tax_type),
    item_brand_code: s(row.item_brand_code),
    item_brand_name: s(row.item_brand_name),
    item_pattern_code: s(row.ic_pattern || row.item_pattern_code),
    item_pattern_name: '',
    item_design_code: '',
    item_design_name: '',
    item_grade_code: '',
    item_grade_name: '',
    item_model_code: '',
    item_model_name: '',
    item_category_code: s(row.item_category_code),
    item_category_name: s(row.item_category_name),
    item_class_code: '',
    item_class_name: '',
    group_main_code: s(row.group_main_code),
    group_main_name: s(row.group_main_name),
    group_sub_code: s(row.group_sub_code),
    group_sub_name: s(row.group_sub_name),
    group_sub2_code: s(row.group_sub2_code),
    group_sub2_name: s(row.group_sub2_name),
    description: s(row.remark),
    status_cancel: statusCancel(row),
    branch_sync: BRANCH_SYNC,
    branch_sync_name: ACTIVE_BRANCH_NAME,
  };
}

function mapStock(row) {
  const signedQty = n(row.qty) * (n(row.calc_flag) || 1);
  return {
    item_code: s(row.item_code),
    item_name: s(row.item_name),
    doc_datetime: dt(row.doc_date),
    doc_no: s(row.doc_no),
    doc_type: s(row.trans_flag),
    ic_unit_code: s(row.unit_code),
    ic_unit_name: '',
    wh_code: s(row.wh_code),
    wh_name: '',
    shelf_code: s(row.shelf_code),
    shelf_name: '',
    calc_type: s(row.calc_flag),
    qty: signedQty,
    cost: n(row.average_cost || row.sum_of_cost),
    amount: n(row.sum_amount || row.sum_of_cost) * (signedQty < 0 ? -1 : 1),
    item_brand_code: s(row.item_brand_code),
    item_brand_name: s(row.item_brand_name),
    item_pattern_code: s(row.ic_pattern || row.item_pattern_code),
    item_pattern_name: '',
    item_design_code: '',
    item_design_name: '',
    item_grade_code: '',
    item_grade_name: '',
    item_model_code: '',
    item_model_name: '',
    item_category_code: s(row.item_category_code),
    item_category_name: s(row.item_category_name),
    item_class_code: '',
    item_class_name: '',
    group_main_code: s(row.group_main_code),
    group_main_name: s(row.group_main_name),
    group_sub_code: s(row.group_sub_code),
    group_sub_name: s(row.group_sub_name),
    group_sub2_code: s(row.group_sub2_code),
    group_sub2_name: s(row.group_sub2_name),
    branch_sync: BRANCH_SYNC,
    branch_sync_name: ACTIVE_BRANCH_NAME,
  };
}

function mapItemMaster(row) {
  return {
    branch_sync: BRANCH_SYNC,
    branch_sync_name: ACTIVE_BRANCH_NAME,
    item_code: s(row.item_code),
    item_name: s(row.item_name),
    item_brand_code: s(row.item_brand_code),
    item_brand_name: s(row.item_brand_name),
    item_category_code: s(row.item_category_code),
    item_category_name: s(row.item_category_name),
    group_main_code: s(row.group_main_code),
    group_main_name: s(row.group_main_name),
    group_sub_code: s(row.group_sub_code),
    group_sub_name: s(row.group_sub_name),
    group_sub2_code: s(row.group_sub2_code),
    group_sub2_name: s(row.group_sub2_name),
  };
}

function mapPayment(row) {
  return {
    branch_sync: BRANCH_SYNC,
    branch_sync_name: ACTIVE_BRANCH_NAME,
    doc_datetime: dt(row.doc_date),
    doc_no: s(row.doc_no),
    status_cancel: statusCancel(row),
    doc_type: s(row.doc_type),
    pay_type: n(row.trans_flag) === 19 ? 'out' : [235, 239].includes(n(row.trans_flag)) ? 'in' : 'out',
    debtor_creditor_type: n(row.trans_flag) === 19 ? 'SUPPLIER' : [235, 239].includes(n(row.trans_flag)) ? 'CUSTOMER' : 'OTHER',
    debtor_creditor_name: s(row.debtor_creditor_name || row.supplier_name || row.customer_name || row.cust_code),
    total_amount: n(row.amount || row.total_amount),
    other_charge_amount: 0,
    total_credit_charge: 0,
    total_net_amount: n(row.total_net_value || row.amount),
    cash_amount: n(row.sum_pay_money_cash),
    rounding_amount: 0,
    petty_cash_amount: 0,
    deposit_amount: 0,
    total_tax_at_pay: n(row.total_pay_tax),
    cheque_amount: n(row.sum_pay_money_chq),
    transfer_amount: n(row.sum_pay_money_transfer),
    card_amount: n(row.sum_pay_money_credit),
    coupon_amount: 0,
    point_amount: 0,
    discount_amount: n(row.total_discount),
    other_payment_amount: 0,
    wallet_amount: 0,
    total_amount_pay: n(row.total_pay_money),
    branch_code: s(row.branch_code),
    branch_name: '',
    department_code: s(row.department_code),
    department_name: '',
    side_code: s(row.side_code),
    side_name: '',
    project_code: s(row.project_code),
    project_name: '',
    job_code: s(row.job_code),
    job_name: '',
    allocate_code: s(row.allocate_code),
    allocate_name: '',
  };
}

function deriveAccountType(accountCode) {
  const prefix = s(accountCode).charAt(0);
  if (prefix === '1') return 'ASSETS';
  if (prefix === '2') return 'LIABILITIES';
  if (prefix === '3') return 'EQUITY';
  if (prefix === '4') return 'INCOME';
  if (prefix === '5') return 'EXPENSES';
  return s(accountCode ? '' : '');
}

function mapJournal(row) {
  const accountCode = s(row.account_code);
  return {
    doc_datetime: dt(row.doc_date),
    doc_no: s(row.doc_no),
    period_number: s(row.period_number),
    account_year: s(row.account_year),
    book_code: s(row.book_code),
    book_name: '',
    account_code: accountCode,
    account_name: s(row.account_name),
    debit: n(row.debit),
    credit: n(row.credit),
    account_type: s(row.account_type) || deriveAccountType(accountCode),
    branch_code: s(row.branch_code),
    branch_name: '',
    branch_sync: BRANCH_SYNC,
    branch_sync_name: ACTIVE_BRANCH_NAME,
  };
}

function detailRawSource() {
  return `
FROM
(
  SELECT
    raw_data,
    _topic,
    ${branchSyncExpr()} AS branch_sync_value,
    ${branchNameExpr()} AS branch_sync_name_value,
    JSONExtractString(raw_data, 'payload', 'after', 'item_code') AS item_code_value
  FROM ic_trans_detail_raw
) AS r
LEFT JOIN item_master im
  ON im.branch_sync = r.branch_sync_value
 AND im.item_code = r.item_code_value
`;
}

function createDetailMvSql(mvName, targetTable, transType) {
  return `
CREATE MATERIALIZED VIEW ${mvName} TO ${targetTable}
(
  doc_datetime DateTime,
  doc_no String,
  branch_code String,
  branch_name String,
  item_code String,
  barcode String,
  item_name String,
  unit_code String,
  unit_name String,
  wh_code String,
  wh_name String,
  shelf_code String,
  shelf_name String,
  qty Float64,
  price Float64,
  discount_amount Float64,
  sum_amount Float64,
  sum_of_cost Float64,
  average_cost Float64,
  stand_value Float64,
  divide_value Float64,
  tax_type String,
  ${DETAIL_DIMENSION_COLUMNS},
  description String,
  status_cancel String,
  branch_sync String,
  branch_sync_name String
) AS
SELECT
  toDateTime(toDate(JSONExtractInt(r.raw_data, 'payload', 'after', 'doc_date'))) AS doc_datetime,
  JSONExtractString(r.raw_data, 'payload', 'after', 'doc_no') AS doc_no,
  JSONExtractString(r.raw_data, 'payload', 'after', 'branch_code') AS branch_code,
  '' AS branch_name,
  r.item_code_value AS item_code,
  JSONExtractString(r.raw_data, 'payload', 'after', 'barcode') AS barcode,
  JSONExtractString(r.raw_data, 'payload', 'after', 'item_name') AS item_name,
  JSONExtractString(r.raw_data, 'payload', 'after', 'unit_code') AS unit_code,
  '' AS unit_name,
  JSONExtractString(r.raw_data, 'payload', 'after', 'wh_code') AS wh_code,
  '' AS wh_name,
  JSONExtractString(r.raw_data, 'payload', 'after', 'shelf_code') AS shelf_code,
  '' AS shelf_name,
  JSONExtractFloat(r.raw_data, 'payload', 'after', 'qty') AS qty,
  JSONExtractFloat(r.raw_data, 'payload', 'after', 'price') AS price,
  JSONExtractFloat(r.raw_data, 'payload', 'after', 'discount_amount') AS discount_amount,
  JSONExtractFloat(r.raw_data, 'payload', 'after', 'sum_amount') AS sum_amount,
  JSONExtractFloat(r.raw_data, 'payload', 'after', 'sum_of_cost') AS sum_of_cost,
  JSONExtractFloat(r.raw_data, 'payload', 'after', 'average_cost') AS average_cost,
  JSONExtractFloat(r.raw_data, 'payload', 'after', 'stand_value') AS stand_value,
  JSONExtractFloat(r.raw_data, 'payload', 'after', 'divide_value') AS divide_value,
  multiIf(JSONExtractInt(r.raw_data, 'payload', 'after', 'tax_type') = 1, 'VAT', JSONExtractInt(r.raw_data, 'payload', 'after', 'tax_type') = 2, 'EXCEPTVAT', 'VAT') AS tax_type,
  ${DETAIL_DIMENSION_SELECT},
  JSONExtractString(r.raw_data, 'payload', 'after', 'remark') AS description,
  if(JSONExtractInt(r.raw_data, 'payload', 'after', 'status') = 1, 'Cancel', '') AS status_cancel,
  r.branch_sync_value AS branch_sync,
  r.branch_sync_name_value AS branch_sync_name
${detailRawSource()}
WHERE JSONExtractString(r.raw_data, 'payload', 'op') IN ('c', 'r')
  AND JSONExtractInt(r.raw_data, 'payload', 'after', 'trans_type') = ${transType}
`;
}

function createStockMvSql() {
  return `
CREATE MATERIALIZED VIEW ic_trans_detail_to_stock_mv TO stock_transaction
(
  item_code String, item_name String, doc_datetime DateTime, doc_no String, doc_type String,
  ic_unit_code String, ic_unit_name String, wh_code String, wh_name String, shelf_code String, shelf_name String,
  calc_type String, qty Float64, cost Float64, amount Float64,
  ${DETAIL_DIMENSION_COLUMNS},
  branch_sync String, branch_sync_name String
) AS
SELECT
  r.item_code_value AS item_code,
  JSONExtractString(r.raw_data, 'payload', 'after', 'item_name') AS item_name,
  toDateTime(toDate(JSONExtractInt(r.raw_data, 'payload', 'after', 'doc_date'))) AS doc_datetime,
  JSONExtractString(r.raw_data, 'payload', 'after', 'doc_no') AS doc_no,
  toString(JSONExtractInt(r.raw_data, 'payload', 'after', 'trans_flag')) AS doc_type,
  JSONExtractString(r.raw_data, 'payload', 'after', 'unit_code') AS ic_unit_code,
  '' AS ic_unit_name,
  JSONExtractString(r.raw_data, 'payload', 'after', 'wh_code') AS wh_code,
  '' AS wh_name,
  JSONExtractString(r.raw_data, 'payload', 'after', 'shelf_code') AS shelf_code,
  '' AS shelf_name,
  toString(JSONExtractInt(r.raw_data, 'payload', 'after', 'calc_flag')) AS calc_type,
  JSONExtractFloat(r.raw_data, 'payload', 'after', 'qty') * if(JSONExtractInt(r.raw_data, 'payload', 'after', 'calc_flag') = 0, 1, JSONExtractInt(r.raw_data, 'payload', 'after', 'calc_flag')) AS qty,
  JSONExtractFloat(r.raw_data, 'payload', 'after', 'average_cost') AS cost,
  JSONExtractFloat(r.raw_data, 'payload', 'after', 'sum_amount') * if(JSONExtractInt(r.raw_data, 'payload', 'after', 'calc_flag') < 0, -1, 1) AS amount,
  ${DETAIL_DIMENSION_SELECT},
  r.branch_sync_value AS branch_sync,
  r.branch_sync_name_value AS branch_sync_name
${detailRawSource()}
WHERE JSONExtractString(r.raw_data, 'payload', 'op') IN ('c', 'r')
  AND JSONExtractFloat(r.raw_data, 'payload', 'after', 'qty') != 0
  AND JSONExtractInt(r.raw_data, 'payload', 'after', 'trans_type') IN (1, 2, 3)
`;
}

async function fixMaterializedViews(ch) {
  await ensureItemMaster(ch);
  await execCh(ch, 'DROP TABLE IF EXISTS ap_ar_trans_to_payment_mv');
  await execCh(ch, `
CREATE MATERIALIZED VIEW ap_ar_trans_to_payment_mv TO payment_transaction
(
  branch_sync String,
  branch_sync_name String,
  doc_datetime DateTime,
  doc_no String,
  status_cancel String,
  doc_type String,
  pay_type String,
  debtor_creditor_type String,
  debtor_creditor_name String,
  total_amount Float64,
  other_charge_amount Float64,
  total_credit_charge Float64,
  total_net_amount Float64,
  cash_amount Float64,
  rounding_amount Float64,
  petty_cash_amount Float64,
  deposit_amount Float64,
  total_tax_at_pay Float64,
  cheque_amount Float64,
  transfer_amount Float64,
  card_amount Float64,
  coupon_amount Float64,
  point_amount Float64,
  discount_amount Float64,
  other_payment_amount Float64,
  wallet_amount Float64,
  total_amount_pay Float64,
  branch_code String,
  branch_name String,
  department_code String,
  department_name String,
  side_code String,
  side_name String,
  project_code String,
  project_name String,
  job_code String,
  job_name String,
  allocate_code String,
  allocate_name String
) AS
SELECT
  ${branchSyncExpr()} AS branch_sync,
  ${branchNameExpr()} AS branch_sync_name,
  toDateTime(toDate(JSONExtractInt(raw_data, 'payload', 'after', 'doc_date'))) AS doc_datetime,
  JSONExtractString(raw_data, 'payload', 'after', 'doc_no') AS doc_no,
  if(JSONExtractString(raw_data, 'payload', 'after', 'is_cancel') IN ('true', '1'), 'Cancel', '') AS status_cancel,
  JSONExtractString(raw_data, 'payload', 'after', 'doc_type') AS doc_type,
  multiIf(JSONExtractInt(raw_data, 'payload', 'after', 'trans_flag') = 19, 'out', JSONExtractInt(raw_data, 'payload', 'after', 'trans_flag') IN (235, 239), 'in', 'out') AS pay_type,
  multiIf(JSONExtractInt(raw_data, 'payload', 'after', 'trans_flag') = 19, 'SUPPLIER', JSONExtractInt(raw_data, 'payload', 'after', 'trans_flag') IN (235, 239), 'CUSTOMER', 'OTHER') AS debtor_creditor_type,
  JSONExtractString(raw_data, 'payload', 'after', 'cust_code') AS debtor_creditor_name,
  JSONExtractFloat(raw_data, 'payload', 'after', 'amount') AS total_amount,
  0 AS other_charge_amount,
  0 AS total_credit_charge,
  JSONExtractFloat(raw_data, 'payload', 'after', 'total_net_value') AS total_net_amount,
  JSONExtractFloat(raw_data, 'payload', 'after', 'sum_pay_money_cash') AS cash_amount,
  0 AS rounding_amount,
  0 AS petty_cash_amount,
  0 AS deposit_amount,
  JSONExtractFloat(raw_data, 'payload', 'after', 'total_pay_tax') AS total_tax_at_pay,
  JSONExtractFloat(raw_data, 'payload', 'after', 'sum_pay_money_chq') AS cheque_amount,
  JSONExtractFloat(raw_data, 'payload', 'after', 'sum_pay_money_transfer') AS transfer_amount,
  JSONExtractFloat(raw_data, 'payload', 'after', 'sum_pay_money_credit') AS card_amount,
  0 AS coupon_amount,
  0 AS point_amount,
  JSONExtractFloat(raw_data, 'payload', 'after', 'total_discount') AS discount_amount,
  0 AS other_payment_amount,
  0 AS wallet_amount,
  JSONExtractFloat(raw_data, 'payload', 'after', 'total_pay_money') AS total_amount_pay,
  JSONExtractString(raw_data, 'payload', 'after', 'branch_code') AS branch_code,
  '' AS branch_name,
  JSONExtractString(raw_data, 'payload', 'after', 'department_code') AS department_code,
  '' AS department_name,
  JSONExtractString(raw_data, 'payload', 'after', 'side_code') AS side_code,
  '' AS side_name,
  JSONExtractString(raw_data, 'payload', 'after', 'project_code') AS project_code,
  '' AS project_name,
  JSONExtractString(raw_data, 'payload', 'after', 'job_code') AS job_code,
  '' AS job_name,
  JSONExtractString(raw_data, 'payload', 'after', 'allocate_code') AS allocate_code,
  '' AS allocate_name
FROM ap_ar_trans_queue
WHERE JSONExtractString(raw_data, 'payload', 'op') IN ('c', 'r')
`);

  await execCh(ch, 'DROP TABLE IF EXISTS gl_journal_to_journal_mv');
  const accountCodeExpr = "JSONExtractString(raw_data, 'payload', 'after', 'account_code')";
  await execCh(ch, `
CREATE MATERIALIZED VIEW gl_journal_to_journal_mv TO journal_transaction_detail
(
  doc_datetime DateTime,
  doc_no String,
  period_number String,
  account_year String,
  book_code String,
  book_name String,
  account_code String,
  account_name String,
  debit Float64,
  credit Float64,
  account_type String,
  branch_code String,
  branch_name String,
  branch_sync LowCardinality(String),
  branch_sync_name String
) AS
SELECT
  toDateTime(toDate(JSONExtractInt(raw_data, 'payload', 'after', 'doc_date'))) AS doc_datetime,
  JSONExtractString(raw_data, 'payload', 'after', 'doc_no') AS doc_no,
  JSONExtractString(raw_data, 'payload', 'after', 'period_number') AS period_number,
  JSONExtractString(raw_data, 'payload', 'after', 'account_year') AS account_year,
  JSONExtractString(raw_data, 'payload', 'after', 'book_code') AS book_code,
  '' AS book_name,
  ${accountCodeExpr} AS account_code,
  JSONExtractString(raw_data, 'payload', 'after', 'account_name') AS account_name,
  JSONExtractFloat(raw_data, 'payload', 'after', 'debit') AS debit,
  JSONExtractFloat(raw_data, 'payload', 'after', 'credit') AS credit,
  multiIf(
    JSONExtractString(raw_data, 'payload', 'after', 'account_type') != '',
      JSONExtractString(raw_data, 'payload', 'after', 'account_type'),
    left(${accountCodeExpr}, 1) = '1', 'ASSETS',
    left(${accountCodeExpr}, 1) = '2', 'LIABILITIES',
    left(${accountCodeExpr}, 1) = '3', 'EQUITY',
    left(${accountCodeExpr}, 1) = '4', 'INCOME',
    left(${accountCodeExpr}, 1) = '5', 'EXPENSES',
    ''
  ) AS account_type,
  JSONExtractString(raw_data, 'payload', 'after', 'branch_code') AS branch_code,
  '' AS branch_name,
  ${branchSyncExpr()} AS branch_sync,
  ${branchNameExpr()} AS branch_sync_name
FROM gl_journal_detail_queue
WHERE JSONExtractString(raw_data, 'payload', 'op') IN ('c', 'r')
`);

  await execCh(ch, 'DROP TABLE IF EXISTS ic_trans_detail_to_purchase_detail_mv');
  await execCh(ch, 'DROP TABLE IF EXISTS ic_trans_detail_to_sale_detail_mv');
  await execCh(ch, 'DROP TABLE IF EXISTS ic_trans_detail_to_stock_mv');
  await execCh(ch, createDetailMvSql('ic_trans_detail_to_purchase_detail_mv', 'purchase_transaction_detail', 1));
  await execCh(ch, createDetailMvSql('ic_trans_detail_to_sale_detail_mv', 'saleinvoice_transaction_detail', 2));
  await execCh(ch, createStockMvSql());
}

async function refreshB000(pg, ch) {
  for (const table of TARGETS) {
    await execCh(ch, `ALTER TABLE ${table} DELETE WHERE branch_sync = '${BRANCH_SYNC}'`);
  }
  await execCh(ch, `ALTER TABLE item_master DELETE WHERE branch_sync = '${BRANCH_SYNC}'`);
  if (BRANCH_SYNC === 'b000') {
    await execCh(ch, `ALTER TABLE payment_transaction DELETE WHERE branch_sync = ''`);
  }
  await waitForMutations(ch, [...TARGETS, 'item_master']);

  const headerSql = `
    SELECT
      t.*,
      ap.name_1 AS supplier_name,
      ar.name_1 AS customer_name
    FROM ic_trans t
    LEFT JOIN ap_supplier ap ON ap.code = t.cust_code
    LEFT JOIN ar_customer ar ON ar.code = t.cust_code
    WHERE t.doc_date >= '${FROM_DATE}' AND t.doc_date <= '${TO_DATE}'
  `;
  const detailSql = `
    SELECT
      d.*,
      inv.item_brand AS item_brand_code,
      brand.name_1 AS item_brand_name,
      inv.item_category AS item_category_code,
      cat.name_1 AS item_category_name,
      inv.group_main AS group_main_code,
      grp.name_1 AS group_main_name,
      inv.group_sub AS group_sub_code,
      grp_sub.name_1 AS group_sub_name,
      inv.group_sub2 AS group_sub2_code,
      grp_sub2.name_1 AS group_sub2_name
    FROM ic_trans_detail d
    LEFT JOIN ic_inventory inv ON inv.code = d.item_code
    LEFT JOIN ic_brand brand ON brand.code = inv.item_brand
    LEFT JOIN ic_category cat ON cat.code = inv.item_category
    LEFT JOIN ic_group grp ON grp.code = inv.group_main
    LEFT JOIN ic_group_sub grp_sub ON grp_sub.code = inv.group_sub AND grp_sub.main_group = inv.group_main
    LEFT JOIN ic_group_sub2 grp_sub2 ON grp_sub2.code = inv.group_sub2 AND grp_sub2.ic_group_sub_code = inv.group_sub
    WHERE d.doc_date >= '${FROM_DATE}' AND d.doc_date <= '${TO_DATE}'
  `;
  const itemMasterSql = `
    SELECT
      inv.code AS item_code,
      inv.name_1 AS item_name,
      inv.item_brand AS item_brand_code,
      brand.name_1 AS item_brand_name,
      inv.item_category AS item_category_code,
      cat.name_1 AS item_category_name,
      inv.group_main AS group_main_code,
      grp.name_1 AS group_main_name,
      inv.group_sub AS group_sub_code,
      grp_sub.name_1 AS group_sub_name,
      inv.group_sub2 AS group_sub2_code,
      grp_sub2.name_1 AS group_sub2_name
    FROM ic_inventory inv
    LEFT JOIN ic_brand brand ON brand.code = inv.item_brand
    LEFT JOIN ic_category cat ON cat.code = inv.item_category
    LEFT JOIN ic_group grp ON grp.code = inv.group_main
    LEFT JOIN ic_group_sub grp_sub ON grp_sub.code = inv.group_sub AND grp_sub.main_group = inv.group_main
    LEFT JOIN ic_group_sub2 grp_sub2 ON grp_sub2.code = inv.group_sub2 AND grp_sub2.ic_group_sub_code = inv.group_sub
  `;
  const paymentSql = `
    SELECT
      p.*,
      ap.name_1 AS supplier_name,
      ar.name_1 AS customer_name,
      COALESCE(ap.name_1, ar.name_1, p.cust_code) AS debtor_creditor_name
    FROM ap_ar_trans p
    LEFT JOIN ap_supplier ap ON ap.code = p.cust_code
    LEFT JOIN ar_customer ar ON ar.code = p.cust_code
    WHERE p.doc_date >= '${FROM_DATE}' AND p.doc_date <= '${TO_DATE}'
  `;
  const journalSql = `SELECT * FROM gl_journal_detail WHERE doc_date >= '${FROM_DATE}' AND doc_date <= '${TO_DATE}'`;

  if (!APPLY) {
    console.log('\nDry-run source counts:');
    console.log(`purchase_transaction: ${await countPg(pg, `${headerSql} AND trans_type = 1`)}`);
    console.log(`saleinvoice_transaction: ${await countPg(pg, `${headerSql} AND trans_type = 2`)}`);
    console.log(`purchase_transaction_detail: ${await countPg(pg, `${detailSql} AND trans_type = 1`)}`);
    console.log(`saleinvoice_transaction_detail: ${await countPg(pg, `${detailSql} AND trans_type = 2`)}`);
    console.log(`stock_transaction: ${await countPg(pg, `${detailSql} AND trans_type IN (1, 2, 3) AND qty <> 0`)}`);
    console.log(`payment_transaction: ${await countPg(pg, paymentSql)}`);
    console.log(`journal_transaction_detail: ${await countPg(pg, journalSql)}`);
    console.log(`item_master: ${await countPg(pg, itemMasterSql)}`);
    return;
  }

  const itemMaster = await pgAll(pg, itemMasterSql);
  await insertRows(ch, 'item_master', itemMaster.map(mapItemMaster));

  const headers = await pgAll(pg, headerSql);
  await insertRows(ch, 'purchase_transaction', headers.filter((r) => n(r.trans_type) === 1).map((r) => {
    const row = mapHeader(r, 'purchase');
    delete row.customer_code;
    delete row.customer_name;
    return row;
  }));
  await insertRows(ch, 'saleinvoice_transaction', headers.filter((r) => n(r.trans_type) === 2).map((r) => {
    const row = mapHeader(r, 'sale');
    delete row.supplier_code;
    delete row.supplier_name;
    return row;
  }));

  const details = await pgAll(pg, detailSql);
  await insertRows(ch, 'purchase_transaction_detail', details.filter((r) => n(r.trans_type) === 1).map(mapDetail));
  await insertRows(ch, 'saleinvoice_transaction_detail', details.filter((r) => n(r.trans_type) === 2).map(mapDetail));
  await insertRows(ch, 'stock_transaction', details.filter((r) => n(r.qty) !== 0 && [1, 2, 3].includes(n(r.trans_type))).map(mapStock));

  const payments = await pgAll(pg, paymentSql);
  await insertRows(ch, 'payment_transaction', payments.map(mapPayment));

  const journals = await pgAll(pg, journalSql);
  await insertRows(ch, 'journal_transaction_detail', journals.map(mapJournal));
}

async function printVerification(ch) {
  const rows = await queryRows(ch, `
    SELECT *
    FROM (
      SELECT 'purchase_transaction' AS table_name, count() AS rows FROM purchase_transaction WHERE branch_sync = '${BRANCH_SYNC}'
      UNION ALL SELECT 'purchase_transaction_detail' AS table_name, count() AS rows FROM purchase_transaction_detail WHERE branch_sync = '${BRANCH_SYNC}'
      UNION ALL SELECT 'saleinvoice_transaction' AS table_name, count() AS rows FROM saleinvoice_transaction WHERE branch_sync = '${BRANCH_SYNC}'
      UNION ALL SELECT 'saleinvoice_transaction_detail' AS table_name, count() AS rows FROM saleinvoice_transaction_detail WHERE branch_sync = '${BRANCH_SYNC}'
      UNION ALL SELECT 'stock_transaction' AS table_name, count() AS rows FROM stock_transaction WHERE branch_sync = '${BRANCH_SYNC}'
      UNION ALL SELECT 'payment_transaction' AS table_name, count() AS rows FROM payment_transaction WHERE branch_sync = '${BRANCH_SYNC}'
      UNION ALL SELECT 'journal_transaction_detail' AS table_name, count() AS rows FROM journal_transaction_detail WHERE branch_sync = '${BRANCH_SYNC}'
    )
    ORDER BY table_name
  `);
  console.log('\nVerification counts:');
  for (const row of rows) console.log(`${row.table_name}: ${row.rows}`);
}

async function main() {
  const configPath = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  const { data: config } = readConfig(configPath);
  if (CLICKHOUSE_CONFIG_ARG) {
    const clickhouseConfigPath = CLICKHOUSE_CONFIG_ARG.split('=').slice(1).join('=');
    const { data: clickhouseConfig } = readConfig(clickhouseConfigPath);
    config.clickhouse = clickhouseConfig.clickhouse;
  }
  BRANCH_SYNC = config.transfer?.branch_sync || BRANCH_SYNC;
  ACTIVE_BRANCH_NAME = config.transfer?.branch_sync_name || BRANCH_NAME;
  FROM_DATE = config.transfer?.date_range_from || FROM_DATE;
  TO_DATE = config.transfer?.date_range_to || TO_DATE;

  const pg = new PgClient({
    host: config.postgres.host,
    port: config.postgres.port,
    user: config.postgres.user,
    password: config.postgres.password,
    database: config.postgres.database,
    connectionTimeoutMillis: 30000,
  });
  const ch = createClickHouse(config);

  console.log(APPLY ? 'APPLY MODE' : 'DRY RUN MODE - pass --apply to change ClickHouse');
  console.log(`branch_sync=${BRANCH_SYNC}`);
  console.log(`postgres_db=${config.postgres.database}`);
  console.log(`date_range=${FROM_DATE} -> ${TO_DATE}`);
  await pg.connect();
  try {
    if (SKIP_MV) {
      console.log('SKIP MV repair');
    } else {
      await fixMaterializedViews(ch);
    }
    await refreshB000(pg, ch);
    await printVerification(ch);
  } finally {
    await pg.end();
    await ch.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
