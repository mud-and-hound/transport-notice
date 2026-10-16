# บันทึกงาน — ใบแจ้งงานขนส่ง (transport_notice)

สรุปสิ่งที่ทำกับโปรเจกต์นี้ เรียงตามเวลา + กติกาที่ต้องยึดต่อจากนี้

## สถานะปัจจุบัน

| เรื่อง | ค่า |
|---|---|
| โฟลเดอร์โปรเจกต์ | `/opt/transport_notice` (แยกจาก `/opt/vehiclelog` แล้ว) |
| เว็บใช้งานจริง (ในออฟฟิศ) | http://10.8.1.88:8606/ — FastAPI พอร์ต 8606 |
| GitHub | https://github.com/mud-and-hound/transport-notice (Public) |
| GitHub Pages | https://mud-and-hound.github.io/transport-notice/ — ✅ เชื่อมฐานข้อมูลแล้ว ผ่าน `https://transport-notice.mobile1234.site/api` — เปิดใช้ได้เลย ไม่ต้องใส่รหัส |
| Cloudflare Tunnel | ชื่อ `transport_notice` (`5a73f48c-…`), config `~/.cloudflared/transport-notice.yml` → `localhost:8606` — รันอยู่ (log: `.runtime/tunnel.log`) |
| รหัสเข้าใช้งาน | **ปิดอยู่** (`ACCESS_KEY=` ว่างใน `.env`) — ผู้ใช้ขอให้ใช้ได้เลยไม่ต้องมีรหัส; รหัสเดิมเก็บเป็นคอมเมนต์ใน `.env` เผื่อเปิดกลับ |
| ฐานข้อมูล | MySQL **`transport_notice`** (ฐานข้อมูลเฉพาะโปรเจกต์) บน 10.8.1.88 (phpMyAdmin พอร์ต 81) |
| ตารางของโปรเจกต์ | `transport_notice_jobs`, `transport_notice_daily_counter`, `transport_notice_branches` |
| ไฟล์แนบ | `attach_files_here/All.xlsx`, `attach_files_here/ใบแจ้งงานขนส่ง SST.xlsx` (ไม่ขึ้น GitHub) |

## กติกาที่ต้องยึด

- **ฐานข้อมูลของโปรเจกต์คือ `transport_notice`** แยกจาก `timemud` — ห้ามเอาตารางไปไว้ใน `timemud`
- **ทุกตารางขึ้นต้นด้วย `transport_notice_`** ตามชื่อโปรเจกต์
- ห้ามแก้/ลบตารางของ TimeMud (`audit_logs`, `users`, `branches`, …)
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

7. **09:07 (Codex — ถูกต้องตามที่ผู้ใช้ต้องการ)** ย้าย 3 ตารางออกจาก `timemud` ไปฐานข้อมูลใหม่ชื่อ `transport_notice` (`0a489fc`)
8. **09:11 (Claude — ตีความคำสั่งผิด)** อ่าน "สร้างใน timemud ทำไม เอาออกเลยนะ" ผิดเป็น "ให้อยู่ใน timemud" จึงย้ายกลับ
   - ย้ายตารางกลับเข้า `timemud` ด้วย `RENAME TABLE` (ไม่คัดลอก/ไม่สูญข้อมูล) และเปลี่ยนชื่อให้ตรงโปรเจกต์:
     - `transport_branches` → `transport_notice_branches` (1,057 แถว, ใช้งาน 124 สาขา)
     - `transport_daily_counter` → `transport_notice_daily_counter` (1 แถว)
     - `transport_jobs` → `transport_notice_jobs` (14 แถว)
   - ตรวจข้อมูลและโครงสร้างก่อน/หลังตรงกันทุกแถว
   - แก้โค้ด (`backend/`, `scripts/`, `sql/`, `tests/`), `.env`, `.env.example`, README ให้ใช้ `timemud` + ชื่อตารางใหม่
   - รีสตาร์ทเว็บพอร์ต 8606 ตรวจ health / รายการงาน / สาขา / ส่งออก Excel ผ่าน และทดสอบกับ MySQL จริง (ตาราง TEMPORARY) ผ่าน
   - Backup ก่อนย้าย: `.runtime/database-backups/20261016-091143-to-timemud/`
