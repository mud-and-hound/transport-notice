/* =============================================================================
   config.js — ที่อยู่ API
   - GitHub Pages → เรียก API ผ่าน Cloudflare Tunnel (ต้องใส่รหัสเข้าใช้งานครั้งแรก)
   - เปิดจากเซิร์ฟเวอร์ตรง (http://10.8.1.88:8606) → เรียก /api ของเครื่องเดียวกัน
   - เปิดไฟล์ตรงๆ ในเครื่อง (file://) → เรียกเซิร์ฟเวอร์ในออฟฟิศ
   ============================================================================= */
const API_PUBLIC = "https://transport-notice.mobile1234.site/api";
const API_LAN = "http://10.8.1.88:8606/api";

const API_BASE = (() => {
  if (location.protocol === "file:") return API_LAN;
  if (location.hostname.endsWith("github.io")) return API_PUBLIC;
  return "/api";
})();
