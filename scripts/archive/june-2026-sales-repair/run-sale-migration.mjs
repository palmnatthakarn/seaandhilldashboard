import { createClient } from '@clickhouse/client';

async function run() {
  const client = createClient({
    url: process.env.CLICKHOUSE_HOST || 'http://147.50.69.68:8123',
    username: process.env.CLICKHOUSE_USER || 'admin',
    password: process.env.CLICKHOUSE_PASSWORD || 'Admin123',
    database: process.env.CLICKHOUSE_DB || 'datachangsiam',
  });

  async function q(query) {
    const result = await client.query({ query, format: 'JSONEachRow' });
    return result.json();
  }
  async function exec(query) {
    await client.exec({ query });
  }

  try {
    // STEP 0: Check duplicates
    console.log('=== STEP 0: Checking duplicates ===');
    const dups1 = await q(`SELECT count(*) AS cnt FROM (SELECT doc_no, branch_sync FROM datachangsiam.saleinvoice_transaction GROUP BY doc_no, branch_sync HAVING count(*) > 1)`);
    console.log(`saleinvoice_transaction duplicate groups: ${dups1[0].cnt}`);
    const dups2 = await q(`SELECT count(*) AS cnt FROM (SELECT doc_no, branch_sync, item_code, barcode, wh_code, shelf_code FROM datachangsiam.saleinvoice_transaction_detail GROUP BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code HAVING count(*) > 1)`);
    console.log(`saleinvoice_transaction_detail duplicate groups: ${dups2[0].cnt}`);

    // STEP 1: Create new tables
    console.log('\n=== STEP 1: Creating saleinvoice_transaction_new ===');
    await exec(`
      CREATE TABLE IF NOT EXISTS datachangsiam.saleinvoice_transaction_new
      (
        doc_datetime DateTime,
        doc_no String,
        creator_code String,
        creator_name String,
        status_cancel String,
        pos_id String,
        customer_code String,
        customer_name String,
        sale_code String,
        sale_name String,
        doc_type String,
        due_date DateTime,
        sum_point Float64,
        total_value Float64,
        total_discount Float64,
        total_before_vat Float64,
        total_vat_value Float64,
        total_after_vat Float64,
        total_except_vat Float64,
        total_amount Float64,
        remark String,
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
        allocate_name String,
        billing_no_array String,
        sum_pay_money Float64,
        status_payment String,
        branch_sync String,
        branch_sync_name String
      )
      ENGINE = ReplacingMergeTree(doc_datetime)
      PARTITION BY toYYYYMM(doc_datetime)
      ORDER BY (doc_no, branch_sync)
      SETTINGS index_granularity = 8192
    `);
    console.log('Created saleinvoice_transaction_new');

    // STEP 2: Create detail new table
    console.log('\n=== STEP 2: Creating saleinvoice_transaction_detail_new ===');
    await exec(`
      CREATE TABLE IF NOT EXISTS datachangsiam.saleinvoice_transaction_detail_new
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
        item_brand_code String,
        item_brand_name String,
        item_pattern_code String,
        item_pattern_name String,
        item_design_code String,
        item_design_name String,
        item_grade_code String,
        item_grade_name String,
        item_model_code String,
        item_model_name String,
        item_category_code String,
        item_category_name String,
        item_class_code String,
        item_class_name String,
        group_main_code String,
        group_main_name String,
        group_sub_code String,
        group_sub_name String,
        group_sub2_code String,
        group_sub2_name String,
        description String,
        status_cancel String,
        branch_sync String,
        branch_sync_name String
      )
      ENGINE = ReplacingMergeTree(doc_datetime)
      PARTITION BY toYear(doc_datetime)
      ORDER BY (doc_no, branch_sync, item_code, barcode, wh_code, shelf_code)
      SETTINGS index_granularity = 8192
    `);
    console.log('Created saleinvoice_transaction_detail_new');

    // STEP 3: Copy data with dedup
    console.log('\n=== STEP 3: Copying deduped data ===');
    console.log('Copying saleinvoice_transaction...');
    const start1 = Date.now();
    await exec(`
      INSERT INTO datachangsiam.saleinvoice_transaction_new
      SELECT * EXCEPT (_rn)
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY doc_no, branch_sync
            ORDER BY doc_datetime DESC
          ) AS _rn
        FROM datachangsiam.saleinvoice_transaction
      )
      WHERE _rn = 1
    `);
    console.log(`  Done in ${Date.now() - start1}ms`);

    console.log('Copying saleinvoice_transaction_detail...');
    const start2 = Date.now();
    await exec(`
      INSERT INTO datachangsiam.saleinvoice_transaction_detail_new
      SELECT * EXCEPT (_rn)
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code
            ORDER BY doc_datetime DESC
          ) AS _rn
        FROM datachangsiam.saleinvoice_transaction_detail
      )
      WHERE _rn = 1
    `);
    console.log(`  Done in ${Date.now() - start2}ms`);

    // STEP 4: Compare counts
    console.log('\n=== STEP 4: Row count comparison ===');
    const counts = await q(`
      SELECT 'saleinvoice_transaction old' AS tbl, count() AS cnt FROM datachangsiam.saleinvoice_transaction
      UNION ALL
      SELECT 'saleinvoice_transaction new', count() FROM datachangsiam.saleinvoice_transaction_new
      UNION ALL
      SELECT 'saleinvoice_transaction_detail old', count() FROM datachangsiam.saleinvoice_transaction_detail
      UNION ALL
      SELECT 'saleinvoice_transaction_detail new', count() FROM datachangsiam.saleinvoice_transaction_detail_new
    `);
    for (const row of counts) {
      console.log(`  ${row.tbl}: ${row.cnt}`);
    }

    // STEP 5: RENAME tables
    console.log('\n=== STEP 5: Swapping tables (RENAME) ===');
    await exec(`
      RENAME TABLE
        datachangsiam.saleinvoice_transaction TO datachangsiam.saleinvoice_transaction_old,
        datachangsiam.saleinvoice_transaction_new TO datachangsiam.saleinvoice_transaction
    `);
    console.log('Renamed saleinvoice_transaction');

    await exec(`
      RENAME TABLE
        datachangsiam.saleinvoice_transaction_detail TO datachangsiam.saleinvoice_transaction_detail_old,
        datachangsiam.saleinvoice_transaction_detail_new TO datachangsiam.saleinvoice_transaction_detail
    `);
    console.log('Renamed saleinvoice_transaction_detail');

    // STEP 6: OPTIMIZE FINAL
    console.log('\n=== STEP 6: OPTIMIZE FINAL ===');
    await exec(`OPTIMIZE TABLE datachangsiam.saleinvoice_transaction FINAL`);
    console.log('Optimized saleinvoice_transaction');
    await exec(`OPTIMIZE TABLE datachangsiam.saleinvoice_transaction_detail FINAL`);
    console.log('Optimized saleinvoice_transaction_detail');

    // STEP 7: Verify no duplicates
    console.log('\n=== STEP 7: Verify no duplicates ===');
    const finalDups1 = await q(`SELECT count(*) AS cnt FROM (SELECT doc_no, branch_sync FROM datachangsiam.saleinvoice_transaction FINAL GROUP BY doc_no, branch_sync HAVING count(*) > 1)`);
    console.log(`saleinvoice_transaction duplicate groups after migration: ${finalDups1[0].cnt}`);
    const finalDups2 = await q(`SELECT count(*) AS cnt FROM (SELECT doc_no, branch_sync, item_code, barcode, wh_code, shelf_code FROM datachangsiam.saleinvoice_transaction_detail FINAL GROUP BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code HAVING count(*) > 1)`);
    console.log(`saleinvoice_transaction_detail duplicate groups after migration: ${finalDups2[0].cnt}`);

    // STEP 8: Show new total
    console.log('\n=== Total sum after dedup (June) ===');
    const newSum = await q(`
      SELECT toString(sum(sum_amount)) AS total_sum
      FROM datachangsiam.saleinvoice_transaction_detail FINAL
      WHERE toDate(doc_datetime) >= '2026-06-01' AND qty > 0 AND sum_amount > 0
    `);
    console.log(`  Total: ${newSum[0].total_sum}`);

    console.log('\n✅ Migration completed successfully!');
    console.log('Old tables kept as: saleinvoice_transaction_old, saleinvoice_transaction_detail_old');
    console.log('Run DROP TABLE when confident:');
    console.log('  DROP TABLE datachangsiam.saleinvoice_transaction_old;');
    console.log('  DROP TABLE datachangsiam.saleinvoice_transaction_detail_old;');

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
