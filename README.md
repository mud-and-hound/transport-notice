# ใบแจ้งงานขนส่ง SST

เว็บภาษาไทยแบบ Excel สำหรับคอม และแบบการ์ด/ฟอร์มสำหรับมือถือ โทนกรมท่า–ทอง–ขาว ปรับตัวอักษรได้ 3 ขนาด

## เปิดใช้งาน

- ในเครือข่ายสำนักงาน: http://10.8.1.88:8606/
- ไฟล์หน้าเว็บใช้งานจริง: [`index.html`](index.html) อยู่หน้าสุดของโปรเจกต์; CSS/JavaScript อยู่ใน `docs/`
- เปิด `transport-notice.code-workspace` ใน VS Code
- ได้รับ **All.xlsx** และ **ใบแจ้งงานขนส่ง SST.xlsx** แล้วใน `attach_files_here/`
- Source: [public repository บน GitHub](https://github.com/mud-and-hound/transport-notice)
- หน้าเว็บบน [GitHub Pages](https://mud-and-hound.github.io/transport-notice/) เปิดได้แล้วจาก `main /` แต่ยังไม่เชื่อม API ภายนอก จึงใช้ดูหน้าจอเท่านั้น; บันทึก/อ่านข้อมูลจริงผ่าน URL สำนักงานด้านบน

ตำแหน่งโปรเจกต์: `/opt/transport_notice` แยกเป็นโฟลเดอร์ของตัวเองใต้ `/opt`

เปิดเว็บผ่าน URL ด้านบนเพื่อใช้งานพร้อมฐานข้อมูล หรือเปิด `index.html` โดยตรงในเครื่องที่เข้าถึงเครือข่ายสำนักงานได้ (เชื่อม API พอร์ต 8606 ตาม `docs/js/config.js`) การเปิดด้วย static server/Live Server ต้องตั้ง API ให้ชี้ไปยัง backend ก่อน เพราะ static server ไม่รัน Python/MySQL

## พฤติกรรม

- 1 แถว = 1 รายการขนส่ง ตรงตาม 14 คอลัมน์ในไฟล์ **ใบแจ้งงานขนส่ง SST.xlsx**
- ลำดับและเลขงานจองโดย MySQL ตามวันที่บันทึก **Asia/Bangkok** เริ่ม 1 ใหม่หลังเที่ยงคืน การแก้วันที่ฝาก/วันที่ส่งไม่เปลี่ยนเลขงาน
- รหัสแสดงเป็น `TP-0001`, `TP-0002`, … ตามตัวอย่างภาพ สามารถเปลี่ยน prefix/จำนวนหลักใน `backend/main.py`
- เลขงานต้องอ้างพร้อมวันที่ เพราะเลขซ้ำข้ามวันได้ เลขที่ลบแล้วไม่ถูกนำกลับมาใช้
- วันที่ฝาก/ส่งเริ่มที่วันนี้ มีปฏิทินเลือกได้ทั้งย้อนหลังและล่วงหน้า
- พิมพ์ชื่อและแผนกเอง เลือกสาขาในป๊อปอัพ ค้นได้จากเลข ชื่อหลัก ชื่อรอง รหัส และแบรนด์
- จำนวนพิมพ์หรือกด +/− ได้ ตั้งแต่ 1–99,999 หน่วยมี กล่อง/ซอง/แพค/ขวด/ชิ้น
- ตารางคอมบันทึกการแก้ไขอัตโนมัติ แถวใหม่กดบันทึก มือถือใช้ฟอร์มกดบันทึก
- ค้นหา พิมพ์ A4 แนวนอน และส่งออก `.xlsx` จริง (14 คอลัมน์ ตามรายการที่กรอง)
- ฐานข้อมูล `timemud`: `transport_jobs`, `transport_daily_counter`, `transport_branches` แยกจากตารางเดิม เช่น `audit_logs`
- รายการเลือกสาขาใช้ **124 รายการ** จาก **All.xlsx → All Shop**; ใช้ Shop Code เป็นเลขอ้างอิงและรักษาศูนย์นำหน้า เช่น `0004`
- เก็บ Shop Name 1 เป็นชื่อหลัก และ Shop name 2 สำหรับค้นหาเพิ่มเติม โดยคงรายการ Closed/Close และรายการชื่อ `-` ตามต้นฉบับ
- ประวัติใบแจ้งงานเก็บชื่อ/รหัสสาขาตอนบันทึก จึงไม่เปลี่ยนตามการนำเข้ารายชื่อสาขาใหม่

## ติดตั้ง / รัน

Python 3.10+ และ MySQL ที่เข้าถึงได้:

```bash
cd /opt/transport_notice
python3 -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env   # สำหรับเครื่องใหม่เท่านั้น; ห้ามทับ .env เดิม
# ตั้ง DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME ใน .env
venv/bin/python scripts/db_init.py
bash scripts/start.sh
```

หน้า phpMyAdmin ที่ให้มาเป็นเครื่องมือจัดการฐานข้อมูล ตัวแอปเชื่อม MySQL โดยตรงด้วย `.env` ไม่ใช้ URL phpMyAdmin เป็น API

## นำเข้าสาขาจาก All → All Shop

```bash
venv/bin/python scripts/import_shops.py attach_files_here/All.xlsx
# สร้าง/อัปเกรดโครงสร้างตารางก่อนนำเข้า (รันซ้ำได้)
venv/bin/python scripts/db_init.py
# ใช้รายการจากไฟล์นี้เป็นรายการเลือกสาขาปัจจุบัน:
venv/bin/python scripts/import_shops.py attach_files_here/All.xlsx --replace-active --apply
```

รองรับทั้งชีต `All Shop` ตามไฟล์จริงและชีต `Shop` แบบทั่วไป รักษาศูนย์นำหน้าทั้งเซลล์ข้อความและรูปแบบตัวเลข `0000` โปรแกรมตรวจข้อมูลที่จำเป็น/รายการซ้ำ/ความยาวก่อนเขียนทั้งหมดใน transaction เดียว `--replace-active` ปิดการเลือกสาขาที่ไม่มีในไฟล์ใหม่ โดยไม่ลบข้อมูลเก่าหรือเปลี่ยนประวัติใบแจ้งงาน หากต้องการเพิ่ม/ปรับเฉพาะสาขาโดยคงสาขาอื่นไว้ ให้ละ `--replace-active`

ชีต `Shop` ทั่วไปปรับชื่อหัวคอลัมน์ด้วย `--brand`, `--shop-id`, `--code`, `--name` ได้ ส่วน `All Shop` ใช้ Company จับคู่กับแบรนด์ที่ตรวจสอบแล้ว และหยุดเมื่อพบ Company ใหม่ที่ยังไม่มีการจับคู่

## ทดสอบ

```bash
venv/bin/pip install -r requirements-dev.txt
venv/bin/python -m unittest discover -s tests
node tests/test_dates.cjs
node tests/test_branches.cjs
TRANSPORT_DB_TEST=1 venv/bin/python -m unittest discover -s tests
```

ชุด MySQL ใช้ตาราง TEMPORARY เท่านั้น ไม่เปลี่ยนข้อมูลจริง ทดสอบลำดับ 1,2,3 การลบไม่ใช้เลขซ้ำ และวันใหม่เริ่ม 1

## รันอัตโนมัติด้วย systemd

ส่วนนี้ต้องใช้บัญชีที่มีสิทธิ์ sudo และทำในช่วงหยุดใช้งาน:

```bash
cd /opt/transport_notice
# หยุด process เดิมที่ใช้พอร์ต 8606 ก่อนเปิด service
sudo cp deploy/transport-notice.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now transport-notice
```

`.env`, token, virtualenv และไฟล์บริษัทที่แนบไม่ขึ้น GitHub การเชื่อม GitHub ใช้ credential helper เฉพาะเครื่องและไฟล์ token ที่ป้องกันสิทธิ์ไว้ใน `.runtime/` ไม่ฝัง token ในหน้าเว็บหรือ source ระบบปัจจุบันไม่มี login จึงออกแบบให้ใช้งานในเครือข่ายสำนักงาน การเปิดใช้นอกสำนักงานยังไม่ได้จัดเตรียม
