#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# =============================================================================
#  main.py — ใบแจ้งงานขนส่ง (Transport Notice) API — FastAPI + MySQL (timemud)
#
#  รันที่ :8606 ภายในสำนักงาน
#  หน้าเว็บ (โฟลเดอร์ docs/) ถูกเสิร์ฟที่ / ด้วย → ในออฟฟิศเปิด http://10.8.1.88:8606 ได้เลย
#  GitHub เก็บ source; ยังไม่ได้เปิด GitHub Pages หรือ public API
#
#  รัน:  cd backend && ../venv/bin/uvicorn main:app --host 0.0.0.0 --port 8606
#        (หรือ systemd — ดู transport-notice-api.service)
#
#  เลขงาน: ลำดับ/Job No. เริ่ม 1 ใหม่ทุกเที่ยงคืน (เวลาไทย) → TP-0001, TP-0002, ...
# =============================================================================
import datetime
import logging
import os
from io import BytesIO
from urllib.parse import quote
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator

from db import ROOT, get_conn

log = logging.getLogger("transport_notice")

TZ = ZoneInfo("Asia/Bangkok")
JOB_PREFIX = "TP-"
JOB_DIGITS = 4
UNITS = ["กล่อง", "ซอง", "แพค", "ขวด", "ชิ้น"]
QTY_MAX = 99_999
DOCS_DIR = os.path.join(ROOT, "docs")

JOB_COLUMNS = [
    "id", "work_date", "seq", "job_no", "deposit_date", "delivery_date",
    "to_name", "to_dept", "to_branch_code", "to_branch_name", "to_brand", "to_shop_id",
    "from_name", "from_dept", "from_branch_code", "from_branch_name", "from_brand", "from_shop_id",
    "item_detail", "qty", "unit", "remark", "created_at", "updated_at",
]
JOB_SELECT = "SELECT " + ", ".join(JOB_COLUMNS) + " FROM transport_jobs"

app = FastAPI(title="Transport Notice API", version="1.0")

# หน้าเว็บอยู่บน GitHub Pages คนละ origin → เปิด CORS (ระบบนี้ไม่มี login/cookie)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


# error ที่หลุดออกจาก endpoint จะไม่มี CORS header → browser โชว์เป็น "CORS blocked" หลอกๆ
# ตัวนี้ดักไว้แล้วใส่ header ให้เสมอ (รายละเอียด error จริงดูใน journalctl)
@app.exception_handler(Exception)
async def catch_all(request: Request, exc: Exception):
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"ok": False, "error": f"ระบบขัดข้อง ({type(exc).__name__}) ลองใหม่อีกครั้ง"},
        headers={"Access-Control-Allow-Origin": "*"},
    )


def now_th():
    return datetime.datetime.now(TZ).replace(tzinfo=None)


def job_no(seq):
    return f"{JOB_PREFIX}{seq:0{JOB_DIGITS}d}"


def _out(row):
    # date/datetime → string ให้ JS ใช้ตรงๆ
    for k, v in row.items():
        if isinstance(v, datetime.datetime):
            row[k] = v.strftime("%Y-%m-%d %H:%M:%S")
        elif isinstance(v, datetime.date):
            row[k] = v.isoformat()
    return row


