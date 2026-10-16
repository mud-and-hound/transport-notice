# บันทึกงาน — ใบแจ้งงานขนส่ง (transport_notice)

สรุปสิ่งที่ทำกับโปรเจกต์นี้ เรียงตามเวลา + กติกาที่ต้องยึดต่อจากนี้

## สถานะปัจจุบัน

| เรื่อง | ค่า |
|---|---|
| โฟลเดอร์โปรเจกต์ | `/opt/transport_notice` (แยกจาก `/opt/vehiclelog` แล้ว) |
| เว็บใช้งานจริง (ในออฟฟิศ) | http://10.8.1.88:8606/ — FastAPI พอร์ต 8606 |
| GitHub | https://github.com/mud-and-hound/transport-notice (Public) |
| GitHub Pages | https://mud-and-hound.github.io/transport-notice/ — ดูหน้าจอได้อย่างเดียว ยังไม่เชื่อม API |
| ฐานข้อมูล | MySQL `timemud` บน 10.8.1.88 (phpMyAdmin พอร์ต 81) |
| ตารางของโปรเจกต์ | `transport_notice_jobs`, `transport_notice_daily_counter`, `transport_notice_branches` |
| ไฟล์แนบ | `attach_files_here/All.xlsx`, `attach_files_here/ใบแจ้งงานขนส่ง SST.xlsx` (ไม่ขึ้น GitHub) |

## กติกาที่ต้องยึด

- **ฐานข้อมูลต้องอยู่ใน `timemud` เท่านั้น** ห้ามแยกไปสร้างฐานข้อมูลใหม่
- **ทุกตารางต้องขึ้นต้นด้วย `transport_notice_`** ให้ตรงชื่อโปรเจกต์ และไม่ชนกับตารางเดิมของ TimeMud (`audit_logs`, `users`, `branches`, …)
- ห้ามแก้/ลบตารางอื่นของ TimeMud
- `.env`, token GitHub (`.runtime/`), `venv/` และไฟล์ใน `attach_files_here/` ไม่ขึ้น GitHub

## ไทม์ไลน์

### 15 ต.ค. 2026 (ทำโดย Codex)

1. **17:01 สร้างระบบเวอร์ชันแรก** (`f282329`)
   - หน้าเว็บภาษาไทยแบบ Excel บนคอม + ฟอร์มการ์ดบนมือถือ โทนกรมท่า–ทอง ปรับขนาดตัวอักษรได้ 3 ระดับ
   - ลำดับ / Job No. (`TP-0001`, …) รันต่อเนื่องและเริ่ม 1 ใหม่ทุกเที่ยงคืนเวลาไทย
   - วันที่ฝาก/ส่ง เป็นปฏิทิน ค่าเริ่มต้น = วันนี้
   - สาขาผู้รับ/ผู้ส่ง เป็นป๊อปอัพค้นหา, จำนวนมีปุ่ม − / +, หน่วย กล่อง/ซอง/แพค/ขวด/ชิ้น
   - พิมพ์ A4 แนวนอน, ส่งออก `.xlsx`
   - Backend FastAPI + MySQL ใน `timemud` (ตาราง `transport_*`), ชุดทดสอบ, GitHub Actions
   - ตอนแรกวางผิดที่ `/opt/vehiclelog/transport_notice` (ซ้อนในโปรเจกต์อื่น)
2. **17:04** แก้ตัวอักษรขยายแล้วล้นจอมือถือเล็ก (`c2c690d`)
3. **17:14 ย้ายโปรเจกต์ไป `/opt/transport_notice`** หลังผู้ใช้สร้างโฟลเดอร์ด้วย sudo แล้ว และลบโฟลเดอร์ที่ซ้อนใน vehiclelog ออก (`e1af865`)
4. **17:37** เปลี่ยน repository GitHub จาก Private → **Public** (`0367f85`)
5. **17:59 ปรับให้ตรงไฟล์จริง** ที่แนบมา (`35121dd`)
   - ฟอร์ม 14 คอลัมน์ตาม **ใบแจ้งงานขนส่ง SST.xlsx**
   - นำเข้าสาขา **124 รายการ** จาก **All.xlsx → Sheet All Shop** ใช้ Shop Code เป็นเลขอ้างอิง (คงศูนย์นำหน้า เช่น `0004`) ค้นได้ทั้งเลข ชื่อหลัก ชื่อรอง
   - ย้าย `index.html` ขึ้นมาที่รากโปรเจกต์
6. **18:00** เปิด GitHub Pages (ดูหน้าจอได้อย่างเดียว) (`3c73596`)

### 16 ต.ค. 2026

7. **09:07 (Codex — ผิดจากที่สั่ง)** ย้าย 3 ตารางออกจาก `timemud` ไปฐานข้อมูลใหม่ชื่อ `transport_notice` (`0a489fc`)
8. **09:11 (Claude) แก้กลับ** ตามที่ผู้ใช้สั่ง
   - ย้ายตารางกลับเข้า `timemud` ด้วย `RENAME TABLE` (ไม่คัดลอก/ไม่สูญข้อมูล) และเปลี่ยนชื่อให้ตรงโปรเจกต์:
     - `transport_branches` → `transport_notice_branches` (1,057 แถว, ใช้งาน 124 สาขา)
     - `transport_daily_counter` → `transport_notice_daily_counter` (1 แถว)
     - `transport_jobs` → `transport_notice_jobs` (14 แถว)
   - ตรวจข้อมูลและโครงสร้างก่อน/หลังตรงกันทุกแถว
   - แก้โค้ด (`backend/`, `scripts/`, `sql/`, `tests/`), `.env`, `.env.example`, README ให้ใช้ `timemud` + ชื่อตารางใหม่
   - รีสตาร์ทเว็บพอร์ต 8606 ตรวจ health / รายการงาน / สาขา / ส่งออก Excel ผ่าน และทดสอบกับ MySQL จริง (ตาราง TEMPORARY) ผ่าน
   - Backup ก่อนย้าย: `.runtime/database-backups/20261016-091143-to-timemud/`

## ยังค้าง / ต้องทำต่อ

- [ ] ลบฐานข้อมูลว่าง `transport_notice` ใน phpMyAdmin (ไม่มีตารางแล้ว — สิทธิ์อัตโนมัติไม่อนุญาตให้ Claude ลบเอง)
- [ ] ติดตั้ง systemd (`deploy/transport-notice.service`) ต้องใช้ sudo — ตอนนี้เว็บรันเป็น process ธรรมดา ถ้าเครื่องรีบูตต้องสั่ง `bash scripts/start.sh` เอง
- [ ] GitHub Pages ยังบันทึกข้อมูลไม่ได้ (ไม่มี API สาธารณะ) ใช้งานจริงผ่าน http://10.8.1.88:8606/
- [ ] ระบบยังไม่มี login จึงควรใช้ในเครือข่ายสำนักงานเท่านั้น
