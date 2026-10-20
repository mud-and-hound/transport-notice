-- =============================================================================
--  ใบแจ้งงานขนส่ง (Transport Notice) — schema
--  database: transport_notice (ฐานข้อมูลเฉพาะโปรเจกต์ แยกจาก timemud) — MySQL บน 10.8.1.88
--  ทุกตารางขึ้นต้นด้วย transport_notice_ ตามชื่อโปรเจกต์
--  รันซ้ำได้ (IF NOT EXISTS)
-- =============================================================================

-- สาขา (นำเข้าจากไฟล์ All → Sheet All Shop)
CREATE TABLE IF NOT EXISTS transport_notice_branches (
  id          INT          NOT NULL AUTO_INCREMENT,
  brand       VARCHAR(10)  NOT NULL,
  shop_id     VARCHAR(20)  NOT NULL,
  code        VARCHAR(30)  NOT NULL,
  name        VARCHAR(255) NOT NULL,
  alternate_name VARCHAR(255) NOT NULL DEFAULT '',
  tags        VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'หมวด/แท็ก คั่นด้วย , (ตั้งในหน้าตั้งค่า)',
  is_active   TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'มีในไฟล์ All.xlsx ล่าสุด (การนำเข้าเป็นผู้กำหนด)',
  hidden      TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'ซ่อนจากรายการเลือก (ตั้งในหน้าตั้งค่า)',
  is_manual   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'เพิ่มจากหน้าตั้งค่า — --replace-active ไม่ซ่อน',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_brand_shop (brand, shop_id),
  KEY idx_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หน่วยที่ส่ง (แก้ในหน้าตั้งค่า) — ใบแจ้งงานเก็บชื่อหน่วยเป็นข้อความ จึงเปลี่ยนชื่อ/ซ่อนได้โดยประวัติไม่เปลี่ยน
CREATE TABLE IF NOT EXISTS transport_notice_units (
  id          INT          NOT NULL AUTO_INCREMENT,
  name        VARCHAR(10)  NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตัวนับเลขงานรายวัน: 1 แถวต่อ 1 วัน → เลข Job No. เริ่ม 1 ใหม่ทุกเที่ยงคืน
CREATE TABLE IF NOT EXISTS transport_notice_daily_counter (
  work_date  DATE NOT NULL,
  last_seq   INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการใบแจ้งงานขนส่ง (1 แถว = 1 แถวในฟอร์ม Excel)
-- ข้อมูลสาขาเก็บแบบ snapshot (code/name/brand/shop_id) เพื่อไม่ให้ประวัติเปลี่ยนตามเมื่อแก้ชื่อสาขา
CREATE TABLE IF NOT EXISTS transport_notice_jobs (
  id                BIGINT        NOT NULL AUTO_INCREMENT,
  work_date         DATE          NOT NULL COMMENT 'วันที่บันทึก (เวลาไทย) — ใช้รีเซ็ตเลขงาน',
  seq               INT           NOT NULL COMMENT 'เลขงานของวัน 1..N',
  job_no            VARCHAR(30)   NOT NULL COMMENT 'รหัสงาน เช่น TP-0001',
  deposit_date      DATE          NOT NULL COMMENT 'วันที่ฝาก',
  delivery_date     DATE          NOT NULL COMMENT 'วันที่ส่ง',
  to_name           VARCHAR(150)  NOT NULL DEFAULT '' COMMENT 'ถึง (ผู้รับ)',
  to_dept           VARCHAR(150)  NOT NULL DEFAULT '' COMMENT 'แผนก (ปลายทาง)',
  to_branch_code    VARCHAR(30)   NOT NULL DEFAULT '' COMMENT 'สาขา (ปลายทาง)',
  to_branch_name    VARCHAR(255)  NOT NULL DEFAULT '',
  to_brand          VARCHAR(10)   NOT NULL DEFAULT '',
  to_shop_id        VARCHAR(20)   NOT NULL DEFAULT '',
  from_name         VARCHAR(150)  NOT NULL DEFAULT '' COMMENT 'จาก (ผู้ส่ง)',
  from_dept         VARCHAR(150)  NOT NULL DEFAULT '' COMMENT 'แผนก (ผู้ส่ง)',
  from_branch_code  VARCHAR(30)   NOT NULL DEFAULT '' COMMENT 'สาขา (ผู้ส่ง)',
  from_branch_name  VARCHAR(255)  NOT NULL DEFAULT '',
  from_brand        VARCHAR(10)   NOT NULL DEFAULT '',
  from_shop_id      VARCHAR(20)   NOT NULL DEFAULT '',
  item_detail       VARCHAR(500)  NOT NULL DEFAULT '' COMMENT 'รายละเอียดสิ่งที่ส่ง',
  qty               INT           NOT NULL DEFAULT 1  COMMENT 'จำนวน',
  unit              VARCHAR(10)   NOT NULL DEFAULT 'กล่อง' COMMENT 'หน่วย: กล่อง/ซอง/แพค/ขวด/ชิ้น',
  remark            VARCHAR(500)  NOT NULL DEFAULT '' COMMENT 'หมายเหตุ',
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at        DATETIME      NULL DEFAULT NULL COMMENT 'ลบแบบ soft delete',
  PRIMARY KEY (id),
  UNIQUE KEY uniq_day_seq (work_date, seq),
  KEY idx_work_date (work_date, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- บันทึกการส่งอีเมลสรุปรายวัน: กันส่งซ้ำ และให้รอบ retry (00:10, 00:30) ส่งเฉพาะวันที่ยังไม่สำเร็จ
CREATE TABLE IF NOT EXISTS transport_notice_mail_log (
  id          BIGINT        NOT NULL AUTO_INCREMENT,
  work_date   DATE          NOT NULL COMMENT 'วันที่ของข้อมูลที่ส่ง',
  mode        VARCHAR(10)   NOT NULL COMMENT 'test / live / manual',
  recipients  VARCHAR(1000) NOT NULL DEFAULT '',
  job_count   INT           NOT NULL DEFAULT 0,
  status      VARCHAR(10)   NOT NULL COMMENT 'sent / failed',
  error       VARCHAR(1000) NOT NULL DEFAULT '',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_day_mode (work_date, mode, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
