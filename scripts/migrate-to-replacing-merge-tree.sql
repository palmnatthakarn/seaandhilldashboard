-- ============================================================
-- Migration: MergeTree → ReplacingMergeTree
-- Database: datachangsiam
-- วัตถุประสงค์: แก้ปัญหา CDC replay ทำให้ข้อมูลซ้ำ
-- โดยเปลี่ยน engine เป็น ReplacingMergeTree ซึ่ง
-- จะ deduplicate แถวที่มี ORDER BY key เดียวกัน
-- ============================================================
-- ⚠️  ควร backup หรือ snapshot ก่อนรัน
-- ⚠️  ควรหยุด Kafka consumer ชั่วคราวระหว่าง migrate
--     หรืออย่างน้อยตรวจว่า lag = 0 ก่อนรัน step rename
-- ============================================================

-- ===========================================================
-- STEP 0: ตรวจสอบจำนวนแถวซ้ำก่อน migrate
-- ===========================================================

-- ดูว่า purchase_transaction มีแถวซ้ำกี่ชุด
SELECT
    doc_no,
    branch_sync,
    count(*) AS cnt
FROM datachangsiam.purchase_transaction
GROUP BY doc_no, branch_sync
HAVING cnt > 1
ORDER BY cnt DESC
LIMIT 20;

-- ดูว่า purchase_transaction_detail มีแถวซ้ำกี่ชุด
SELECT
    doc_no,
    branch_sync,
    item_code,
    barcode,
    wh_code,
    shelf_code,
    count(*) AS cnt
FROM datachangsiam.purchase_transaction_detail
GROUP BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code
HAVING cnt > 1
ORDER BY cnt DESC
LIMIT 20;


-- ===========================================================
-- STEP 1: สร้างตาราง purchase_transaction ใหม่
-- ===========================================================

CREATE TABLE datachangsiam.purchase_transaction_new
(
    `doc_datetime`    DateTime     COMMENT 'วันที่/เวลา',
    `doc_no`          String       COMMENT 'เอกสารเลขที่',
    `status_cancel`   String       COMMENT 'สถานะยกเลิก',
    `creator_code`    String,
    `creator_name`    String,
    `pos_id`          String,
    `supplier_code`   String       COMMENT 'รหัสเจ้าหนี้',
    `supplier_name`   String       COMMENT 'ชื่อเจ้าหนี้',
    `sale_code`       String,
    `sale_name`       String,
    `doc_type`        String,
    `due_date`        DateTime,
    `sum_point`       Float64,
    `total_value`     Float64,
    `total_discount`  Float64,
    `total_before_vat` Float64,
    `total_vat_value` Float64,
    `total_after_vat` Float64,
    `total_except_vat` Float64,
    `total_amount`    Float64,
    `remark`          String,
    `branch_code`     String,
    `branch_name`     String,
    `department_code` String,
    `department_name` String,
    `side_code`       String,
    `side_name`       String,
    `project_code`    String,
    `project_name`    String,
    `job_code`        String,
    `job_name`        String,
    `allocate_code`   String,
    `allocate_name`   String,
    `billing_no_array` String,
    `sum_pay_money`   Float64,
    `status_payment`  String,
    `branch_sync`     String       COMMENT 'id ของร้าน/บริษัท',
    `branch_sync_name` String
)
ENGINE = ReplacingMergeTree(doc_datetime)
PARTITION BY toYYYYMM(doc_datetime)
-- unique key: 1 PO ต่อ 1 branch เท่านั้น
PRIMARY KEY (doc_no, branch_sync)
ORDER BY (doc_no, branch_sync)
SETTINGS index_granularity = 8192
COMMENT 'เอกสารซื้อ (ReplacingMergeTree)';


-- ===========================================================
-- STEP 2: สร้างตาราง purchase_transaction_detail ใหม่
-- ===========================================================

CREATE TABLE datachangsiam.purchase_transaction_detail_new
(
    `doc_datetime`         DateTime  COMMENT 'วันที่/เวลา',
    `doc_no`               String    COMMENT 'เอกสารเลขที่',
    `branch_code`          String,
    `branch_name`          String,
    `item_code`            String    COMMENT 'รหัสสินค้า',
    `barcode`              String,
    `item_name`            String,
    `unit_code`            String,
    `unit_name`            String,
    `wh_code`              String    COMMENT 'รหัสคลัง',
    `wh_name`              String,
    `shelf_code`           String,
    `shelf_name`           String,
    `qty`                  Float64,
    `price`                Float64,
    `discount_amount`      Float64,
    `sum_amount`           Float64,
    `sum_of_cost`          Float64,
    `average_cost`         Float64,
    `stand_value`          Float64,
    `divide_value`         Float64,
    `tax_type`             String,
    `item_brand_code`      String,
    `item_brand_name`      String,
    `item_pattern_code`    String,
    `item_pattern_name`    String,
    `item_design_code`     String,
    `item_design_name`     String,
    `item_grade_code`      String,
    `item_grade_name`      String,
    `item_model_code`      String,
    `item_model_name`      String,
    `item_category_code`   String,
    `item_category_name`   String,
    `item_class_code`      String,
    `item_class_name`      String,
    `group_main_code`      String,
    `group_main_name`      String,
    `group_sub_code`       String,
    `group_sub_name`       String,
    `group_sub2_code`      String,
    `group_sub2_name`      String,
    `description`          String,
    `status_cancel`        String,
    `branch_sync`          String    COMMENT 'id ของร้าน/บริษัท',
    `branch_sync_name`     String
)
ENGINE = ReplacingMergeTree(doc_datetime)
PARTITION BY toYear(doc_datetime)
-- unique key: 1 item ต่อ 1 PO ต่อ 1 branch ต่อ 1 คลัง/ที่เก็บ
PRIMARY KEY (doc_no, branch_sync, item_code, barcode, wh_code)
ORDER BY (doc_no, branch_sync, item_code, barcode, wh_code, shelf_code)
SETTINGS index_granularity = 8192
COMMENT 'รายละเอียดเอกสารซื้อ (ReplacingMergeTree)';


