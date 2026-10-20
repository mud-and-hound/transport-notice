#!/usr/bin/env python3
"""Preview All.xlsx / All Shop (or Shop) and import only after explicit --apply."""
import argparse
import re
import sys
from pathlib import Path

from openpyxl import load_workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))

ALIASES = {
    'brand': ['brand', 'แบรนด์', 'ยี่ห้อ', 'บริษัท'],
    'shop_id': ['shopid', 'shop_id', 'เลขสาขา', 'รหัสสาขา', 'branchid'],
    'code': ['code', 'shopcode', 'branchcode', 'ชื่อย่อ', 'ตัวย่อ', 'รหัสย่อ'],
    'name': ['name', 'shopname', 'branchname', 'ชื่อสาขา', 'สาขา'],
    'alternate_name': ['alternate_name', 'Shop Name 2', 'ชื่อสาขา2'],
}
COMPANY_BRANDS = {'Greyhound Cafe co.,Ltd.': 'GHC', 'XXXX': 'XXXX'}


def normalize(value):
    return str(value or '').strip().lower().replace(' ', '').replace('_', '').replace('.', '')


def cell_text(cell):
    value = cell.value
    if value is None:
        return ''
    if isinstance(value, (int, float)) and not isinstance(value, bool) and int(value) == value:
        text = str(int(value))
        if re.fullmatch(r'0+', cell.number_format or ''):
            return text.zfill(len(cell.number_format))
        return text
    return str(value).strip()


def read_shops(path, mapping=None):
    wb = load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = next((name for name in ('Shop', 'All Shop') if name in wb.sheetnames), None)
        if sheet is None:
            raise ValueError('ไม่พบ Sheet ชื่อ Shop หรือ All Shop')
        rows = iter(wb[sheet].iter_rows())
        header = tuple(cell.value for cell in next(rows, ()))
        keys = [normalize(v) for v in header]
        all_shop = sheet == 'All Shop' and not any((mapping or {}).get(field) for field in ALIASES)
        columns = {'shop_id': ['Shop Code'], 'name': ['Shop Name 1'], 'company': ['Company'],
                   'alternate_name': ['Shop Name 2']} if all_shop else ALIASES
        indexes = {}
        for field, aliases in columns.items():
            candidates = [normalize(mapping[field])] if mapping and mapping.get(field) else list(map(normalize, aliases))
            matches = [i for i, key in enumerate(keys) if key in candidates]
            if field == 'alternate_name' and not matches and not (mapping or {}).get(field):
                indexes[field] = None
                continue
            if len(matches) != 1:
                raise ValueError(f'ระบุคอลัมน์ {field} ด้วย --{field.replace("_", "-")}; หัวตารางที่พบ: {header}')
            indexes[field] = matches[0]
        result, seen = [], set()
        for line, row in enumerate(rows, 2):
            if not any(cell.value is not None for cell in row):
                continue
            data = {}
            for field, index in indexes.items():
                data[field] = cell_text(row[index]) if index is not None and index < len(row) else ''
            if not all(value for field, value in data.items() if field != 'alternate_name'):
                raise ValueError(f'แถว {line}: ข้อมูลสาขาไม่ครบ หยุดนำเข้า')
            if all_shop:
                company = data.pop('company')
                if company not in COMPANY_BRANDS:
                    raise ValueError(f'แถว {line}: Company ไม่มีการจับคู่แบรนด์ หยุดนำเข้า')
                data['brand'] = COMPANY_BRANDS[company]
                data['code'] = data['shop_id']
            for field, max_length in [('brand', 10), ('shop_id', 20), ('code', 30), ('name', 255), ('alternate_name', 255)]:
                if len(data[field]) > max_length:
                    raise ValueError(f'แถว {line}: {field} ยาวเกิน {max_length}')
            key = (data['brand'].casefold(), data['shop_id'].casefold())
            if key in seen:
                raise ValueError(f'แถว {line}: brand + shop_id ซ้ำ หยุดนำเข้า')
            seen.add(key)
            result.append(tuple(data[f] for f in ALIASES))
        if not result:
            raise ValueError(f'ไม่มีข้อมูลใน Sheet {sheet}')
        return result
    finally:
        wb.close()


def write_shops(cn, rows, replace_active=False):
    if not rows:
        raise ValueError('ไม่มีข้อมูลสาขา หยุดนำเข้า')
    try:
        with cn.cursor() as cur:
            cur.executemany('INSERT INTO transport_notice_branches (brand, shop_id, code, name, alternate_name) VALUES (%s,%s,%s,%s,%s) '
                            'ON DUPLICATE KEY UPDATE code=VALUES(code), name=VALUES(name), '
                            'alternate_name=VALUES(alternate_name), is_active=1', rows)
            if replace_active:
                placeholders = ','.join(['(%s,%s)'] * len(rows))
                keys = [value for row in rows for value in row[:2]]
                # สาขาที่เพิ่มจากหน้าตั้งค่า (is_manual) ไม่มีในไฟล์ จึงไม่ซ่อน
                cur.execute('UPDATE transport_notice_branches SET is_active=0 '
                            f'WHERE is_manual=0 AND (brand, shop_id) NOT IN ({placeholders})', keys)
        cn.commit()
    except Exception:
        cn.rollback()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--replace-active', action='store_true',
                        help='ซ่อนสาขาที่ไม่มีในไฟล์นี้จากรายการเลือก โดยไม่ลบประวัติ')
    for field in ALIASES:
        parser.add_argument('--' + field.replace('_', '-'))
    args = parser.parse_args()
    try:
        rows = read_shops(args.file, vars(args))
    except ValueError as exc:
        parser.error(str(exc))
    print(f'ตรวจสอบผ่าน {len(rows)} สาขา')
    if args.replace_active:
        print('รายการเลือกสาขาจะใช้เฉพาะสาขาจากไฟล์นี้ (ไม่ลบสาขาเดิม)')
    if not args.apply:
        print('ยังไม่เขียนฐานข้อมูล; เพิ่ม --apply เมื่อตรวจแล้ว')
        return
    from db import get_conn
    cn = get_conn()
    try:
        write_shops(cn, rows, args.replace_active)
    finally:
        cn.close()
    print('นำเข้าสำเร็จ (ไม่ลบสาขาเดิมและไม่เปลี่ยนประวัติใบแจ้งงาน)')


if __name__ == '__main__':
    main()
