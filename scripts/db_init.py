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
from import_shops import EXTRA_LOCATIONS, write_shops  # noqa: E402

SQL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sql", "001_schema.sql")


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
            cur.execute("SHOW COLUMNS FROM transport_notice_branches LIKE 'alternate_name'")
            if not cur.fetchone():
                cur.execute("ALTER TABLE transport_notice_branches ADD COLUMN "
                            "alternate_name VARCHAR(255) NOT NULL DEFAULT '' AFTER name")
                print("OK: added branch alternate_name")
        cn.commit()
        # สถานที่ที่ไม่มีใน All.xlsx (สำนักงาน / คลังสินค้า) — เพิ่มหรืออัปเดตทุกครั้ง (รันซ้ำได้)
        write_shops(cn, EXTRA_LOCATIONS)
        print("OK: extra locations", ", ".join(x[2] for x in EXTRA_LOCATIONS))
    finally:
        cn.close()


if __name__ == "__main__":
    main()
