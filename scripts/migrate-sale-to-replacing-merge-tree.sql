-- ============================================================
-- Migration: MergeTree → ReplacingMergeTree
-- Database: datachangsiam
-- ตาราง: saleinvoice_transaction, saleinvoice_transaction_detail
-- 
-- วัตถุประสงค์: แก้ปัญหา CDC replay ทำให้ข้อมูลซ้ำ
-- โดยเปลี่ยน engine เป็น ReplacingMergeTree ซึ่ง
-- จะ deduplicate แถวที่มี ORDER BY key เดียวกัน
-- 
-- อ้างอิง: scripts/migrate-to-replacing-merge-tree.sql (purchase)
-- ============================================================
-- ⚠️ ควรหยุด Kafka consumer / CDC ก่อน migrate
-- ============================================================

-- ===========================================================
-- STEP 0: ตรวจสอบจำนวนแถวซ้ำก่อน migrate
-- ===========================================================

-- saleinvoice_transaction ซ้ำกี่ชุด (key: doc_no + branch_sync)
SELECT 'saleinvoice_transaction duplicates' AS check_name,
    count(*) AS duplicate_groups
FROM (
    SELECT doc_no, branch_sync, count(*) AS cnt
    FROM datachangsiam.saleinvoice_transaction
    GROUP BY doc_no, branch_sync
    HAVING cnt > 1
);

-- saleinvoice_transaction_detail ซ้ำกี่ชุด (key: doc_no + branch_sync + item_code + barcode + wh_code + shelf_code)
SELECT 'saleinvoice_transaction_detail duplicates' AS check_name,
    count(*) AS duplicate_groups
FROM (
    SELECT doc_no, branch_sync, item_code, barcode, wh_code, shelf_code, count(*) AS cnt
    FROM datachangsiam.saleinvoice_transaction_detail
    GROUP BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code
    HAVING cnt > 1
);


-- ===========================================================
-- STEP 1: สร้างตาราง saleinvoice_transaction ใหม่
-- ===========================================================

CREATE TABLE datachangsiam.saleinvoice_transaction_new
(
    `doc_datetime`     DateTime   COMMENT 'วันที่/เวลา',
    `doc_no`           String     COMMENT 'เอกสารเลขที่',
    `creator_code`     String     COMMENT 'ผู้สร้างเอกสาร',
    `creator_name`     String     COMMENT 'ผู้สร้างเอกสาร',
    `status_cancel`    String     COMMENT 'สถานะยกเลิก Cancel=ยกเลิก',
    `pos_id`           String     COMMENT 'หมายเลขเครื่อง POS ถ้ามีแปลว่ามาจากขาย POS',
    `customer_code`    String     COMMENT 'รหัสลูกหนี้/ลูกค้า, ถ้าเป็นค่าว่าง คือลูกค้าทั่วไป',
    `customer_name`    String     COMMENT 'ชื่อลูกหนี้/ลูกค้า',
    `sale_code`        String     COMMENT 'รหัสพนักงานขาย',
    `sale_name`        String     COMMENT 'ชื่อพนักงานขาย',
    `doc_type`         String     COMMENT 'ประเภทเอกสาร',
    `due_date`         DateTime   COMMENT 'วันที่ครบกำหนด',
    `sum_point`        Float64    COMMENT 'แต้มสะสม',
    `total_value`      Float64    COMMENT 'มูลค่ารวม',
    `total_discount`   Float64    COMMENT 'ส่วนลดรวม',
    `total_before_vat` Float64    COMMENT 'มูลค่าก่อนvat',
    `total_vat_value`  Float64    COMMENT 'vat',
    `total_after_vat`  Float64    COMMENT 'มูลค่าหลังvat',
    `total_except_vat` Float64    COMMENT 'มูลค่ายกเว้นvat',
    `total_amount`     Float64    COMMENT 'ยอดรวมสุทธิ',
    `remark`           String     COMMENT 'หมายเหตุ',
    `branch_code`      String     COMMENT 'รหัสสาขา',
    `branch_name`      String     COMMENT 'ชื่อสาขา',
    `department_code`  String     COMMENT 'รหัสแผนก',
    `department_name`  String     COMMENT 'ชื่อแผนก',
    `side_code`        String     COMMENT 'ด้าน',
    `side_name`        String     COMMENT 'ชื่อด้าน',
    `project_code`     String     COMMENT 'รหัส project',
    `project_name`     String     COMMENT 'ชื่อ project',
    `job_code`         String     COMMENT 'รหัส job',
    `job_name`         String     COMMENT 'ชื่อ job',
    `allocate_code`    String     COMMENT 'รหัส allocate',
    `allocate_name`    String     COMMENT 'ชื่อ allocate',
    `billing_no_array` String     COMMENT 'เลขที่ billing',
    `sum_pay_money`    Float64    COMMENT 'ยอดชำระแล้ว',
    `status_payment`   String     COMMENT 'สถานะการชำระ Outstanding=ค้างชำระ, Partial Paid=ชำระบางส่วน, Paid=ชำระแล้ว',
    `branch_sync`      String     COMMENT 'id ของร้าน/บริษัท',
    `branch_sync_name` String     COMMENT 'ชื่อร้าน/บริษัท'
)
ENGINE = ReplacingMergeTree(doc_datetime)
PARTITION BY toYYYYMM(doc_datetime)
PRIMARY KEY (doc_no, branch_sync)
ORDER BY (doc_no, branch_sync)
SETTINGS index_granularity = 8192
COMMENT 'เอกสารขาย (ReplacingMergeTree)';


