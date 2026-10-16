"""Opt-in MySQL test; TEMPORARY tables shadow real tables on one connection."""
import datetime
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import main
from db import get_conn


@unittest.skipUnless(os.environ.get('TRANSPORT_DB_TEST') == '1', 'Opt in with TRANSPORT_DB_TEST=1')
class DatabaseTests(unittest.TestCase):
    def test_real_mysql_daily_reset_and_delete_sequence(self):
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
                query = query.replace('transport_notice_jobs', 'test_transport_notice_jobs').replace('transport_notice_daily_counter', 'test_transport_notice_daily_counter')
                return self.inner.execute(query, args)
        class Connection:
            def __getattr__(self, key):
                return getattr(cn, key)
            def close(self):
                pass
            def cursor(self):
                return Cursor()
        try:
            with cn.cursor() as cur:
                for table in ['transport_notice_jobs', 'transport_notice_daily_counter']:
                    cur.execute(f'CREATE TEMPORARY TABLE test_{table} LIKE {table}')
            body = main.JobIn(deposit_date='2026-10-15', delivery_date='2026-10-16',
                              to_branch_code='PG', from_name='ทดสอบ', item_detail='test')
            day1 = datetime.datetime(2026, 10, 15, 23, 59, 59)
            day2 = datetime.datetime(2026, 10, 16, 0, 0, 0)
            with patch.object(main, 'get_conn', return_value=Connection()):
                with patch.object(main, 'now_th', return_value=day1):
                    first = main.create_job(body)['item']
                    second = main.create_job(body)['item']
                    self.assertEqual([first['seq'], second['seq']], [1, 2])
                    main.delete_job(first['id'])
                    third = main.create_job(body)['item']
                    self.assertEqual(third['seq'], 3)
                with patch.object(main, 'now_th', return_value=day2):
                    next_day = main.create_job(body)['item']
                    self.assertEqual(next_day['seq'], 1)
                    self.assertEqual(next_day['job_no'], 'TP-0001')
                    self.assertEqual(next_day['work_date'], '2026-10-16')
                self.assertEqual(len(main.list_jobs(day1.date())['items']), 2)
        finally:
            cn.close()  # MySQL automatically drops only our TEMPORARY tables.


if __name__ == '__main__':
    unittest.main()