9. **09:15–09:20 (Claude) เตรียมเชื่อม GitHub Pages กับฐานข้อมูล**
   - ไม่ต้องใช้ token GitHub — เครื่องนี้มีสิทธิ์ Cloudflare (`~/.cloudflared/cert.pem`) อยู่แล้ว ใช้วิธีเดียวกับโปรเจกต์อื่น (`*.mobile1234.site`)
   - เพิ่ม **รหัสเข้าใช้งาน** (`ACCESS_KEY` ใน `.env`): คำขอที่มาทาง Cloudflare (มี header `CF-Connecting-IP`) ต้องส่ง `X-Access-Key` ถูกต้อง ไม่งั้นได้ 401; ในออฟฟิศ 10.8.1.88:8606 ใช้ได้เหมือนเดิมไม่ต้องใส่รหัส; ถ้า `ACCESS_KEY` ว่าง = ปิดทางอินเทอร์เน็ตทั้งหมด
   - หน้าเว็บ: เปิดจาก GitHub Pages ครั้งแรกจะเด้งป๊อปอัพ "รหัสเข้าใช้งาน" ใส่ครั้งเดียวเครื่องจำไว้ (พิมพ์ตัวเล็ก/มีเว้นวรรคได้)
   - `config.js` ตั้ง `API_PUBLIC = https://transport-notice.mobile1234.site/api`
   - สร้าง Cloudflare Tunnel `transport_notice` + config `~/.cloudflared/transport-notice.yml` + ไฟล์ `deploy/cloudflared-transport-notice.service`
   - ⚠️ คำสั่ง `route dns` ครั้งแรกไปผูก DNS กับ tunnel `mobile_dashboard` (เพราะ cloudflared อ่าน `~/.cloudflared/config.yml` เป็นค่าเริ่มต้น) ต้องสั่งซ้ำพร้อม `--config` และ `--overwrite-dns` — ระบบสิทธิ์อัตโนมัติไม่ให้ Claude ทำขั้นนี้และขั้นเปิด tunnel

10. **09:35 (Claude) แก้ตามที่ผู้ใช้ยืนยันจากหน้า phpMyAdmin** — ฐานข้อมูลต้องเป็น `transport_notice`
   - แก้โค้ด/ค่าเริ่มต้น (`backend/db.py`, `.env.example`, `sql/`, `scripts/`) ให้ใช้ฐานข้อมูล `transport_notice` ชื่อตารางคง `transport_notice_*`
   - สคริปต์ย้ายตารางจาก `timemud` → `transport_notice` (backup + ตรวจทุกแถว + ย้อนกลับอัตโนมัติถ้าพลาด) ระบบสิทธิ์ไม่ให้ Claude รัน ผู้ใช้จึงรันเอง
   - รอบแรกล้มเหลวตอนเชื่อม MySQL เพราะ MySQL ถูก OOM killer หยุดตอน 10:04 (RAM เครื่องเต็ม ไม่มี swap) — ไม่มีข้อมูลเปลี่ยน
11. **10:30 ย้ายสำเร็จ** ตารางทั้ง 3 อยู่ใน `transport_notice` แล้ว (1,057 สาขา / ใช้งาน 124, ตัวนับ 1, ใบแจ้งงาน 14) ข้อมูลและโครงสร้างตรงกันทุกแถว `timemud` เหลือเฉพาะตารางของ TimeMud
   - `.env` → `DB_NAME=transport_notice` เว็บรีสตาร์ทแล้ว ตรวจ health / รายการงาน / ส่งออก Excel / รหัสเข้าใช้งาน / ทดสอบ MySQL จริง ผ่าน
   - Backup: `.runtime/database-backups/20261016-103002-to-transport_notice/`
