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

// ERP ground truth for branch b000, transcribed from the user's ERP report screenshots
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
  const report = { ok: [], fixed: [], missingInRaw: [], extraInCH: [] };

  for (const date of dates) {
    const erpDocs = ERP[date];
    const chRows = await q(`SELECT doc_no, total_amount FROM saleinvoice_transaction WHERE branch_sync='b000' AND toDate(doc_datetime)='${date}' SETTINGS final=1`);
    const chMap = new Map(chRows.map((r) => [r.doc_no, Number(r.total_amount)]));

    for (const [docNo, erpAmount] of Object.entries(erpDocs)) {
      const chAmount = chMap.get(docNo);
      if (chAmount !== undefined && Math.abs(chAmount - erpAmount) < 0.01) {
        report.ok.push(`${date} ${docNo} = ${erpAmount} (OK)`);
        chMap.delete(docNo);
        continue;
      }

      // need to find/fix from raw
      const rawMatches = await q(`
        SELECT JSONExtractFloat(raw_data,'payload','after','total_amount') total_amount
        FROM ic_trans_raw
        WHERE JSONExtractString(raw_data,'payload','after','doc_no')='${docNo}'
          AND extract(_topic,'branch_(\\d+)')='000'
          AND abs(JSONExtractFloat(raw_data,'payload','after','total_amount') - ${erpAmount}) < 0.01
        LIMIT 1
      `);

      if (rawMatches.length === 0) {
        report.missingInRaw.push(`${date} ${docNo}: ERP=${erpAmount}, CH=${chAmount ?? 'MISSING'}, raw event with matching amount NOT FOUND`);
        chMap.delete(docNo);
        continue;
      }

      // delete any existing wrong/stray rows for this doc, then insert the correct one from raw
      await exec(`ALTER TABLE saleinvoice_transaction DELETE WHERE branch_sync='b000' AND doc_no='${docNo}'`);
      await exec(`ALTER TABLE saleinvoice_transaction_detail DELETE WHERE branch_sync='b000' AND doc_no='${docNo}'`);

      const headerInsert = `
        INSERT INTO saleinvoice_transaction
        SELECT
          toDateTime(toDate(JSONExtractInt(raw_data, 'payload', 'after', 'doc_date'))) AS doc_datetime,
          JSONExtractString(raw_data, 'payload', 'after', 'doc_no') AS doc_no,
          JSONExtractString(raw_data, 'payload', 'after', 'creator_code') AS creator_code,
          '' AS creator_name,
          if((JSONExtractString(raw_data, 'payload', 'after', 'is_cancel') IN ('true','1')), 'Cancel', '') AS status_cancel,
          JSONExtractString(raw_data, 'payload', 'after', 'pos_id') AS pos_id,
          JSONExtractString(raw_data, 'payload', 'after', 'cust_code') AS customer_code,
          '' AS customer_name,
          JSONExtractString(raw_data, 'payload', 'after', 'sale_code') AS sale_code,
          '' AS sale_name,
          JSONExtractString(raw_data, 'payload', 'after', 'doc_type') AS doc_type,
          toDateTime(toDate(JSONExtractInt(raw_data, 'payload', 'after', 'due_date'))) AS due_date,
          JSONExtractFloat(raw_data, 'payload', 'after', 'sum_point') AS sum_point,
          JSONExtractFloat(raw_data, 'payload', 'after', 'total_value') AS total_value,
          JSONExtractFloat(raw_data, 'payload', 'after', 'total_discount') AS total_discount,
          JSONExtractFloat(raw_data, 'payload', 'after', 'total_before_vat') AS total_before_vat,
          JSONExtractFloat(raw_data, 'payload', 'after', 'total_vat_value') AS total_vat_value,
          JSONExtractFloat(raw_data, 'payload', 'after', 'total_after_vat') AS total_after_vat,
          JSONExtractFloat(raw_data, 'payload', 'after', 'total_except_vat') AS total_except_vat,
          JSONExtractFloat(raw_data, 'payload', 'after', 'total_amount') AS total_amount,
          JSONExtractString(raw_data, 'payload', 'after', 'remark') AS remark,
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
          '' AS allocate_name,
          '' AS billing_no_array,
          JSONExtractFloat(raw_data, 'payload', 'after', 'pay_amount') AS sum_pay_money,
          multiIf(JSONExtractInt(raw_data, 'payload', 'after', 'last_status') = 0, 'Outstanding', JSONExtractInt(raw_data, 'payload', 'after', 'last_status') = 1, 'Partially Paid', JSONExtractInt(raw_data, 'payload', 'after', 'last_status') = 2, 'Fully Paid', '') AS status_payment,
          concat('b', extract(_topic, 'branch_(\\d+)')) AS branch_sync,
          '' AS branch_sync_name
        FROM ic_trans_raw
        WHERE JSONExtractString(raw_data,'payload','after','doc_no')='${docNo}'
          AND extract(_topic,'branch_(\\d+)')='000'
          AND abs(JSONExtractFloat(raw_data,'payload','after','total_amount') - ${erpAmount}) < 0.01
        LIMIT 1
      `;
      await exec(headerInsert);

      const detailInsert = `
        INSERT INTO saleinvoice_transaction_detail
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
          ifNull(im.item_brand_code, '') AS item_brand_code,
          ifNull(im.item_brand_name, '') AS item_brand_name,
          JSONExtractString(r.raw_data, 'payload', 'after', 'ic_pattern') AS item_pattern_code,
          '' AS item_pattern_name, '' AS item_design_code, '' AS item_design_name, '' AS item_grade_code, '' AS item_grade_name,
          '' AS item_model_code, '' AS item_model_name,
          ifNull(im.item_category_code, '') AS item_category_code,
          ifNull(im.item_category_name, '') AS item_category_name,
          '' AS item_class_code, '' AS item_class_name,
          ifNull(im.group_main_code, '') AS group_main_code,
          ifNull(im.group_main_name, '') AS group_main_name,
          ifNull(im.group_sub_code, '') AS group_sub_code,
          ifNull(im.group_sub_name, '') AS group_sub_name,
          ifNull(im.group_sub2_code, '') AS group_sub2_code,
          ifNull(im.group_sub2_name, '') AS group_sub2_name,
          JSONExtractString(r.raw_data, 'payload', 'after', 'remark') AS description,
          if(JSONExtractInt(r.raw_data, 'payload', 'after', 'status') = 1, 'Cancel', '') AS status_cancel,
          r.branch_sync_value AS branch_sync,
          r.branch_sync_name_value AS branch_sync_name
        FROM (
          SELECT raw_data, _topic,
            concat('b', extract(_topic, 'branch_(\\d+)')) AS branch_sync_value,
            'บริษัท ช้าง สยาม กัมปนี จำกัด' AS branch_sync_name_value,
            JSONExtractString(raw_data, 'payload', 'after', 'item_code') AS item_code_value
          FROM ic_trans_detail_raw
          WHERE JSONExtractString(raw_data,'payload','after','doc_no')='${docNo}'
            AND extract(_topic,'branch_(\\d+)')='000'
        ) AS r
        LEFT JOIN item_master AS im ON (im.branch_sync = r.branch_sync_value) AND (im.item_code = r.item_code_value)
        WHERE (JSONExtractString(r.raw_data, 'payload', 'op') IN ('c','r')) AND (JSONExtractInt(r.raw_data, 'payload', 'after', 'trans_type') = 2)
      `;
      await exec(detailInsert);

      report.fixed.push(`${date} ${docNo}: was CH=${chAmount ?? 'MISSING'}, corrected to ${erpAmount}`);
      chMap.delete(docNo);
    }

    // anything left in chMap is a doc CH has that's NOT in the ERP list for this date
    for (const [docNo, amount] of chMap.entries()) {
      report.extraInCH.push(`${date} ${docNo}: CH has ${amount} but NOT in ERP list (needs manual check)`);
    }
  }

  await exec('OPTIMIZE TABLE saleinvoice_transaction FINAL');
  await exec('OPTIMIZE TABLE saleinvoice_transaction_detail FINAL');

  console.log('=== OK (already correct) ===');
  console.log(report.ok.length, 'documents');

  console.log('\n=== FIXED ===');
  report.fixed.forEach((l) => console.log(' ', l));

  console.log('\n=== MISSING IN RAW (need manual attention) ===');
  report.missingInRaw.forEach((l) => console.log(' ', l));

  console.log('\n=== EXTRA IN CLICKHOUSE (not in ERP list, needs manual check) ===');
  report.extraInCH.forEach((l) => console.log(' ', l));

  console.log('\n=== Final totals per date ===');
  for (const date of dates) {
    const total = await q(`SELECT sum(total_amount) t, count() c FROM saleinvoice_transaction WHERE branch_sync='b000' AND toDate(doc_datetime)='${date}' SETTINGS final=1`);
    const erpTotal = Object.values(ERP[date]).reduce((a, b) => a + b, 0);
    console.log(`${date}: CH=${total[0].t} (${total[0].c} docs) | ERP=${erpTotal.toFixed(2)} | diff=${(total[0].t - erpTotal).toFixed(2)}`);
  }

  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
