#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# =============================================================================
#  send_daily_mail.py — อีเมลสรุปใบแจ้งงานขนส่งรายวัน (ตาราง + ไฟล์ Excel แนบ)
#
#  cron 00:00 ทุกวัน → ส่งงานของ "เมื่อวาน" (วันที่บันทึก 00:00–23:59 เวลาไทย)
#  เช่น รันตอน 20/10/2026 00:00 → ส่งงานของวันที่ 19/10/2026
#  รอบ 00:10 / 00:30 ส่งซ้ำเฉพาะเมื่อรอบก่อนยังไม่สำเร็จ (ดู transport_notice_mail_log)
#
#  รัน:  venv/bin/python scripts/send_daily_mail.py               # ส่งของเมื่อวาน (cron)
#        venv/bin/python scripts/send_daily_mail.py --preview     # ไม่ส่ง เขียนไฟล์ไว้ดูใน .runtime/mail-preview/
#        venv/bin/python scripts/send_daily_mail.py --date 2026-10-15 --to sothon.c@greyhound.co.th
#
#  .env: MAIL_MODE = test (ส่งเฉพาะ MAIL_TEST_TO) / live (ส่ง MAIL_TO)
#        MAIL_FROM = กล่องอีเมลผู้ส่ง, MAIL_SENDER = graph (ค่าเริ่มต้น) / smtp
#        graph → MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET (Microsoft 365 ผ่าน HTTPS)
#        smtp  → SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
#  เครื่อง 10.8.1.88 ออก SMTP (25/465/587) ไม่ได้ — ไฟร์วอลล์บล็อก จึงใช้ graph เป็นค่าเริ่มต้น
# =============================================================================
import argparse
import base64
import datetime
import html
import json
import os
import smtplib
import sys
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
import main as app  # noqa: E402  โหลด .env และใช้ list_jobs / build_xlsx ชุดเดียวกับเว็บ
from db import get_conn  # noqa: E402

WEB_URL = "https://mud-and-hound.github.io/transport-notice/"
PREVIEW_DIR = ROOT / ".runtime" / "mail-preview"
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
             "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
TH_DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]  # date.weekday()
NAVY, GREEN, BROWN, GOLD = "#1B2E4F", "#4F6B33", "#7A5A1F", "#B08A3E"


def env_list(name):
    return [a.strip() for a in os.environ.get(name, "").replace(";", ",").split(",") if a.strip()]


def fmt_date(value):
    # เหมือนบนเว็บ: 2026-10-05 → 5/10/2026
    d = datetime.date.fromisoformat(str(value))
    return f"{d.day}/{d.month}/{d.year}"


def fmt_long(d):
    return f"วัน{TH_DAYS[d.weekday()]}ที่ {d.day} {TH_MONTHS[d.month - 1]} {d.year}"


def unit_summary(rows):
    totals = {}
    for r in rows:
        totals[r["unit"]] = totals.get(r["unit"], 0) + int(r["qty"])
    return " · ".join(f"{u} {totals[u]:,}" for u in app.UNITS if u in totals)


def build_subject(work_date, rows, mode):
    tag = "[ทดสอบ] " if mode != "live" else ""
    return f"{tag}ใบแจ้งงานขนส่ง SST ประจำวันที่ {fmt_date(work_date)} ({len(rows)} รายการ)"


