import datetime
import io
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from pydantic import ValidationError
import main


class TransportTests(unittest.TestCase):
    def test_real_index_at_project_root_and_private_files_not_served(self):
        with TestClient(main.app) as client:
            home = client.get('/')
            self.assertEqual(home.status_code, 200)
            self.assertIn('src="docs/js/app.js"', home.text)
            self.assertEqual(home.content, (Path(main.ROOT) / 'index.html').read_bytes())
            self.assertEqual(client.get('/index.html').content, home.content)
            legacy = client.get('/docs/index.html', follow_redirects=False)
            self.assertEqual(legacy.status_code, 307)
            self.assertEqual(legacy.headers['location'], '/')
            for asset in ['/docs/css/style.css', '/docs/js/app.js', '/docs/js/config.js', '/docs/js/icons.js']:
                self.assertEqual(client.get(asset).status_code, 200, asset)
            for private_path in ['/.env', '/backend/db.py', '/attach_files_here/All.xlsx', '/.runtime/github_token.txt']:
                self.assertEqual(client.get(private_path).status_code, 404, private_path)

    def test_required_fields_rejected_by_api_schema(self):
        with self.assertRaises(ValidationError):
            main.JobIn(deposit_date='2026-10-15', delivery_date='2026-10-15')

    def test_export_preserves_text_and_filters(self):
        row = dict(seq=7, job_no='TP-0007', deposit_date='2026-10-15',
                   delivery_date='2026-10-16', to_name='ผู้รับ', to_dept='',
                   to_branch_code='PG', to_branch_name='Paragon', from_name='ผู้ส่ง',
                   from_dept='', from_branch_code='HQ', item_detail='เอกสาร',
                   qty=21, unit='ซอง', remark='=1+1')
        with patch.object(main, 'list_jobs', return_value={'items': [row]}):
            with TestClient(main.app) as client:
                response = client.get('/api/export?date=2026-10-15&q=PG')
                self.assertEqual(response.status_code, 200)
                ws = load_workbook(io.BytesIO(response.content)).active
                self.assertEqual(ws.max_row, 2)
                self.assertEqual([c.value for c in ws[1]], [
                    'ลำดับ', 'รหัสงาน Job No.', 'วันที่ฝาก (ว/ด/ป)', 'วันที่ส่ง (ว/ด/ป)',
                    'ถึง ผู้รับ', 'แผนก ผู้รับ', 'สาขา ผู้รับ', 'จาก ผู้ส่ง', 'แผนก ผู้ส่ง',
                    'สาขา ผู้ส่ง', 'รายละเอียด สิ่งที่ส่ง', 'จำนวน', 'หน่วย', 'หมายเหตุ'])
                self.assertEqual(ws['A2'].value, 7)
                self.assertEqual(ws['L2'].value, 21)
                self.assertEqual(ws['N2'].value, '=1+1')
                self.assertEqual(ws['N2'].data_type, 's')
                empty = client.get('/api/export?date=2026-10-15&q=missing')
                self.assertEqual(load_workbook(io.BytesIO(empty.content)).active.max_row, 1)

    def test_job_numbers_and_quantity_bounds(self):
        self.assertEqual(main.job_no(1), 'TP-0001')
        self.assertEqual(main.job_no(10000), 'TP-10000')
        valid = dict(deposit_date=datetime.date.today(), delivery_date=datetime.date.today(),
                     to_branch_code='PG', from_name='ผู้ส่ง', item_detail='เอกสาร')
        for override in [{'qty': 0}, {'qty': 100000}, {'qty': 1.2}, {'unit': 'ลัง'}]:
            with self.assertRaises(ValidationError):
                main.JobIn(**valid, **override)


if __name__ == '__main__':
    unittest.main()
