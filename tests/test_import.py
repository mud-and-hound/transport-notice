import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from openpyxl import Workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from import_shops import read_shops
import import_shops


class ShopImportTests(unittest.TestCase):
    def workbook(self, path, rows, sheet='Shop', id_format=None):
        wb = Workbook()
        ws = wb.active
        ws.title = sheet
        for row in rows:
            ws.append(row)
        if id_format:
            for row in ws.iter_rows(min_row=2):
                row[0].number_format = id_format
        wb.save(path)

    def test_leading_zeros_and_unicode(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'All.xlsx'
            self.workbook(path, [['Brand', 'Shop ID', 'Code', 'ชื่อสาขา'],
                                 ['TEST', '0004', 'PG', 'สาขาทดสอบ']])
            self.assertEqual(read_shops(path), [('TEST', '0004', 'PG', 'สาขาทดสอบ', '')])

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

    def test_all_shop_preserves_formatted_ids_and_optional_blanks(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'All.xlsx'
            self.workbook(path, [
                ['Shop Code', 'Shop Name 1', 'Shop name 2', 'Company', 'Shop Type'],
                [4, 'PG-สาขาทดสอบ', None, 'Greyhound Cafe co.,Ltd.', None],
                ['X001', 'คลังทดสอบ', 'ชื่ออื่น', 'Greyhound Cafe co.,Ltd.', None],
                [0, '-', None, 'XXXX', None],
                [None, None, None, None, None],
            ], sheet='All Shop', id_format='0000')
            self.assertEqual(read_shops(path), [
                ('GHC', '0004', '0004', 'PG-สาขาทดสอบ', ''),
                ('GHC', 'X001', 'X001', 'คลังทดสอบ', 'ชื่ออื่น'),
                ('XXXX', '0000', '0000', '-', ''),
            ])

    def test_alternate_name_length_is_validated_before_import(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'All.xlsx'
            self.workbook(path, [['Shop Code', 'Shop Name 1', 'Company', 'Shop name 2'],
                                 [4, 'PG-Test', 'Greyhound Cafe co.,Ltd.', 'ก' * 256]],
                          sheet='All Shop', id_format='0000')
            with self.assertRaisesRegex(ValueError, 'alternate_name'):
                read_shops(path)

    def test_generic_shop_imports_optional_alternate_name(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'All.xlsx'
            self.workbook(path, [['Brand', 'Shop ID', 'Code', 'Name', 'alternate_name'],
                                 ['TEST', '0004', 'PG', 'ชื่อหลัก', 'ชื่อสำหรับค้นหา']])
            self.assertEqual(read_shops(path), [('TEST', '0004', 'PG', 'ชื่อหลัก', 'ชื่อสำหรับค้นหา')])

    def test_all_shop_rejects_unknown_company(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'All.xlsx'
            self.workbook(path, [['Shop Code', 'Shop Name 1', 'Company'],
                                 [4, 'PG-Test', 'Unknown Company']],
                          sheet='All Shop', id_format='0000')
            with self.assertRaisesRegex(ValueError, 'Company'):
                read_shops(path)

    def test_all_shop_rejects_colliding_formatted_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'All.xlsx'
            self.workbook(path, [['Shop Code', 'Shop Name 1', 'Company'],
                                 [4, 'PG-Test', 'Greyhound Cafe co.,Ltd.'],
                                 ['0004', 'HQ-Test', 'Greyhound Cafe co.,Ltd.']],
                          sheet='All Shop', id_format='0000')
            with self.assertRaisesRegex(ValueError, 'ซ้ำ'):
                read_shops(path)

    def test_explicit_column_mapping_with_formatted_numeric_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'All.xlsx'
            self.workbook(path, [['Number', 'Group', 'Abbrev', 'Label'],
                                 [7, 'TEST', 'HQ', 'ทดสอบ']], id_format='0000')
            self.assertEqual(read_shops(path, {
                'shop_id': 'Number', 'brand': 'Group', 'code': 'Abbrev', 'name': 'Label',
            }), [('TEST', '0007', 'HQ', 'ทดสอบ', '')])

    def test_missing_required_values_stop_import(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'All.xlsx'
            self.workbook(path, [['Shop Code', 'Shop Name 1', 'Company'],
                                 [4, None, 'Greyhound Cafe co.,Ltd.']],
                          sheet='All Shop', id_format='0000')
            with self.assertRaisesRegex(ValueError, 'ไม่ครบ'):
                read_shops(path)

    def test_replace_active_uses_imported_keys_in_one_transaction(self):
        cn = MagicMock()
        cur = cn.cursor.return_value.__enter__.return_value
        rows = [('GHC', '0004', '0004', 'สาขาทดสอบ', 'ชื่อค้นหา'), ('XXXX', 'TEST', 'TEST', 'คลังทดสอบ', '')]
        import_shops.write_shops(cn, rows, replace_active=True)
        self.assertEqual(cur.executemany.call_args.args[1], rows)
        self.assertIn('alternate_name=VALUES(alternate_name)', cur.executemany.call_args.args[0])
        self.assertIn('NOT IN', cur.execute.call_args.args[0])
        self.assertEqual(cur.execute.call_args.args[1], ['GHC', '0004', 'XXXX', 'TEST'])
        cn.commit.assert_called_once_with()
        cn.rollback.assert_not_called()

    def test_failed_deactivation_rolls_back_import(self):
        cn = MagicMock()
        cur = cn.cursor.return_value.__enter__.return_value
        cur.execute.side_effect = RuntimeError('Database unavailable')
        with self.assertRaises(RuntimeError):
            import_shops.write_shops(cn, [('GHC', '0004', '0004', 'ทดสอบ', '')], replace_active=True)
        cn.rollback.assert_called_once_with()
        cn.commit.assert_not_called()

    def test_empty_import_never_deactivates_master(self):
        cn = MagicMock()
        with self.assertRaises(ValueError):
            import_shops.write_shops(cn, [], replace_active=True)
        cn.cursor.assert_not_called()


if __name__ == '__main__':
    unittest.main()
