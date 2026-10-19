# บันทึกการทำงาน — ใบแจ้งงานขนส่ง SST (transport_notice)

บันทึกงานทั้งหมดของโปรเจกต์ ตั้งแต่เริ่มสร้างจนถึงปัจจุบัน
อัปเดตล่าสุด: **19 ต.ค. 2026**

---

## 1. ภาพรวม

ระบบบันทึก **ใบแจ้งงานขนส่ง** แทนไฟล์ Excel "ใบแจ้งงานขนส่ง SST" ใช้ได้ทั้งคอม (ตารางแบบ Excel) และมือถือ (การ์ด + ฟอร์ม)

| เรื่อง | ค่า |
|---|---|
| หน้าเว็บหลัก (ใช้ได้ทุกที่) | https://mud-and-hound.github.io/transport-notice/ |
| หน้าเว็บในออฟฟิศ | http://10.8.1.88:8606/ |
| Source code | https://github.com/mud-and-hound/transport-notice (Public) |
| โฟลเดอร์บนเซิร์ฟเวอร์ | `/opt/transport_notice` |
| ฐานข้อมูล | MySQL **`transport_notice`** บน 10.8.1.88 (phpMyAdmin: http://10.8.1.88:81) |
| ตาราง | `transport_notice_jobs`, `transport_notice_daily_counter`, `transport_notice_branches` |
| ทางเชื่อมอินเทอร์เน็ต | Cloudflare Tunnel `transport_notice` → `https://transport-notice.mobile1234.site` → `localhost:8606` |
| รหัสเข้าใช้งาน | **ปิดอยู่** — ใช้ได้เลยไม่ต้องใส่รหัส |

### การเชื่อมต่อ

```
ผู้ใช้ (คอม/มือถือ)
   │
   ├─ https://mud-and-hound.github.io/transport-notice/   (หน้าเว็บบน GitHub Pages)
   │        │  เรียก API
   │        ▼
   │  https://transport-notice.mobile1234.site/api        (Cloudflare Tunnel)
   │        │
   └─ http://10.8.1.88:8606/ (ในออฟฟิศ) ──────┐
                                              ▼
                         FastAPI บน 10.8.1.88 พอร์ต 8606  (backend/main.py)
                                              │
                                              ▼
                         MySQL ฐานข้อมูล transport_notice
```

---

## 2. ความต้องการ และสิ่งที่ทำ

| ความต้องการ (จากผู้ใช้) | ทำแล้วเป็นแบบนี้ |
|---|---|
| หน้าเว็บแบบ Excel มินิมอล หรูหรา สีอ่านง่ายสำหรับผู้สูงอายุ | โทนกรมท่า–ทอง–ขาว ฟอนต์ Sarabun ปรับตัวอักษรได้ 3 ขนาด (ก ก ก) |
| ใช้ได้ทั้งมือถือและคอม มี 2 เวอร์ชัน | คอม = ตารางแก้ในช่อง บันทึกอัตโนมัติ / มือถือ = การ์ด + ฟอร์มเต็มจอ สลับเองตามจอ หรือกดปุ่ม "คอม / มือถือ" |
| ยึดฟอร์มไฟล์ **ใบแจ้งงานขนส่ง SST.xlsx** | 14 คอลัมน์ตามไฟล์ต้นฉบับ ทั้งหน้าจอ งานพิมพ์ และไฟล์ส่งออก |
| ลำดับ / รหัสงาน Job No. รัน 1, 2, 3 … เริ่มใหม่ตอนเที่ยงคืน | ฐานข้อมูลออกเลขให้ `TP-0001`, `TP-0002`, … เริ่ม 1 ใหม่ทุกวันตามเวลาไทย เลขที่ลบแล้วไม่ถูกใช้ซ้ำ |
| วันที่ฝาก / วันที่ส่ง เป็นปฏิทิน ค่าเริ่มต้นวันนี้ เปลี่ยนได้ | ปฏิทินภาษาไทย มีปุ่ม "วันนี้" "พรุ่งนี้" เลือกย้อนหลัง/ล่วงหน้าได้ |
| ผู้รับ / แผนก / ผู้ส่ง พิมพ์เอง | ช่องพิมพ์อิสระ |
| สาขาผู้รับ / ผู้ส่ง จากไฟล์ **All.xlsx** ค้นหาแบบป๊อปอัพ | 124 สาขาจากชีต **All Shop** ค้นได้ทั้งเลข Shop Code, ชื่อหลัก, ชื่อรอง, แบรนด์ จำสาขาที่ใช้ล่าสุด 8 รายการ |
| รายละเอียดสิ่งที่ส่ง / หมายเหตุ พิมพ์เอง | ช่องพิมพ์อิสระ |
| จำนวน พิมพ์ได้ หรือกด − / + | `−  21  +` จำนวน 1–99,999 |
| หน่วย dropdown: กล่อง/ซอง/แพค/ขวด/ชิ้น | เลือกได้เฉพาะ 5 หน่วยนี้ |
| (เพิ่มเติม) | ค้นหา, พิมพ์ A4 แนวนอน, ส่งออก Excel `.xlsx`, ทำซ้ำแถว, รีเฟรชอัตโนมัติทุก 45 วินาที |
| โฟลเดอร์ใน `/opt` ชื่ออังกฤษ + โฟลเดอร์แนบไฟล์ | `/opt/transport_notice` + `attach_files_here/` |
| เก็บใน GitHub เชื่อม token ใน VS Code | repo Public, token เก็บใน `.runtime/` (ไม่ขึ้น GitHub) |
| ฐานข้อมูลชื่อตรงกับโปรเจกต์ แยกจาก timemud | ฐานข้อมูล `transport_notice` |
| เว็บบน GitHub ใช้งานได้จริง เชื่อมฐานข้อมูล | ผ่าน Cloudflare Tunnel ไม่ต้องใส่รหัส |

---

## 3. บันทึกการทำงานตามลำดับเวลา

### 15 ต.ค. 2026 — สร้างระบบ (Codex)

| เวลา | งาน | commit |
|---|---|---|
| ช่วงบ่าย | รับโจทย์ เริ่มสร้างระบบ | |
| 17:01 | **สร้างเวอร์ชันแรก**: หน้าเว็บคอม + มือถือ, เลขงานรายวัน, ปฏิทิน, ค้นหาสาขา, จำนวน −/+, หน่วย, พิมพ์, ส่งออก Excel, FastAPI + MySQL (ตอนนั้นใช้ฐานข้อมูล `timemud` ตาราง `transport_*`), ชุดทดสอบ, GitHub Actions, repo แบบ Private | `f282329` |
| 17:04 | แก้ตัวอักษรขนาดใหญ่ล้นจอมือถือเล็ก | `c2c690d` |
| 17:06–17:11 | ผู้ใช้พบว่าโปรเจกต์ไปอยู่ซ้อนใน `/opt/vehiclelog/transport_notice` → ต้องใช้ sudo สร้าง `/opt/transport_notice` ผู้ใช้รันให้ | |
| 17:14 | **ย้ายโปรเจกต์ไป `/opt/transport_notice`** ลบโฟลเดอร์ที่ซ้อนออก (backup: `~/.local/share/transport-notice-backups/20261015-171435`) | `e1af865` |
| 17:21 | ตรวจเว็บเข้าได้ทั้งคอมและมือถือ, GitHub Actions ผ่าน | |
| 17:37 | เปลี่ยน repo GitHub เป็น **Public** ตามที่ผู้ใช้สั่ง | `0367f85` |
| 17:44 | ผู้ใช้แนบ **All.xlsx** และ **ใบแจ้งงานขนส่ง SST.xlsx** | |
| 17:54 | นำเข้าสาขาจาก All.xlsx → All Shop (backup สาขาเดิม: `.runtime/branch-backups/20261015-175448.json`) | |
| 17:59 | **ปรับให้ตรงไฟล์จริง**: ฟอร์ม 14 คอลัมน์, 124 สาขา (Shop Code คงเลข 0 นำหน้า เช่น `0004`), ย้าย `index.html` มาไว้หน้าสุดของโปรเจกต์ | `35121dd` |
| 18:00 | เปิด GitHub Pages (ตอนนั้นดูหน้าจอได้อย่างเดียว ยังไม่เชื่อมข้อมูล) | `3c73596` |
| ระหว่างวัน | ทดลองบันทึกงานวันที่ 15 ต.ค. รวม 14 รายการ (ลบ 3 → เหลือ 11) | |

### 16 ต.ค. 2026 — ย้ายฐานข้อมูล + เชื่อม GitHub Pages

| เวลา | งาน | โดย | commit |
|---|---|---|---|
| 09:03–09:08 | สร้างฐานข้อมูล `transport_notice` และย้าย 3 ตารางออกจาก `timemud` ✅ ถูกต้องตามที่ผู้ใช้ต้องการ (backup: `.runtime/database-backups/20261016-090738`) | Codex | `0a489fc` |
| 09:11 | ❌ **ตีความคำสั่งผิด** อ่าน "สร้างใน timemud ทำไม เอาออกเลยนะ" เป็น "ให้อยู่ใน timemud" → ย้ายตารางกลับเข้า `timemud` และเปลี่ยนชื่อเป็น `transport_notice_*` (backup: `…/20261016-091143-to-timemud`) + สร้างไฟล์บันทึกนี้ | Claude | `c2de462` |
| 09:15–09:20 | เตรียมเชื่อม GitHub Pages: ระบบรหัสเข้าใช้งาน, ตั้งที่อยู่ API, สร้าง Cloudflare Tunnel `transport_notice` + ไฟล์ systemd — DNS ครั้งแรกผูกผิดไป tunnel `mobile_dashboard` และระบบสิทธิ์อัตโนมัติไม่ให้แก้ต่อ | Claude | `85d9005` |
| ~09:25 | ผู้ใช้ถามว่าทำไมเว็บ GitHub ไม่ขึ้นข้อมูล → อธิบายว่ายังไม่ได้เปิด tunnel | Claude | |
| ~09:30 | ผู้ใช้สร้างไฟล์ `attach_files_here/github_Token.text` → อธิบายว่า token GitHub เชื่อมฐานข้อมูลไม่ได้และใส่ในหน้าเว็บไม่ปลอดภัย; ตรวจแล้วไฟล์ไม่ขึ้น GitHub, ตั้งสิทธิ์ให้เจ้าของอ่านได้คนเดียว (600) | Claude | |
| 09:35 | ผู้ใช้ชี้ฐานข้อมูล `transport_notice` ว่างใน phpMyAdmin → แก้โค้ดให้ใช้ `transport_notice` + เตรียมสคริปต์ย้าย (ระบบสิทธิ์ไม่ให้ Claude รัน) | Claude | |
| 10:04 | ผู้ใช้รันสคริปต์ครั้งแรก ล้มเหลวเพราะ **MySQL ถูก OOM killer หยุด** (RAM เต็ม) — ข้อมูลไม่เปลี่ยน | ผู้ใช้ | |
| 10:30 | ✅ **ย้ายตารางเข้า `transport_notice` สำเร็จ** ข้อมูลตรงทุกแถว (backup: `…/20261016-103002-to-transport_notice`) | ผู้ใช้รัน / Claude ตรวจ | `a4cdae1` |
| 10:34 | ✅ **เปิดทางเชื่อม GitHub Pages ↔ ฐานข้อมูล**: แก้ DNS ให้ชี้ tunnel ที่ถูก, เปิด tunnel, ทดสอบด้วยเบราว์เซอร์จริงบนหน้า GitHub ผ่าน | Claude | |
| 10:37 | แก้บั๊กปุ่มวันที่ขึ้นคำว่า "null" เมื่อดูวันอื่นที่ไม่ใช่วันนี้ | Claude | `6b37f36` |
| 10:42 | **ยกเลิกรหัสเข้าใช้งาน** ตามที่ผู้ใช้ขอ "ใช้ได้เลย" (ระบบรหัสยังอยู่ เปิดกลับได้ด้วย `.env`) ทดสอบคอม + มือถือผ่าน | Claude | `a64632e` |
| หลังจากนั้น | มีการใช้งานจริงผ่านหน้า GitHub: บันทึกงานวันที่ 16 ต.ค. 2 รายการ (`TP-0001`, `TP-0002`) | ผู้ใช้งาน | |

### 19 ต.ค. 2026 — ตรวจสถานะ + ทำบันทึกฉบับเต็ม

- เว็บ (พอร์ต 8606) และ tunnel รันต่อเนื่องตั้งแต่ 16 ต.ค. — หน้า GitHub เชื่อมได้ปกติ
- ข้อมูลในฐานข้อมูล: สาขา 1,057 แถว (ใช้งาน 124), งาน 15 ต.ค. 14 รายการ (ลบ 3), งาน 16 ต.ค. 2 รายการ
- เขียนบันทึกนี้ใหม่เป็นฉบับเต็ม
- push ขึ้น GitHub ไม่ได้ เพราะ token GitHub ใช้ไม่ได้แล้ว (ดูข้อ 7)

---

## 4. ปัญหาที่เจอ และบทเรียน

| ปัญหา | สาเหตุ | แก้แล้ว / บทเรียน |
|---|---|---|
| โปรเจกต์ไปอยู่ซ้อนใน vehiclelog | สร้างโฟลเดอร์ใน `/opt` ต้องใช้ sudo | ผู้ใช้สร้างโฟลเดอร์ให้ แล้วย้ายมา `/opt/transport_notice` |
| ฐานข้อมูลย้ายไปมา 3 รอบ | Claude อ่านคำสั่งภาษาไทยผิดความหมาย | ตอนนี้อยู่ `transport_notice` ถาวร — ถ้าคำสั่งตีความได้ 2 ทาง ต้องถามก่อนย้ายข้อมูล |
| หน้า GitHub ไม่ขึ้นข้อมูล | GitHub Pages เป็นแค่หน้าเว็บ ไม่เห็นเครื่องในออฟฟิศ | ใช้ Cloudflare Tunnel แบบเดียวกับโปรเจกต์อื่น (`*.mobile1234.site`) |
| คิดว่าต้องใช้ token GitHub เพื่อเชื่อม DB | — | token ไม่เกี่ยวกับการเชื่อม DB และห้ามใส่ token ในหน้าเว็บ Public |
| DNS ผูกผิด tunnel | `cloudflared` อ่าน `~/.cloudflared/config.yml` (tunnel `mobile_dashboard`) เป็นค่าเริ่มต้น | ต้องสั่ง `route dns` พร้อม `--config ~/.cloudflared/transport-notice.yml` เสมอ |
| MySQL หยุดเอง 16 ต.ค. 10:04 | RAM เครื่องเต็ม (15 GB ใช้ 13 GB, ไม่มี swap) → OOM killer | ยังไม่ได้แก้ต้นเหตุ — ดูข้อ 7 |
| ปุ่มวันที่ขึ้น "null" | `replaceChildren` แปลง `null` เป็นข้อความ | แก้แล้ว (`6b37f36`) |

---

## 5. ไฟล์สำคัญในโปรเจกต์

| ไฟล์ / โฟลเดอร์ | หน้าที่ |
|---|---|
| `index.html` | หน้าเว็บหลัก (GitHub Pages ใช้ไฟล์นี้) |
| `docs/js/app.js` | โค้ดหน้าเว็บทั้งหมด (ตาราง, ฟอร์มมือถือ, ปฏิทิน, ค้นหาสาขา, พิมพ์, Excel) |
| `docs/js/config.js` | ที่อยู่ API — GitHub Pages ใช้ `https://transport-notice.mobile1234.site/api` |
| `docs/css/style.css` | หน้าตา / สี / ขนาดตัวอักษร |
| `backend/main.py` | API (FastAPI): รายการงาน, เลขงานรายวัน, สาขา, ส่งออก Excel, ระบบรหัส (ปิดอยู่) |
| `backend/db.py` | อ่าน `.env` และเชื่อม MySQL |
| `sql/001_schema.sql` | โครงสร้าง 3 ตาราง |
| `scripts/db_init.py` | สร้าง/อัปเกรดตาราง (รันซ้ำได้) |
| `scripts/import_shops.py` | นำเข้าสาขาจาก All.xlsx |
| `scripts/start.sh` | เปิดเว็บพอร์ต 8606 |
| `deploy/*.service` | ไฟล์ systemd สำหรับเว็บ และ tunnel (ยังไม่ได้ติดตั้ง) |
| `tests/` | ชุดทดสอบ (Python + JavaScript) |
| `attach_files_here/` | ไฟล์ Excel ต้นฉบับ — **ไม่ขึ้น GitHub** |
| `.env` | ค่าเชื่อมฐานข้อมูล + `ACCESS_KEY` — **ไม่ขึ้น GitHub** |
| `.runtime/` | token GitHub, log, backup ฐานข้อมูล, สคริปต์ย้ายข้อมูล — **ไม่ขึ้น GitHub** |
| `~/.cloudflared/transport-notice.yml` | config tunnel (อยู่นอกโปรเจกต์) |

---

## 6. คู่มือดูแลระบบ

```bash
cd /opt/transport_notice

# เช็กว่าเว็บทำงาน
curl http://127.0.0.1:8606/api/health
curl https://transport-notice.mobile1234.site/api/health      # ผ่านอินเทอร์เน็ต

# เปิดเว็บ (ถ้าหยุดไป เช่น หลังรีบูต)
bash scripts/start.sh

# เปิด tunnel (ถ้าหยุดไป)
cloudflared tunnel --no-autoupdate --config ~/.cloudflared/transport-notice.yml run transport_notice

# นำเข้าสาขาใหม่จาก All.xlsx (ปิดสาขาที่ไม่มีในไฟล์ใหม่ ไม่ลบประวัติ)
venv/bin/python scripts/import_shops.py attach_files_here/All.xlsx --replace-active --apply

# ทดสอบ
venv/bin/python -m unittest discover -s tests
TRANSPORT_DB_TEST=1 venv/bin/python -m unittest discover -s tests    # รวมทดสอบกับ MySQL จริง (ไม่แตะข้อมูลจริง)
```

- **เปิดรหัสเข้าใช้งานกลับ**: ใน `.env` ลบ `#` หน้าบรรทัดรหัสเดิม ลบบรรทัด `ACCESS_KEY=` ที่ว่าง แล้วรีสตาร์ทเว็บ — หน้าเว็บจะถามรหัสเอง
- **กู้รายการที่ถูกลบ**: การลบเป็นแบบซ่อน — ใน phpMyAdmin ตาราง `transport_notice_jobs` ตั้งค่า `deleted_at` ของแถวนั้นกลับเป็น `NULL`
- Log: เว็บ `.runtime/server.log`, tunnel `.runtime/tunnel.log`

### กติกาที่ต้องยึด

- ฐานข้อมูลของโปรเจกต์คือ **`transport_notice`** เท่านั้น — ห้ามเอาตารางไปไว้ใน `timemud`
- ทุกตารางขึ้นต้นด้วย `transport_notice_`
- ห้ามแก้/ลบตารางของ TimeMud (`audit_logs`, `users`, `branches`, …)
- `.env`, token, `venv/`, `.runtime/` และไฟล์ใน `attach_files_here/` ห้ามขึ้น GitHub

---

## 7. งานค้าง

- [ ] **ตั้งให้เว็บ + tunnel เปิดเองหลังรีบูต** (ต้องใช้ sudo) — ตอนนี้ทั้งสองรันเป็น process ธรรมดา ถ้าเครื่องรีบูต หน้า GitHub จะใช้ไม่ได้จนกว่าจะเปิดใหม่:
  ```bash
  sudo cp /opt/transport_notice/deploy/transport-notice.service /opt/transport_notice/deploy/cloudflared-transport-notice.service /etc/systemd/system/
  sudo systemctl daemon-reload
  kill $(cat /opt/transport_notice/.runtime/server.pid); pkill -f transport-notice.yml
  sudo systemctl enable --now transport-notice cloudflared-transport-notice
  ```
- [ ] ⚠️ **ไม่มี login และไม่มีรหัส** — ใครมีลิงก์หน้า GitHub ก็ดู/เพิ่ม/แก้/ลบใบแจ้งงานได้ (ลบแบบซ่อน กู้คืนได้) ถ้าต้องการจำกัด ให้เปิดรหัสกลับตามข้อ 6
- [ ] **RAM เครื่อง 10.8.1.88 เกือบเต็ม และไม่มี swap** — MySQL เคยถูกหยุด 1 ครั้ง กระทบทุกระบบที่ใช้ MySQL ควรปิด VS Code server / หน้าต่าง Codex ที่ค้าง หรือเพิ่ม swap
- [ ] **token GitHub ใช้ไม่ได้แล้ว** (ตรวจ 19 ต.ค.: GitHub ตอบ "Bad credentials" — หมดอายุหรือถูกยกเลิก) จึง push ขึ้น GitHub ไม่ได้ — ต้องสร้าง token ใหม่ (classic, สิทธิ์ `repo`) แล้ววางแทนตัวเดิมใน `attach_files_here/github_Token.text` จากนั้นคัดลอกไปไว้ที่ `.runtime/github_token.txt` (ไฟล์ที่ git ใช้จริง) — token เดิมในสองไฟล์นี้เป็นตัวเดียวกัน