def _get_job(cur, job_id):
    cur.execute(JOB_SELECT + " WHERE id=%s AND deleted_at IS NULL", (job_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)")
    return _out(row)


# ---------- Schemas ----------
class JobIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, validate_default=True)

    deposit_date: datetime.date
    delivery_date: datetime.date
    to_name: str = Field("", max_length=150)
    to_dept: str = Field("", max_length=150)
    to_branch_code: str = Field("", max_length=30)
    to_branch_name: str = Field("", max_length=255)
    to_brand: str = Field("", max_length=10)
    to_shop_id: str = Field("", max_length=20)
    from_name: str = Field("", max_length=150)
    from_dept: str = Field("", max_length=150)
    from_branch_code: str = Field("", max_length=30)
    from_branch_name: str = Field("", max_length=255)
    from_brand: str = Field("", max_length=10)
    from_shop_id: str = Field("", max_length=20)
    item_detail: str = Field("", max_length=500)
    qty: int = Field(1, ge=1, le=QTY_MAX)
    unit: str = "กล่อง"
    remark: str = Field("", max_length=500)

    @field_validator("to_branch_code", "from_name", "item_detail")
    @classmethod
    def _required(cls, v):
        if not v:
            raise ValueError("กรุณากรอกสาขาปลายทาง ผู้ส่ง และรายละเอียดสิ่งที่ส่ง")
        return v

    @field_validator("unit")
    @classmethod
    def _unit_ok(cls, v):
        if v not in UNITS:
            raise ValueError("หน่วยต้องเป็น " + "/".join(UNITS))
        return v


WRITE_FIELDS = list(JobIn.model_fields)


# ---------- Endpoints ----------
@app.get("/api/health")
def health():
    cn = get_conn()
    try:
        with cn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS n FROM transport_branches WHERE is_active=1")
            n = cur.fetchone()["n"]
    finally:
        cn.close()
    return {"ok": True, "today": now_th().date().isoformat(), "branches": n}


@app.get("/api/meta")
def meta():
    return {"ok": True, "today": now_th().date().isoformat(), "units": UNITS,
            "job_prefix": JOB_PREFIX, "job_digits": JOB_DIGITS}


@app.get("/api/branches")
def branches():
    # ส่งทั้งหมดครั้งเดียว (~1 พันแถว) ให้หน้าเว็บค้นหาเองแบบทันทีขณะพิมพ์
    cn = get_conn()
    try:
        with cn.cursor() as cur:
            cur.execute("SELECT brand, shop_id, code, name FROM transport_branches "
                        "WHERE is_active=1 ORDER BY brand, code")
            items = cur.fetchall()
    finally:
        cn.close()
    return {"ok": True, "items": items}


@app.get("/api/jobs")
def list_jobs(date: Optional[datetime.date] = Query(None, description="วันที่บันทึก (ค่าเริ่มต้น = วันนี้)")):
    work_date = date or now_th().date()
    cn = get_conn()
    try:
        with cn.cursor() as cur:
            cur.execute(JOB_SELECT + " WHERE work_date=%s AND deleted_at IS NULL ORDER BY seq",
                        (work_date,))
            items = [_out(r) for r in cur.fetchall()]
    finally:
        cn.close()
    return {"ok": True, "date": work_date.isoformat(), "items": items}


@app.post("/api/jobs")
def create_job(body: JobIn):
    now = now_th()
    work_date = now.date()
    data = body.model_dump()
    cn = get_conn()
    try:
        with cn.cursor() as cur:
            # จองเลขงานของวันแบบ atomic (แถวตัวนับถูก lock จน commit → ไม่ได้เลขซ้ำแม้กดพร้อมกัน)
            cur.execute(
                "INSERT INTO transport_daily_counter (work_date, last_seq) VALUES (%s, LAST_INSERT_ID(1)) "
                "ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + 1)",
                (work_date,),
            )
            cur.execute("SELECT LAST_INSERT_ID() AS seq")
            seq = cur.fetchone()["seq"]

            cols = ["work_date", "seq", "job_no", *WRITE_FIELDS, "created_at", "updated_at"]
            vals = [work_date, seq, job_no(seq), *[data[f] for f in WRITE_FIELDS], now, now]
            cur.execute(
                f"INSERT INTO transport_jobs ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))})",
                vals,
            )
            new_id = cur.lastrowid
        cn.commit()
        with cn.cursor() as cur:
            return {"ok": True, "item": _get_job(cur, new_id)}
    except Exception:
        cn.rollback()
        raise
    finally:
        cn.close()