-- ===========================================================
-- STEP 3: copy ข้อมูลเดิม (deduplicate ขณะ copy)
-- ===========================================================

-- copy purchase_transaction (เลือกเฉพาะ row ล่าสุดต่อ doc_no+branch_sync)
INSERT INTO datachangsiam.purchase_transaction_new
SELECT *
FROM (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY doc_no, branch_sync
            ORDER BY doc_datetime DESC
        ) AS _rn
    FROM datachangsiam.purchase_transaction
)
WHERE _rn = 1;

-- copy purchase_transaction_detail (เลือกเฉพาะ row ล่าสุดต่อ unique key)
INSERT INTO datachangsiam.purchase_transaction_detail_new
SELECT *
FROM (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code
            ORDER BY doc_datetime DESC
        ) AS _rn
    FROM datachangsiam.purchase_transaction_detail
)
WHERE _rn = 1;


-- ===========================================================
-- STEP 4: ตรวจสอบจำนวนแถวก่อน swap
-- ===========================================================

SELECT 'purchase_transaction old'     AS tbl, count() FROM datachangsiam.purchase_transaction
UNION ALL
SELECT 'purchase_transaction new'     AS tbl, count() FROM datachangsiam.purchase_transaction_new
UNION ALL
SELECT 'purchase_transaction_detail old' AS tbl, count() FROM datachangsiam.purchase_transaction_detail
UNION ALL
SELECT 'purchase_transaction_detail new' AS tbl, count() FROM datachangsiam.purchase_transaction_detail_new;


-- ===========================================================
-- STEP 5: swap ตาราง (rename)
-- ⚠️  ทำเร็วๆ ต่อกัน / หรือหยุด Kafka ก่อน
-- ===========================================================

RENAME TABLE
    datachangsiam.purchase_transaction         TO datachangsiam.purchase_transaction_old,
    datachangsiam.purchase_transaction_new     TO datachangsiam.purchase_transaction;

RENAME TABLE
    datachangsiam.purchase_transaction_detail     TO datachangsiam.purchase_transaction_detail_old,
    datachangsiam.purchase_transaction_detail_new TO datachangsiam.purchase_transaction_detail;


-- ===========================================================
-- STEP 6: force deduplicate ข้อมูลที่เหลือ (background merge)
-- ===========================================================

OPTIMIZE TABLE datachangsiam.purchase_transaction        FINAL;
OPTIMIZE TABLE datachangsiam.purchase_transaction_detail FINAL;


-- ===========================================================
-- STEP 7: ตรวจสอบว่าไม่มีซ้ำแล้ว
-- ===========================================================

SELECT 'purchase_transaction duplicates' AS check_name,
    count(*) AS duplicate_groups
FROM (
    SELECT doc_no, branch_sync, count(*) AS cnt
    FROM datachangsiam.purchase_transaction FINAL
    GROUP BY doc_no, branch_sync
    HAVING cnt > 1
);

SELECT 'purchase_transaction_detail duplicates' AS check_name,
    count(*) AS duplicate_groups
FROM (
    SELECT doc_no, branch_sync, item_code, barcode, wh_code, shelf_code, count(*) AS cnt
    FROM datachangsiam.purchase_transaction_detail FINAL
    GROUP BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code
    HAVING cnt > 1
);


-- ===========================================================
-- STEP 8: ลบตาราง backup เมื่อมั่นใจแล้ว (ไม่เร่งรีบ)
-- ===========================================================

-- DROP TABLE datachangsiam.purchase_transaction_old;
-- DROP TABLE datachangsiam.purchase_transaction_detail_old;


-- ===========================================================
-- NOTE: ตาราง Materialized View (MV) ไม่ต้องแก้
-- MV เขียนไปยังชื่อตาราง ซึ่งหลัง rename จะชี้ไปยัง
-- ReplacingMergeTree table ใหม่โดยอัตโนมัติ
--
-- หากต้องการแก้ตารางอื่นด้วย (แนะนำทำทีหลัง):
--   - journal_transaction_detail
--   - saleinvoice_transaction
--   - saleinvoice_transaction_detail
--   - payment_transaction
-- ใช้ pattern เดียวกัน โดยระบุ unique key ให้ถูกต้อง
-- ===========================================================
