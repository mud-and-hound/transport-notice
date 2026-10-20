#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# =============================================================================
#  db_init.py — สร้างตาราง transport_notice_* ในฐานข้อมูล transport_notice (รันซ้ำได้)
#  รัน:  ./venv/bin/python scripts/db_init.py
# =============================================================================
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
from db import get_conn  # noqa: E402

SQL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sql", "001_schema.sql")
DEFAULT_UNITS = ["กล่อง", "ซอง", "แพค", "ขวด", "ชิ้น"]
# แท็กเริ่มต้นตอนเพิ่มคอลัมน์ tags ครั้งแรก (แก้ต่อได้ในหน้าตั้งค่า)
DEFAULT_TAGS = {"PTK20": "สำนักงาน", "WH49": "คลังสินค้า", "WH76": "คลังสินค้า", "H0013": "คลังสินค้า"}
MANUAL_CODES = ["PTK20", "WH49", "WH76"]   # 3 แห่งที่เพิ่มเอง 20 ต.ค. 2026 (ไม่มีใน All.xlsx)


def add_column(cur, column, ddl):
    cur.execute("SHOW COLUMNS FROM transport_notice_branches LIKE %s", (column,))
    if cur.fetchone():
        return False
    cur.execute("ALTER TABLE transport_notice_branches ADD COLUMN " + ddl)
    print("OK: added branch", column)
    return True


def main():
    with open(SQL_FILE, encoding="utf-8") as f:
        # ตัดคอมเมนต์ทีละบรรทัดก่อน แล้วค่อยแยกคำสั่งด้วย ;
        sql = "\n".join(line for line in f if not line.lstrip().startswith("--"))
    statements = [s.strip() for s in sql.split(";") if s.strip()]
    cn = get_conn()
    try:
        with cn.cursor() as cur:
            for s in statements:
                cur.execute(s)
                print("OK:", s.split("(")[0].strip())
            # อัปเกรดฐานข้อมูลเดิม โดยคงข้อมูลสาขาและประวัติใบแจ้งงานไว้
            add_column(cur, "alternate_name", "alternate_name VARCHAR(255) NOT NULL DEFAULT '' AFTER name")
            if add_column(cur, "tags", "tags VARCHAR(255) NOT NULL DEFAULT '' AFTER alternate_name"):
                cur.execute("UPDATE transport_notice_branches SET tags='สาขา' WHERE is_active=1")
                for code, tag in DEFAULT_TAGS.items():
                    cur.execute("UPDATE transport_notice_branches SET tags=%s WHERE shop_id=%s AND is_active=1", (tag, code))
            add_column(cur, "hidden", "hidden TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active")
            if add_column(cur, "is_manual", "is_manual TINYINT(1) NOT NULL DEFAULT 0 AFTER hidden"):
                cur.execute("UPDATE transport_notice_branches SET is_manual=1 WHERE brand='GHC' AND shop_id IN (%s,%s,%s)",
                            MANUAL_CODES)
            # หน่วยเริ่มต้น (ครั้งแรกเท่านั้น)
            cur.execute("SELECT COUNT(*) AS n FROM transport_notice_units")
            if not cur.fetchone()["n"]:
                cur.executemany("INSERT INTO transport_notice_units (name, sort_order) VALUES (%s,%s)",
                                [(u, i) for i, u in enumerate(DEFAULT_UNITS, 1)])
                print("OK: default units", "/".join(DEFAULT_UNITS))
        cn.commit()
    finally:
        cn.close()


if __name__ == "__main__":
    main()