@app.put("/api/jobs/{job_id}")
def update_job(job_id: int, body: JobIn):
    data = body.model_dump()
    cn = get_conn()
    try:
        with cn.cursor() as cur:
            _get_job(cur, job_id)
            sets = ", ".join(f"{f}=%s" for f in WRITE_FIELDS)
            cur.execute(f"UPDATE transport_jobs SET {sets}, updated_at=%s WHERE id=%s",
                        [*[data[f] for f in WRITE_FIELDS], now_th(), job_id])
        cn.commit()
        with cn.cursor() as cur:
            return {"ok": True, "item": _get_job(cur, job_id)}
    finally:
        cn.close()


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: int):
    cn = get_conn()
    try:
        with cn.cursor() as cur:
            _get_job(cur, job_id)
            cur.execute("UPDATE transport_jobs SET deleted_at=%s WHERE id=%s", (now_th(), job_id))
        cn.commit()
    finally:
        cn.close()
    return {"ok": True}


@app.get("/api/export")
def export_jobs(date: Optional[datetime.date] = None, q: str = ""):
    """Export real XLSX without loading third-party JavaScript in the browser."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    work_date = date or now_th().date()
    rows = list_jobs(work_date)["items"]
    search_fields = ["job_no", "to_name", "to_dept", "to_branch_code", "to_branch_name",
                     "from_name", "from_dept", "from_branch_code", "from_branch_name",
                     "item_detail", "unit", "remark"]
    tokens = q.lower().split()
    rows = [r for r in rows if all(t in " ".join(str(r.get(f, "")) for f in search_fields).lower()
                                   for t in tokens)]
    columns = [("ลำดับ", "seq", 8), ("รหัสงาน Job No.", "job_no", 18),
               ("วันที่ฝาก (ว/ด/ป)", "deposit_date", 20), ("วันที่ส่ง (ว/ด/ป)", "delivery_date", 20),
               ("ถึง (ผู้รับ)", "to_name", 24), ("แผนก (ปลายทาง)", "to_dept", 24),
               ("สาขา (ปลายทาง)", "to_branch_code", 22), ("จาก (ผู้ส่ง)", "from_name", 24),
               ("แผนก (ผู้ส่ง)", "from_dept", 24), ("สาขา (ผู้ส่ง)", "from_branch_code", 22),
               ("รายละเอียดสิ่งที่ส่ง", "item_detail", 40), ("จำนวน", "qty", 12),
               ("หน่วย", "unit", 12), ("หมายเหตุ", "remark", 35)]
    wb = Workbook()
    ws = wb.active
    ws.title = "ใบแจ้งงานขนส่ง"
    ws.append([c[0] for c in columns])
    for index, (_, _, width) in enumerate(columns, 1):
        ws.column_dimensions[get_column_letter(index)].width = width
        cell = ws.cell(1, index)
        cell.font = Font(name="Tahoma", bold=True, color="FFFFFF", size=12)
        cell.fill = PatternFill("solid", fgColor="4F6B33" if 8 <= index <= 10 else "1B2E4F")
    for row_number, row in enumerate(rows, 2):
        for index, (_, key, _) in enumerate(columns, 1):
            value = row.get(key, "")
            if key in ("deposit_date", "delivery_date"):
                value = datetime.date.fromisoformat(str(value))
            cell = ws.cell(row_number, index, value)
            # User-entered text beginning with '=' remains literal text.
            if isinstance(value, str):
                cell.data_type = "s"
            cell.font = Font(name="Tahoma", size=12)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
            if isinstance(value, datetime.date):
                cell.number_format = "d/m/yyyy"
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = ws.dimensions
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_title_rows = "1:1"
    output = BytesIO()
    wb.save(output)
    filename = quote(f"ใบแจ้งงานขนส่ง_{work_date}.xlsx")
    return Response(output.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"})


# หน้าเว็บ (ต้อง mount ท้ายสุด ไม่งั้นจะทับ /api)
if os.path.isdir(DOCS_DIR):
    app.mount("/", StaticFiles(directory=DOCS_DIR, html=True), name="web")
