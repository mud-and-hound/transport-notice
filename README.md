# ใบแจ้งงานขนส่ง SST

เว็บภาษาไทยแบบ Excel สำหรับคอม และแบบการ์ด/ฟอร์มสำหรับมือถือ โทนกรมท่า–ทอง–ขาว ปรับตัวอักษรได้ 3 ขนาด

## เปิดใช้งาน

- ในเครือข่ายสำนักงาน: http://10.8.1.88:8606/
- เปิด `transport-notice.code-workspace` ใน VS Code
- ไฟล์แนบ: `attach_files_here/` — วางไฟล์ **All.xlsx** และฟอร์ม **ใบแจ้งงานขนส่ง SST.xlsx** ได้เลย
- Source: private repository บน GitHub; ยังไม่ได้เผยแพร่ GitHub Pages หรือ API ภายนอก

ตำแหน่งปัจจุบัน: `/opt/vehiclelog/transport_notice` เพราะบัญชีนี้ไม่มีสิทธิ์สร้างโฟลเดอร์ตรง `/opt` ส่วนตำแหน่งปลายทางที่ต้องการคือ `/opt/transport_notice`

## พฤติกรรม

- 1 แถว = 1 รายการขนส่ง ตามคอลัมน์ภาพอ้างอิง
- ลำดับและเลขงานจองโดย MySQL ตามวันที่บันทึก **Asia/Bangkok** เริ่ม 1 ใหม่หลังเที่ยงคืน การแก้วันที่ฝาก/วันที่ส่งไม่เปลี่ยนเลขงาน
- รหัสแสดงเป็น `TP-0001`, `TP-0002`, … ตามตัวอย่างภาพ สามารถเปลี่ยน prefix/จำนวนหลักใน `backend/main.py`
- เลขงานต้องอ้างพร้อมวันที่ เพราะเลขซ้ำข้ามวันได้ เลขที่ลบแล้วไม่ถูกนำกลับมาใช้
- วันที่ฝาก/ส่งเริ่มที่วันนี้ มีปฏิทินเลือกได้ทั้งย้อนหลังและล่วงหน้า
- พิมพ์ชื่อและแผนกเอง เลือกสาขาในป๊อปอัพ ค้นได้จากเลข ชื่อ รหัส และแบรนด์
- จำนวนพิมพ์หรือกด +/− ได้ ตั้งแต่ 1–99,999 หน่วยมี กล่อง/ซอง/แพค/ขวด/ชิ้น
- ตารางคอมบันทึกการแก้ไขอัตโนมัติ แถวใหม่กดบันทึก มือถือใช้ฟอร์มกดบันทึก
- ค้นหา พิมพ์ A4 แนวนอน และส่งออก `.xlsx` จริง (14 คอลัมน์ ตามรายการที่กรอง)
- ฐานข้อมูล `timemud`: `transport_jobs`, `transport_daily_counter`, `transport_branches` แยกจากตารางเดิม เช่น `audit_logs`
- มีสาขาเดิม 1,037 รายการจาก master ที่เตรียมไว้ก่อนหน้า **ยังไม่ได้ตรวจเทียบกับไฟล์ All → Shop ที่รอแนบ**
- ฟอร์มปัจจุบันอ้างอิงภาพ ยังต้องปรับรายละเอียดตามไฟล์ Excel SST ฉบับจริงเมื่อได้รับ

## ติดตั้ง / รัน

Python 3.10+ และ MySQL ที่เข้าถึงได้:

```bash
cd /opt/vehiclelog/transport_notice
python3 -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env   # สำหรับเครื่องใหม่เท่านั้น; ห้ามทับ .env เดิม
# ตั้ง DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME ใน .env
venv/bin/python scripts/db_init.py
bash scripts/start.sh
```

หน้า phpMyAdmin ที่ให้มาเป็นเครื่องมือจัดการฐานข้อมูล ตัวแอปเชื่อม MySQL โดยตรงด้วย `.env` ไม่ใช้ URL phpMyAdmin เป็น API

## นำเข้าสาขาจาก All → Shop

```bash
venv/bin/python scripts/import_shops.py attach_files_here/All.xlsx
# ตรวจหัวตาราง/ตัวอย่างก่อน แล้วนำเข้า:
venv/bin/python scripts/import_shops.py attach_files_here/All.xlsx --apply
```

ถ้าชื่อหัวคอลัมน์ไม่ตรง ใช้ `--brand`, `--shop-id`, `--code`, `--name` ตามชื่อหัวตารางจริง โปรแกรมจะหยุดเมื่อข้อมูลว่าง/ซ้ำ/ยาวเกิน และตรวจครบก่อนเริ่มเขียน ไม่ลบสาขาเดิมหรือเปลี่ยนประวัติใบแจ้งงาน เลขสาขาที่มีศูนย์นำหน้าควรเก็บเป็นข้อความใน Excel

## ทดสอบ

```bash
venv/bin/pip install -r requirements-dev.txt
venv/bin/python -m unittest discover -s tests
node tests/test_dates.cjs
TRANSPORT_DB_TEST=1 venv/bin/python -m unittest discover -s tests
```

ชุด MySQL ใช้ตาราง TEMPORARY เท่านั้น ไม่เปลี่ยนข้อมูลจริง ทดสอบลำดับ 1,2,3 การลบไม่ใช้เลขซ้ำ และวันใหม่เริ่ม 1

## ย้ายไป /opt/transport_notice และรันอัตโนมัติ

ส่วนนี้ต้องใช้บัญชีที่มีสิทธิ์ sudo และทำในช่วงหยุดใช้งาน:

```bash
sudo install -d -o ubuntu1 -g ubuntu1 /opt/transport_notice
rsync -a --exclude venv --exclude __pycache__ /opt/vehiclelog/transport_notice/ /opt/transport_notice/
cd /opt/transport_notice
python3 -m venv venv
venv/bin/pip install -r requirements.txt
# หยุด process เดิมที่ใช้พอร์ต 8606 ก่อนเปิด service
sudo cp deploy/transport-notice.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now transport-notice
```

`.env`, token, virtualenv และไฟล์บริษัทที่แนบไม่ขึ้น GitHub การเชื่อม GitHub ใช้ credential helper เฉพาะเครื่องใน `.runtime/` ซึ่งอ่าน token จากไฟล์ต้นทางที่ป้องกันสิทธิ์ไว้ ไม่ฝัง token ในหน้าเว็บหรือ source ระบบปัจจุบันไม่มี login จึงออกแบบให้ใช้งานในเครือข่ายสำนักงาน การเปิดใช้นอกสำนักงานยังไม่ได้จัดเตรียม