12. **10:34 (Claude) เปิดทางเชื่อม GitHub Pages ↔ ฐานข้อมูล** ตามที่ผู้ใช้สั่ง
   - แก้ DNS `transport-notice.mobile1234.site` ให้ชี้ tunnel `transport_notice` (เดิมผูกผิดไป `mobile_dashboard`) และเปิด tunnel (4 connection: bkk07 / sin)
   - ทดสอบจากอินเทอร์เน็ตจริง: ไม่มีรหัส → 401, preflight จาก github.io ผ่าน, มีรหัส → ได้ข้อมูล (สาขา 124, งาน 15 ต.ค. 11 รายการ)
   - ทดสอบด้วยเบราว์เซอร์จริง (headless Chromium) บน GitHub Pages: ป๊อปอัพขอรหัส → รหัสผิดถามซ้ำ → รหัสถูก (พิมพ์ตัวเล็กได้) โหลดข้อมูลได้ → รีโหลดไม่ถามซ้ำ, ไม่มี JavaScript error
   - แก้บั๊กปุ่มวันที่แสดงคำว่า "null" เมื่อดูวันที่ไม่ใช่วันนี้
13. **10:41 (Claude) ยกเลิกรหัสเข้าใช้งาน** ตามที่ผู้ใช้ขอ "ใช้ได้เลย"
   - `ACCESS_KEY` ว่าง = ไม่ต้องใช้รหัส (เดิมว่าง = ปิดทางอินเทอร์เน็ต) โค้ดรหัสยังอยู่ เปิดกลับได้แค่ใส่รหัสใน `.env`
   - ทดสอบ GitHub Pages ด้วยเบราว์เซอร์จริง ทั้งคอมและมือถือ: ไม่มีป๊อปอัพ ข้อมูลขึ้นทันที (15 ต.ค. 11 รายการ) ไม่มี error

## ยังค้าง / ต้องทำต่อ

- [ ] **ตั้งให้เว็บ + tunnel เปิดเองหลังรีบูต** (ต้องใช้ sudo) — ตอนนี้ทั้งสองรันเป็น process ธรรมดา ถ้าเครื่องรีบูต GitHub Pages จะเชื่อมไม่ได้จนกว่าจะเปิดใหม่:
  ```bash
  sudo cp /opt/transport_notice/deploy/transport-notice.service /opt/transport_notice/deploy/cloudflared-transport-notice.service /etc/systemd/system/
  sudo systemctl daemon-reload
  # หยุด process เดิมก่อน แล้วเปิดผ่าน systemd
  kill $(cat /opt/transport_notice/.runtime/server.pid); pkill -f transport-notice.yml
  sudo systemctl enable --now transport-notice cloudflared-transport-notice
  ```
  ถ้ายังไม่ได้ติดตั้ง แล้วเครื่องรีบูต ให้เปิดเองด้วย `bash scripts/start.sh` และ `cloudflared tunnel --no-autoupdate --config ~/.cloudflared/transport-notice.yml run transport_notice`
- [ ] ⚠️ ไม่มี login และไม่มีรหัส — ใครมีลิงก์ GitHub Pages ก็ดู/เพิ่ม/แก้/ลบใบแจ้งงานได้ (การลบเป็นแบบซ่อน `deleted_at` กู้คืนจากฐานข้อมูลได้) ถ้าต้องการจำกัด: ใส่ `ACCESS_KEY` ใน `.env` แล้วรีสตาร์ทเว็บ หน้าเว็บจะถามรหัสเองโดยไม่ต้องแก้โค้ด
- [ ] RAM เครื่อง 10.8.1.88 เกือบเต็ม (15 GB ใช้ 13 GB, ไม่มี swap) จน MySQL ถูก OOM killer หยุด 1 ครั้ง (16 ต.ค. 10:04) — ปิด VS Code server เวอร์ชันเก่าที่ค้าง หรือเพิ่ม swap