-- ===========================================================
-- STEP 2: สร้างตาราง saleinvoice_transaction_detail ใหม่
-- ===========================================================

CREATE TABLE datachangsiam.saleinvoice_transaction_detail_new
(
    `doc_datetime`       DateTime   COMMENT 'วันที่/เวลา',
    `doc_no`             String     COMMENT 'เอกสารเลขที่',
    `branch_code`        String     COMMENT 'รหัสสาขา',
    `branch_name`        String     COMMENT 'ชื่อสาขา',
    `item_code`          String     COMMENT 'รหัสสินค้า',
    `barcode`            String     COMMENT 'บาร์โค้ด',
    `item_name`          String     COMMENT 'ชื่อสินค้า',
    `unit_code`          String     COMMENT 'รหัสหน่วยนับ',
    `unit_name`          String     COMMENT 'ชื่อหน่วยนับ',
    `wh_code`            String     COMMENT 'รหัสคลัง',
    `wh_name`            String     COMMENT 'ชื่อคลัง',
    `shelf_code`         String     COMMENT 'รหัสที่เก็บ',
    `shelf_name`         String     COMMENT 'ชื่อที่เก็บ',
    `qty`                Float64    COMMENT 'จำนวน',
    `price`              Float64    COMMENT 'ราคา',
    `discount_amount`    Float64    COMMENT 'ส่วนลด',
    `sum_amount`         Float64    COMMENT 'ยอดรวม',
    `sum_of_cost`        Float64    COMMENT 'ต้นทุนรวม',
    `average_cost`       Float64    COMMENT 'ต้นทุนเฉลี่ย',
    `stand_value`        Float64    COMMENT 'มูลค่ามาตรฐาน',
    `divide_value`       Float64    COMMENT 'มูลค่าแบ่ง',
    `tax_type`           String     COMMENT 'ประเภทภาษี',
    `item_brand_code`    String     COMMENT 'รหัสยี่ห้อ',
    `item_brand_name`    String     COMMENT 'ชื่อยี่ห้อ',
    `item_pattern_code`  String     COMMENT 'รหัสแพทเทิร์น',
    `item_pattern_name`  String     COMMENT 'ชื่อแพทเทิร์น',
    `item_design_code`   String     COMMENT 'รหัสแบบ',
    `item_design_name`   String     COMMENT 'ชื่อแบบ',
    `item_grade_code`    String     COMMENT 'รหัสเกรด',
    `item_grade_name`    String     COMMENT 'ชื่อเกรด',
    `item_model_code`    String     COMMENT 'รหัสรุ่น',
    `item_model_name`    String     COMMENT 'ชื่อรุ่น',
    `item_category_code` String     COMMENT 'รหัสหมวด',
    `item_category_name` String     COMMENT 'ชื่อหมวด',
    `item_class_code`    String     COMMENT 'รหัสคลาส',
    `item_class_name`    String     COMMENT 'ชื่อคลาส',
    `group_main_code`    String     COMMENT 'รหัสกลุ่มหลัก',
    `group_main_name`    String     COMMENT 'ชื่อกลุ่มหลัก',
    `group_sub_code`     String     COMMENT 'รหัสกลุ่มย่อย',
    `group_sub_name`     String     COMMENT 'ชื่อกลุ่มย่อย',
    `group_sub2_code`    String     COMMENT 'รหัสกลุ่มย่อย2',
    `group_sub2_name`    String     COMMENT 'ชื่อกลุ่มย่อย2',
    `description`        String     COMMENT 'รายละเอียด',
    `status_cancel`      String     COMMENT 'สถานะยกเลิก',
    `branch_sync`        String     COMMENT 'id ของร้าน/บริษัท',
    `branch_sync_name`   String     COMMENT 'ชื่อร้าน/บริษัท'
)
ENGINE = ReplacingMergeTree(doc_datetime)
PARTITION BY toYear(doc_datetime)
PRIMARY KEY (doc_no, branch_sync, item_code, barcode, wh_code)
ORDER BY (doc_no, branch_sync, item_code, barcode, wh_code, shelf_code)
SETTINGS index_granularity = 8192
COMMENT 'รายละเอียดเอกสารขาย (ReplacingMergeTree)';