def build_html(work_date, rows, mode):
    e = html.escape

    def branch(code, name):
        if not code:
            return ""
        return f'<b>{e(code)}</b><br><span style="color:#6B6B6B;font-size:12px;">{e(name)}</span>'

    # (หัวคอลัมน์, สีกลุ่ม, ค่าในแถว) — ลำดับเดียวกับฟอร์ม SST 14 คอลัมน์
    cols = [
        ("ลำดับ", NAVY, lambda r: e(str(r["seq"]))),
        ("รหัสงาน<br>Job No.", NAVY, lambda r: f'<b>{e(r["job_no"])}</b>'),
        ("วันที่ฝาก", NAVY, lambda r: e(fmt_date(r["deposit_date"]))),
        ("วันที่ส่ง", NAVY, lambda r: e(fmt_date(r["delivery_date"]))),
        ("ถึง ผู้รับ", NAVY, lambda r: e(r["to_name"])),
        ("แผนก ผู้รับ", NAVY, lambda r: e(r["to_dept"])),
        ("สาขา ผู้รับ", NAVY, lambda r: branch(r["to_branch_code"], r["to_branch_name"])),
        ("จาก ผู้ส่ง", GREEN, lambda r: e(r["from_name"])),
        ("แผนก ผู้ส่ง", GREEN, lambda r: e(r["from_dept"])),
        ("สาขา ผู้ส่ง", GREEN, lambda r: branch(r["from_branch_code"], r["from_branch_name"])),
        ("รายละเอียด สิ่งที่ส่ง", BROWN, lambda r: e(r["item_detail"])),
        ("จำนวน", BROWN, lambda r: f'{int(r["qty"]):,}'),
        ("หน่วย", BROWN, lambda r: e(r["unit"])),
        ("หมายเหตุ", BROWN, lambda r: e(r["remark"])),
    ]
    th = "".join(
        f'<th bgcolor="{color}" style="background:{color};color:#FFFFFF;font-size:13px;padding:8px 6px;'
        f'border:1px solid #D9D2C3;text-align:center;">{label}</th>'
        for label, color, _ in cols)
    body_rows = []
    for i, r in enumerate(rows):
        bg = "#FFFFFF" if i % 2 == 0 else "#FAF7F0"
        tds = "".join(
            f'<td style="font-size:13px;padding:7px 6px;border:1px solid #E4DCCB;vertical-align:top;'
            f'{"text-align:center;" if n in (0, 1, 2, 3, 11, 12) else ""}">{get(r)}</td>'
            for n, (_, _, get) in enumerate(cols))
        body_rows.append(f'<tr bgcolor="{bg}" style="background:{bg};">{tds}</tr>')

    if rows:
        intro = (f'สรุปใบแจ้งงานขนส่งของ<b>{e(fmt_long(work_date))}</b> มีทั้งหมด '
                 f'<b>{len(rows):,} รายการ</b> ({e(unit_summary(rows))})<br>'
                 'รายละเอียดตามตารางด้านล่าง และไฟล์ Excel แนบมาพร้อมอีเมลนี้')
        table = ('<table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;'
                 f'font-family:Tahoma,Arial,sans-serif;"><tr>{th}</tr>{"".join(body_rows)}</table>')
    else:
        intro = f'<b>{e(fmt_long(work_date))}</b> ไม่มีรายการใบแจ้งงานขนส่ง'
        table = ""

    banner = ""
    if mode != "live":
        banner = ('<div style="max-width:1200px;margin:0 auto 12px;padding:10px 14px;background:#FFF4D6;'
                  'border:1px solid #E8C96A;border-radius:8px;font-size:14px;color:#6B5310;">'
                  '<b>อีเมลทดสอบ</b> — ผู้รับจริงยังไม่ได้รับอีเมลนี้</div>')

    return f"""<!DOCTYPE html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F1E8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F5F1E8" style="background:#F5F1E8;">
<tr><td style="padding:24px 12px;font-family:Tahoma,Arial,sans-serif;color:#2B2B2B;">
{banner}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" align="center"
       style="max-width:1200px;margin:0 auto;background:#FFFFFF;border:1px solid #E4DCCB;">
  <tr><td bgcolor="{NAVY}" style="background:{NAVY};padding:18px 22px;border-bottom:3px solid {GOLD};">
    <div style="font-size:22px;font-weight:bold;color:#FFFFFF;">ใบแจ้งงานขนส่ง SST</div>
    <div style="font-size:13px;letter-spacing:1px;color:#D9B66A;">สรุปประจำวัน · {e(fmt_date(work_date))}</div>
    <div style="font-size:12px;color:#C9D1E0;margin-top:4px;">อีเมลอัตโนมัติ — กรุณาอย่าตอบกลับ</div>
  </td></tr>
  <tr><td style="padding:18px 22px 14px;font-size:15px;line-height:1.7;">เรียน ทุกท่าน<br>{intro}</td></tr>
  <tr><td style="padding:0 22px 20px;">{table}</td></tr>
  <tr><td style="padding:14px 22px;border-top:1px solid #E4DCCB;font-size:12px;line-height:1.6;color:#7A7468;">
    <b>อีเมลนี้ส่งอัตโนมัติ (ส่งอย่างเดียว) กรุณาอย่าตอบกลับ</b> — ระบบใบแจ้งงานขนส่งส่งทุกวันเวลา 00:00 น. (ข้อมูลที่บันทึกระหว่าง 00:00–23:59 น. ของวันก่อนหน้า)<br>
    ดูหรือแก้ไขข้อมูล: <a href="{WEB_URL}" style="color:{NAVY};">{WEB_URL}</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>"""


