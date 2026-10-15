import sys
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from import_shops import read_shops


class ShopImportTests(unittest.TestCase):
    def workbook(self, path, rows):
        wb = Workbook()
        ws = wb.active
        ws.title = 'Shop'
        for row in rows:
            ws.append(row)
        wb.save(path)

    def test_leading_zeros_and_unicode(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'All.xlsx'
            self.workbook(path, [['Brand', 'Shop ID', 'Code', 'ชื่อสาขา'],
                                 ['TEST', '0004', 'PG', 'สาขาทดสอบ']])
            self.assertEqual(read_shops(path), [('TEST', '0004', 'PG', 'สาขาทดสอบ')])

    def test_duplicate_or_missing_headers_stop_import(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'All.xlsx'
            rows = [['Brand', 'Shop ID', 'Code', 'Name'], ['TEST', '0004', 'PG', 'ทดสอบ']]
            self.workbook(path, rows + [rows[1]])
            with self.assertRaises(ValueError):
                read_shops(path)
            self.workbook(path, [['Unknown'], ['data']])
            with self.assertRaises(ValueError):
                read_shops(path)


if __name__ == '__main__':
    unittest.main()