-- ===========================================================
-- STEP 3: copy ข้อมูลเดิม (deduplicate ขณะ copy)
-- ===========================================================

-- copy saleinvoice_transaction (เลือกเฉพาะ row ล่าสุดต่อ doc_no+branch_sync)
INSERT INTO datachangsiam.saleinvoice_transaction_new
SELECT * EXCEPT (_rn)
FROM (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY doc_no, branch_sync
            ORDER BY doc_datetime DESC
        ) AS _rn
    FROM datachangsiam.saleinvoice_transaction
)
WHERE _rn = 1;

-- copy saleinvoice_transaction_detail (เลือกเฉพาะ row ล่าสุดต่อ unique key)
INSERT INTO datachangsiam.saleinvoice_transaction_detail_new
SELECT * EXCEPT (_rn)
FROM (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code
            ORDER BY doc_datetime DESC
        ) AS _rn
    FROM datachangsiam.saleinvoice_transaction_detail
)
WHERE _rn = 1;


-- ===========================================================
-- STEP 4: ตรวจสอบจำนวนแถวก่อน swap
-- ===========================================================

SELECT 'saleinvoice_transaction old'     AS tbl, count() FROM datachangsiam.saleinvoice_transaction
UNION ALL
SELECT 'saleinvoice_transaction new'     AS tbl, count() FROM datachangsiam.saleinvoice_transaction_new
UNION ALL
SELECT 'saleinvoice_transaction_detail old' AS tbl, count() FROM datachangsiam.saleinvoice_transaction_detail
UNION ALL
SELECT 'saleinvoice_transaction_detail new' AS tbl, count() FROM datachangsiam.saleinvoice_transaction_detail_new;


-- ===========================================================
-- STEP 5: swap ตาราง (rename)
-- ⚠️ ทำเร็วๆ ต่อกัน หรือหยุด Kafka ก่อน
-- ===========================================================

RENAME TABLE
    datachangsiam.saleinvoice_transaction         TO datachangsiam.saleinvoice_transaction_old,
    datachangsiam.saleinvoice_transaction_new     TO datachangsiam.saleinvoice_transaction;

RENAME TABLE
    datachangsiam.saleinvoice_transaction_detail     TO datachangsiam.saleinvoice_transaction_detail_old,
    datachangsiam.saleinvoice_transaction_detail_new TO datachangsiam.saleinvoice_transaction_detail;


-- ===========================================================
-- STEP 6: force deduplicate ข้อมูลที่เหลือ (background merge)
-- ===========================================================

OPTIMIZE TABLE datachangsiam.saleinvoice_transaction        FINAL;
OPTIMIZE TABLE datachangsiam.saleinvoice_transaction_detail FINAL;


-- ===========================================================
-- STEP 7: ตรวจสอบว่าไม่มีซ้ำแล้ว
-- ===========================================================

SELECT 'saleinvoice_transaction duplicates' AS check_name,
    count(*) AS duplicate_groups
FROM (
    SELECT doc_no, branch_sync, count(*) AS cnt
    FROM datachangsiam.saleinvoice_transaction FINAL
    GROUP BY doc_no, branch_sync
    HAVING cnt > 1
);

SELECT 'saleinvoice_transaction_detail duplicates' AS check_name,
    count(*) AS duplicate_groups
FROM (
    SELECT doc_no, branch_sync, item_code, barcode, wh_code, shelf_code, count(*) AS cnt
    FROM datachangsiam.saleinvoice_transaction_detail FINAL
    GROUP BY doc_no, branch_sync, item_code, barcode, wh_code, shelf_code
    HAVING cnt > 1
);


-- ===========================================================
-- STEP 8: ลบตาราง backup เมื่อมั่นใจแล้ว
-- ===========================================================

-- DROP TABLE datachangsiam.saleinvoice_transaction_old;
-- DROP TABLE datachangsiam.saleinvoice_transaction_detail_old;