# ---------- ผู้ส่ง ----------
def _request_json(req):
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code}: {exc.read().decode(errors='replace')[:500]}") from None


def send_graph(sender, to, subject, html_body, attachments):
    """Microsoft 365 ผ่าน Graph API (HTTPS 443) — ต้องมี App registration สิทธิ์ Mail.Send (Application)"""
    tenant, client_id, secret = (os.environ.get(k, "").strip()
                                 for k in ("MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET"))
    if not (sender and tenant and client_id and secret):
        raise RuntimeError("ยังไม่ได้ตั้งค่า MAIL_FROM / MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET ใน .env")
    token = _request_json(urllib.request.Request(
        f"https://login.microsoftonline.com/{urllib.parse.quote(tenant)}/oauth2/v2.0/token",
        data=urllib.parse.urlencode({"client_id": client_id, "client_secret": secret,
                                     "grant_type": "client_credentials",
                                     "scope": "https://graph.microsoft.com/.default"}).encode()))["access_token"]
    message = {
        "subject": subject,
        "body": {"contentType": "HTML", "content": html_body},
        "toRecipients": [{"emailAddress": {"address": a}} for a in to],
        "attachments": [{"@odata.type": "#microsoft.graph.fileAttachment", "name": name,
                         "contentType": ctype, "contentBytes": base64.b64encode(data).decode()}
                        for name, ctype, data in attachments],
    }
    _request_json(urllib.request.Request(
        f"https://graph.microsoft.com/v1.0/users/{urllib.parse.quote(sender)}/sendMail",
        data=json.dumps({"message": message, "saveToSentItems": True}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"}, method="POST"))


def send_smtp(sender, to, subject, html_body, attachments):
    """SMTP + STARTTLS — ใช้ได้เมื่อไฟร์วอลล์เปิดพอร์ต SMTP ออกไปแล้ว"""
    password = os.environ.get("SMTP_PASSWORD", "")
    if not (sender and password):
        raise RuntimeError("ยังไม่ได้ตั้งค่า MAIL_FROM / SMTP_PASSWORD ใน .env")
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, sender, ", ".join(to)
    msg.set_content("อีเมลนี้เป็นรูปแบบ HTML กรุณาเปิดด้วยโปรแกรมอีเมลที่แสดง HTML ได้")
    msg.add_alternative(html_body, subtype="html")
    for name, ctype, data in attachments:
        maintype, subtype = ctype.split("/", 1)
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=name)
    with smtplib.SMTP(os.environ.get("SMTP_HOST", "smtp.office365.com"),
                      int(os.environ.get("SMTP_PORT", 587)), timeout=30) as smtp:
        smtp.starttls()
        smtp.login(os.environ.get("SMTP_USER") or sender, password)
        smtp.send_message(msg)


SENDERS = {"graph": send_graph, "smtp": send_smtp}


# ---------- บันทึกการส่ง ----------
def already_sent(work_date, mode):
    cn = get_conn()
    try:
        with cn.cursor() as cur:
            cur.execute("SELECT 1 FROM transport_notice_mail_log WHERE work_date=%s AND mode=%s "
                        "AND status='sent' LIMIT 1", (work_date, mode))
            return cur.fetchone() is not None
    finally:
        cn.close()


def log_attempt(work_date, mode, to, count, status, error=""):
    try:
        cn = get_conn()
        try:
            with cn.cursor() as cur:
                cur.execute("INSERT INTO transport_notice_mail_log (work_date, mode, recipients, job_count, status, error) "
                            "VALUES (%s,%s,%s,%s,%s,%s)",
                            (work_date, mode, ", ".join(to)[:1000], count, status, error[:1000]))
            cn.commit()
        finally:
            cn.close()
    except Exception as exc:  # noqa: BLE001  บันทึกไม่ได้ (เช่น MySQL ล่ม) ก็ไม่ทำให้ผลการส่งเปลี่ยน
        print(f"  (บันทึก mail_log ไม่ได้: {exc})", file=sys.stderr)


def run(argv=None):
    p = argparse.ArgumentParser(description="ส่งอีเมลสรุปใบแจ้งงานขนส่งรายวัน")
    p.add_argument("--date", type=datetime.date.fromisoformat,
                   help="วันที่ของข้อมูล YYYY-MM-DD (ค่าเริ่มต้น = เมื่อวาน ตามเวลาไทย)")
    p.add_argument("--to", help="ส่งหาที่อยู่นี้แทน (คั่นด้วย ,) ใช้ทดสอบ — ไม่นับเป็นการส่งประจำวัน")
    p.add_argument("--preview", action="store_true", help="ไม่ส่ง เขียน HTML + Excel ไว้ดูใน .runtime/mail-preview/")
    p.add_argument("--force", action="store_true", help="ส่งซ้ำแม้วันนั้นส่งสำเร็จไปแล้ว")
    a = p.parse_args(argv)

    stamp = app.now_th().strftime("%Y-%m-%d %H:%M:%S")
    work_date = a.date or (app.now_th().date() - datetime.timedelta(days=1))
    mode = "manual" if a.to else os.environ.get("MAIL_MODE", "test").strip().lower()
    if mode not in ("test", "live", "manual"):
        print(f"{stamp} MAIL_MODE ต้องเป็น test หรือ live (ตอนนี้: {mode})", file=sys.stderr)
        return 2
    to = env_list("MAIL_TO" if mode == "live" else "MAIL_TEST_TO") if not a.to else \
        [x.strip() for x in a.to.split(",") if x.strip()]

    rows = app.list_jobs(work_date)["items"]
    subject = build_subject(work_date, rows, mode)
    html_body = build_html(work_date, rows, mode)
    attachments = [(f"ใบแจ้งงานขนส่ง_{work_date}.xlsx", XLSX_TYPE, app.build_xlsx(rows))] if rows else []

    if a.preview:
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        page = PREVIEW_DIR / f"{work_date}.html"
        page.write_text(html_body, encoding="utf-8")
        print(f"{stamp} PREVIEW {work_date} ({len(rows)} รายการ) หัวเรื่อง: {subject}\n  {page}")
        for name, _, data in attachments:
            (PREVIEW_DIR / name).write_bytes(data)
            print(f"  {PREVIEW_DIR / name}")
        return 0

    if not to:
        print(f"{stamp} ยังไม่ได้ตั้งผู้รับ ({'MAIL_TO' if mode == 'live' else 'MAIL_TEST_TO'}) ใน .env", file=sys.stderr)
        return 2
    if mode != "manual" and not a.force and already_sent(work_date, mode):
        print(f"{stamp} SKIP {work_date} {mode}: ส่งสำเร็จไปแล้ว")
        return 0

    kind = os.environ.get("MAIL_SENDER", "graph").strip().lower()
    try:
        if kind not in SENDERS:
            raise RuntimeError(f"MAIL_SENDER ต้องเป็น graph หรือ smtp (ตอนนี้: {kind})")
        SENDERS[kind](os.environ.get("MAIL_FROM", "").strip(), to, subject, html_body, attachments)
    except Exception as exc:  # noqa: BLE001
        log_attempt(work_date, mode, to, len(rows), "failed", str(exc))
        print(f"{stamp} FAILED {work_date} {mode} via {kind}: {exc}", file=sys.stderr)
        return 1
    log_attempt(work_date, mode, to, len(rows), "sent")
    print(f"{stamp} SENT {work_date} {mode} via {kind}: {len(rows)} รายการ -> {', '.join(to)}")
    return 0


if __name__ == "__main__":
    sys.exit(run())
