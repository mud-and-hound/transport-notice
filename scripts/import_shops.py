#!/usr/bin/env python3
"""Preview All.xlsx / Shop and import only after explicit --apply."""
import argparse
import sys
from pathlib import Path

from openpyxl import load_workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from db import get_conn

ALIASES = {
    'brand': ['brand', 'แบรนด์', 'ยี่ห้อ', 'บริษัท'],
    'shop_id': ['shopid', 'shop_id', 'เลขสาขา', 'รหัสสาขา', 'branchid'],
    'code': ['code', 'shopcode', 'branchcode', 'ชื่อย่อ', 'ตัวย่อ', 'รหัสย่อ'],
    'name': ['name', 'shopname', 'branchname', 'ชื่อสาขา', 'สาขา'],
}


def normalize(value):
    return str(value or '').strip().lower().replace(' ', '').replace('_', '').replace('.', '')


def read_shops(path, mapping=None):
    wb = load_workbook(path, read_only=True, data_only=True)
    try:
        if 'Shop' not in wb.sheetnames:
            raise ValueError('ไม่พบ Sheet ชื่อ Shop')
        rows = iter(wb['Shop'].iter_rows(values_only=True))
        header = next(rows, ())
        keys = [normalize(v) for v in header]
        indexes = {}
        for field, aliases in ALIASES.items():
            candidates = [normalize(mapping[field])] if mapping and mapping.get(field) else list(map(normalize, aliases))
            matches = [i for i, key in enumerate(keys) if key in candidates]
            if len(matches) != 1:
                raise ValueError(f'ระบุคอลัมน์ {field} ด้วย --{field.replace("_", "-")}; หัวตารางที่พบ: {header}')
            indexes[field] = matches[0]
        result, seen = [], set()
        for line, row in enumerate(rows, 2):
            if not any(v is not None for v in row):
                continue
            data = {}
            for field, index in indexes.items():
                value = row[index] if index < len(row) else None
                data[field] = str(int(value)) if isinstance(value, float) and value.is_integer() else str(value or '').strip()
            if not all(data.values()):
                raise ValueError(f'แถว {line}: ข้อมูลสาขาไม่ครบ หยุดนำเข้า')
            for field, max_length in [('brand', 10), ('shop_id', 20), ('code', 30), ('name', 255)]:
                if len(data[field]) > max_length:
                    raise ValueError(f'แถว {line}: {field} ยาวเกิน {max_length}')
            key = (data['brand'].casefold(), data['shop_id'].casefold())
            if key in seen:
                raise ValueError(f'แถว {line}: brand + shop_id ซ้ำ หยุดนำเข้า')
            seen.add(key)
            result.append(tuple(data[f] for f in ALIASES))
        if not result:
            raise ValueError('ไม่มีข้อมูลใน Sheet Shop')
        return result
    finally:
        wb.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    parser.add_argument('--apply', action='store_true')
    for field in ALIASES:
        parser.add_argument('--' + field.replace('_', '-'))
    args = parser.parse_args()
    try:
        rows = read_shops(args.file, vars(args))
    except ValueError as exc:
        parser.error(str(exc))
    print(f'ตรวจสอบผ่าน {len(rows)} สาขา')
    for row in rows[:5]:
        print(' | '.join(row))
    if not args.apply:
        print('ยังไม่เขียนฐานข้อมูล; เพิ่ม --apply เมื่อตรวจแล้ว')
        return
    cn = get_conn()
    try:
        with cn.cursor() as cur:
            cur.executemany('INSERT INTO transport_branches (brand, shop_id, code, name) VALUES (%s,%s,%s,%s) '
                            'ON DUPLICATE KEY UPDATE code=VALUES(code), name=VALUES(name), is_active=1', rows)
        cn.commit()
    except Exception:
        cn.rollback()
        raise
    finally:
        cn.close()
    print('นำเข้าสำเร็จ (ไม่ลบสาขาเดิมและไม่เปลี่ยนประวัติใบแจ้งงาน)')


if __name__ == '__main__':
    main()
