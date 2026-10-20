"""Opt-in MySQL test for the settings page; TEMPORARY tables shadow real tables on one connection."""
import datetime
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import main
from db import get_conn

TABLES = ['transport_notice_branches', 'transport_notice_units', 'transport_notice_jobs', 'transport_notice_daily_counter']


@unittest.skipUnless(os.environ.get('TRANSPORT_DB_TEST') == '1', 'Opt in with TRANSPORT_DB_TEST=1')
class SettingsDatabaseTests(unittest.TestCase):
    def test_branches_tags_hide_and_units_flow(self):
        cn = get_conn()
        class Cursor:
            def __init__(self):
                self.inner = cn.cursor()
            def __enter__(self):
                return self
            def __exit__(self, *args):
                self.inner.close()
            def __getattr__(self, key):
                return getattr(self.inner, key)
            def execute(self, query, args=None):
                for t in TABLES:
                    query = query.replace(t, 'test_' + t)
                return self.inner.execute(query, args)
            def executemany(self, query, args):
                for t in TABLES:
                    query = query.replace(t, 'test_' + t)
                return self.inner.executemany(query, args)
        class Connection:
            def __getattr__(self, key):
                return getattr(cn, key)
            def close(self):
                pass
            def cursor(self):
                return Cursor()
        try:
            with cn.cursor() as cur:
                for t in TABLES:
                    cur.execute(f'CREATE TEMPORARY TABLE test_{t} LIKE {t}')
                cur.executemany('INSERT INTO test_transport_notice_units (name, sort_order) VALUES (%s,%s)',
                                [('กล่อง', 1), ('ซอง', 2)])
            with patch.object(main, 'get_conn', return_value=Connection()):
                # สาขา: เพิ่ม / ซ้ำ / แท็กหลายอัน / ซ่อน
                item = main.add_branch(main.BranchIn(code='ZZ1', name='Test Site', tags=['คลังสินค้า', 'ทดสอบ']))['item']
                self.assertEqual(item['tags'], ['คลังสินค้า', 'ทดสอบ'])
                self.assertTrue(item['is_manual'])
                with self.assertRaises(main.HTTPException) as dup:
                    main.add_branch(main.BranchIn(code='ZZ1', name='อีกที่'))
                self.assertEqual(dup.exception.status_code, 409)
                self.assertEqual(main.branches()['items'][0]['tags'], ['คลังสินค้า', 'ทดสอบ'])
                main.update_branch(item['id'], main.BranchUpdate(hidden=True, tags=['สำนักงาน']))
                self.assertEqual(main.branches()['items'], [])                 # ซ่อนแล้วไม่อยู่ในรายการเลือก
                self.assertTrue(main.settings_branches()['items'][0]['hidden'])  # แต่ยังเห็นในหน้าตั้งค่า
                # หน่วย: เพิ่ม / ซ้ำ / เปลี่ยนชื่อ / เลื่อน / ซ่อน
                names = [u['name'] for u in main.add_unit(main.UnitIn(name='ลัง'))['items']]
                self.assertEqual(names, ['กล่อง', 'ซอง', 'ลัง'])
                with self.assertRaises(main.HTTPException):
                    main.add_unit(main.UnitIn(name='ลัง'))
                lang = main.settings_units()['items'][2]['id']
                main.update_unit(lang, main.UnitUpdate(name='ลังใหญ่'))
                names = [u['name'] for u in main.move_unit(lang, main.UnitMove(dir=-1))['items']]
                self.assertEqual(names, ['กล่อง', 'ลังใหญ่', 'ซอง'])
                main.update_unit(lang, main.UnitUpdate(hidden=True))
                self.assertEqual(main.meta()['units'], ['กล่อง', 'ซอง'])
                # บันทึกงานด้วยหน่วยที่ซ่อนไม่ได้ (ไม่เสียเลขงาน) / หน่วยที่เปิดอยู่ได้
                body = dict(deposit_date='2026-10-20', delivery_date='2026-10-20', to_branch_code='ZZ1',
                            from_name='ทดสอบ', item_detail='test')
                with patch.object(main, 'now_th', return_value=datetime.datetime(2026, 10, 20, 9, 0)):
                    with self.assertRaises(main.HTTPException) as bad:
                        main.create_job(main.JobIn(**body, unit='ลังใหญ่'))
                    self.assertEqual(bad.exception.status_code, 422)
                    self.assertEqual(main.create_job(main.JobIn(**body, unit='ซอง'))['item']['job_no'], 'TP-0001')
                # ต้องเหลือหน่วยอย่างน้อย 1
                ids = [u['id'] for u in main.settings_units()['items'] if not u['hidden']]
                main.update_unit(ids[0], main.UnitUpdate(hidden=True))
                with self.assertRaises(main.HTTPException) as last:
                    main.update_unit(ids[1], main.UnitUpdate(hidden=True))
                self.assertEqual(last.exception.status_code, 409)
        finally:
            cn.close()  # MySQL drops only our TEMPORARY tables.


if __name__ == '__main__':
    unittest.main()
