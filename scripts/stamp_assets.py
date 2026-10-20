#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# =============================================================================
#  stamp_assets.py — ใส่ ?v=<hash ของไฟล์> ให้ CSS/JS ใน index.html
#  รันทุกครั้งหลังแก้ไฟล์ใน docs/ (ชุดทดสอบจะฟ้องถ้าลืม)
#  เบราว์เซอร์จะโหลดไฟล์ชุดใหม่ทันที ไม่เอาไฟล์เก่าในแคชมาปนกับหน้าใหม่
#  (เคยทำให้หน้าเว็บว่างทั้งหน้า 20 ต.ค. 2026)
#  รัน:  venv/bin/python scripts/stamp_assets.py
# =============================================================================
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
ASSETS = ["docs/css/style.css", "docs/js/config.js", "docs/js/icons.js", "docs/js/app.js"]


def version(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()[:10]


def stamped(html):
    for asset in ASSETS:
        html, n = re.subn(rf'"{re.escape(asset)}(?:\?v=[0-9a-f]*)?"', f'"{asset}?v={version(asset)}"', html)
        if n != 1:
            raise SystemExit(f"index.html ต้องอ้างถึง {asset} 1 ครั้ง (พบ {n})")
    return html


if __name__ == "__main__":
    old = INDEX.read_text(encoding="utf-8")
    new = stamped(old)
    if new != old:
        INDEX.write_text(new, encoding="utf-8")
        print("อัปเดตเลขเวอร์ชันใน index.html แล้ว")
    else:
        print("index.html เป็นเวอร์ชันล่าสุดอยู่แล้ว")
