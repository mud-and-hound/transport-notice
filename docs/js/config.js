/* =============================================================================
   config.js — ที่อยู่ API
   - GitHub Pages ต้องตั้ง API_PUBLIC เป็น HTTPS endpoint ที่ใช้งานได้ก่อน
   - เปิดจากเซิร์ฟเวอร์ตรง (http://10.8.1.88:8606) → เรียก /api ของเครื่องเดียวกัน
   - เปิดไฟล์ตรงๆ ในเครื่อง (file://) → เรียกเซิร์ฟเวอร์ในออฟฟิศ
   ============================================================================= */
const API_PUBLIC = ""; // ยังไม่ได้เผยแพร่ API ภายนอก; ใช้เว็บจาก LAN ได้ทันที
const API_LAN = "http://10.8.1.88:8606/api";

const API_BASE = (() => {
  if (location.protocol === "file:") return API_LAN;
  if (location.hostname.endsWith("github.io")) return API_PUBLIC;
  return "/api";
})();
