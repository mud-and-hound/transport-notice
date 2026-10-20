/* =============================================================================
   ใบแจ้งงานขนส่ง — app.js (vanilla JS ไม่ต้อง build)
   - เวอร์ชันคอม: ตารางแบบ Excel แก้ในช่องได้เลย บันทึกอัตโนมัติ (แถวใหม่กด "บันทึก")
   - เวอร์ชันมือถือ: การ์ด + ฟอร์มเต็มจอ
   - ลำดับ = เลขแถวของวัน, Job No. = เลขที่เซิร์ฟเวอร์ออกให้ (TP-0001 เริ่มใหม่ทุกเที่ยงคืน)
   ============================================================================= */
"use strict";

const DEFAULT_UNITS = ["กล่อง", "ซอง", "แพค", "ขวด", "ชิ้น"];   // ใช้จนกว่าจะโหลดหน่วยจริงจากเซิร์ฟเวอร์ (แก้ในหน้าตั้งค่า)
const QTY_MAX = 99999;
const BRANCH_LIMIT = 60;
const POLL_MS = 45000;
const REQUIRED = [
  ["to_branch_code", "สาขา ผู้รับ"],
  ["from_name", "จาก ผู้ส่ง"],
  ["item_detail", "รายละเอียด สิ่งที่ส่ง"],
];
const FIELDS = [
  "deposit_date", "delivery_date",
  "to_name", "to_dept", "to_branch_code", "to_branch_name", "to_brand", "to_shop_id",
  "from_name", "from_dept", "from_branch_code", "from_branch_name", "from_brand", "from_shop_id",
  "item_detail", "qty", "unit", "remark",
];
const SENDER_FIELDS = ["from_name", "from_dept", "from_branch_code", "from_branch_name", "from_brand", "from_shop_id"];
const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

// คอลัมน์ตามฟอร์ม Excel (ใช้ตอนพิมพ์และส่งออก)
const COLS = [
  { label: "ลำดับ", w: 6, get: (r, no) => no },
  { label: "รหัสงาน Job No.", w: 11, get: r => r.job_no },
  { label: "วันที่ฝาก (ว/ด/ป)", w: 12, get: r => fmtDate(r.deposit_date) },
  { label: "วันที่ส่ง (ว/ด/ป)", w: 12, get: r => fmtDate(r.delivery_date) },
  { label: "ถึง ผู้รับ", w: 18, get: r => r.to_name, left: true },
  { label: "แผนก ผู้รับ", w: 14, get: r => r.to_dept },
  { label: "สาขา ผู้รับ", w: 12, get: r => r.to_branch_code },
  { label: "จาก ผู้ส่ง", w: 14, get: r => r.from_name, from: true },
  { label: "แผนก ผู้ส่ง", w: 14, get: r => r.from_dept, from: true },
  { label: "สาขา ผู้ส่ง", w: 12, get: r => r.from_branch_code, from: true },
  { label: "รายละเอียด สิ่งที่ส่ง", w: 30, get: r => r.item_detail, left: true },
  { label: "จำนวน", w: 8, get: r => Number(r.qty) },
  { label: "หน่วย", w: 8, get: r => r.unit },
  { label: "หมายเหตุ", w: 20, get: r => r.remark, left: true },
];

const S = {
  today: bangkokISO(new Date()),
  date: null,          // วันที่กำลังดู (= วันที่บันทึก)
  jobs: [],            // รายการที่บันทึกแล้วของวันนั้น
  drafts: [],          // แถวใหม่ที่ยังไม่บันทึก (เวอร์ชันคอม)
  branches: [],
  units: DEFAULT_UNITS.slice(),   // หน่วยที่เปิดใช้ (/api/meta)
  q: "",
  loading: false,
  loadedAt: null,
};
let draftSeq = 0;

// ---------- localStorage (อาจใช้ไม่ได้ในโหมดส่วนตัว → ห่อ try/catch เสมอ) ----------
const store = {
  get(k, def) {
    try { const v = localStorage.getItem("tn." + k); return v == null ? def : JSON.parse(v); } catch { return def; }
  },
  set(k, v) {
    try { localStorage.setItem("tn." + k, JSON.stringify(v)); } catch { /* ไม่เป็นไร */ }
  },
};

// =============================================================================
//  helpers
// =============================================================================
const $ = (s, el = document) => el.querySelector(s);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "value") el.value = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  // ข้อความจากผู้ใช้ถูกใส่เป็น text node เสมอ (กัน XSS)
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

function ico(name) {
  const t = document.createElement("template");
  t.innerHTML = icon(name);
  return t.content.firstChild;
}

function pad(n) { return String(n).padStart(2, "0"); }
function bangkokISO(d) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function localISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return localISO(d); }
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${+d}/${+m}/${y}`;
}
function fmtDateLong(iso) {
  const d = parseISO(iso);
  return `${TH_DAYS[d.getDay()]} ${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
function clampQty(v) {
  v = Math.round(Number(v));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(v, QTY_MAX);
}

// แจ้งเตือนสั้นๆ ด้านล่างจอ (type: ok / err / info)
let toastTimer;
function toast(msg, type = "info") {
  const t = $("#toast");
  t.className = "toast " + type;
  t.replaceChildren(ico(type === "ok" ? "check" : type === "err" ? "triangle-warning" : "info"), h("span", null, msg));
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), type === "err" ? 4500 : 2600);
}

// ไฮไลต์คำที่ค้นหา → คืน array ของ string / <mark>
function hl(text, toks) {
  text = String(text || "");
  if (!toks.length || !text) return [text];
  const low = text.toLowerCase();
  const on = new Array(text.length).fill(false);
  for (const t of toks) {
    for (let i = low.indexOf(t); t && i !== -1; i = low.indexOf(t, i + t.length)) {
      for (let k = i; k < i + t.length; k++) on[k] = true;
    }
  }
  const out = [];
  let buf = "", cur = false;
  for (let i = 0; i < text.length; i++) {
    if (on[i] !== cur) { if (buf) out.push(cur ? h("mark", null, buf) : buf); buf = ""; cur = on[i]; }
    buf += text[i];
  }
  if (buf) out.push(cur ? h("mark", null, buf) : buf);
  return out;
}

// =============================================================================
//  API
// =============================================================================
// เปิดผ่านอินเทอร์เน็ต (GitHub Pages) เซิร์ฟเวอร์จะตอบ 401 need_key → ถามรหัสครั้งเดียวแล้วจำไว้ในเครื่อง
// ในออฟฟิศ (10.8.1.88:8606) เซิร์ฟเวอร์ไม่ขอรหัส จึงไม่เห็นป๊อปอัพนี้
async function apiFetch(path, init = {}) {
  if (!API_BASE) throw new Error("ยังไม่ได้ตั้งค่าที่อยู่เซิร์ฟเวอร์ กรุณาเปิดเว็บผ่านเซิร์ฟเวอร์ในสำนักงาน");
  for (;;) {
    const key = store.get("key", "");
    const headers = { ...(init.headers || {}) };
    if (key) headers["X-Access-Key"] = key;
    let res;
    try {
      res = await fetch(API_BASE + path, { ...init, headers });
    } catch {
      throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    }
    if (res.status !== 401) return res;
    const data = await res.clone().json().catch(() => null);
    if (!data || !data.need_key) return res;
    const typed = await askAccessKey(key ? "รหัสไม่ถูกต้อง ลองใส่ใหม่อีกครั้ง"
                                         : "ใส่รหัสที่ได้จากผู้ดูแลระบบ ใส่ครั้งเดียว เครื่องนี้จะจำไว้");
    if (!typed) throw new Error("ต้องใส่รหัสเข้าใช้งานก่อน จึงจะดูและบันทึกข้อมูลได้");
    store.set("key", typed);
  }
}

let keyAsk = null;   // หลายคำขอโดน 401 พร้อมกัน → ถามรหัสครั้งเดียว

function askAccessKey(msg) {
  if (keyAsk) return keyAsk;
  keyAsk = new Promise(resolve => {
    const m = $("#keyModal"), inp = $("#keyInput");
    $("#keyMsg").textContent = msg;
    inp.value = "";
    let done = false;
    const finish = v => { if (done) return; done = true; keyAsk = null; m._onClose = null; closeModal(m); resolve(v); };
    $("#keyForm").onsubmit = e => {
      e.preventDefault();
      const v = inp.value.trim();
      if (v) finish(v); else inp.focus();
    };
    $("#keyCancel").onclick = () => finish(null);
    openModal(m);
    m._onClose = () => finish(null);
    inp.focus();
  });
  return keyAsk;
}

async function api(path, opts = {}) {
  const res = await apiFetch(path, {
    method: opts.method || "GET",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* ไม่ใช่ JSON */ }
  if (!res.ok || (data && data.ok === false)) {
    let msg = "";
    if (data && typeof data.detail === "string") msg = data.detail;
    else if (data && Array.isArray(data.detail)) msg = "ข้อมูลไม่ถูกต้อง: " + data.detail.map(x => x.msg).join(", ");
    else if (data && data.error) msg = data.error;
    throw new Error(msg || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`);
  }
  return data;
}

function setOnline(ok, msg) {
  const b = $("#banner");
  if (ok) { b.hidden = true; return; }
  b.replaceChildren(ico("triangle-warning"), h("span", null, msg || "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"),
    h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => loadJobs() }, "ลองใหม่"));
  b.hidden = false;
}

async function loadJobs({ silent = false } = {}) {
  const date = S.date;
  if (!silent) { S.loading = true; render(); }
  try {
    const d = await api("/jobs?date=" + date);
    if (date !== S.date) return;                       // ผู้ใช้เปลี่ยนวันระหว่างโหลด
    const same = silent && S.loadedDate === date && JSON.stringify(d.items) === JSON.stringify(S.jobs.map(stripLocal));
    S.jobs = d.items;
    S.loadedDate = date;
    S.loadedAt = new Date();
    setOnline(true);
    if (same) { renderSummary(); return; }
  } catch (e) {
    setOnline(false, e.message);
  } finally {
    S.loading = false;
  }
  render();
}

function stripLocal(r) {
  const o = {};
  for (const [k, v] of Object.entries(r)) if (!k.startsWith("_")) o[k] = v;
  return o;
}

async function loadBranches() {
  const cached = store.get("branches", null);
  if (cached && Array.isArray(cached.items)) { S.branches = cached.items; indexBranches(); }
  try {
    const d = await api("/branches");
    S.branches = d.items;
    store.set("branches", { at: Date.now(), items: d.items });
    indexBranches();
  } catch (e) {
    if (!S.branches.length) toast("โหลดรายชื่อสาขาไม่ได้: " + e.message, "err");
  }
}

function indexBranches() {
  for (const b of S.branches) {
    b.tags = Array.isArray(b.tags) ? b.tags : [];   // ข้อมูลในแคชรุ่นเก่าไม่มีแท็ก
    b._s = { code: b.code.toLowerCase(), name: b.name.toLowerCase(), alternate: (b.alternate_name || "").toLowerCase(), shop: String(b.shop_id).toLowerCase(), brand: b.brand.toLowerCase(), tags: b.tags.join(" ").toLowerCase() };
  }
}

// =============================================================================
//  แถวข้อมูล
// =============================================================================
function rowKey(r) { return r.id ? "j" + r.id : r._key; }
function rowEl(r) { return document.querySelector(`#sheetBody tr[data-key="${rowKey(r)}"]`); }

function refreshDraftBranch(r, side) {
  const branch = S.branches.find(b => b.brand === r[side + "_brand"] && b.shop_id === r[side + "_shop_id"]);
  r[side + "_branch_code"] = branch?.code || "";
  r[side + "_branch_name"] = branch?.name || "";
  r[side + "_brand"] = branch?.brand || "";
  r[side + "_shop_id"] = branch?.shop_id || "";
}

function blankRow() {
  const r = {
    _key: "d" + (++draftSeq),
    deposit_date: S.today, delivery_date: S.today,
    to_name: "", to_dept: "", to_branch_code: "", to_branch_name: "", to_brand: "", to_shop_id: "",
    from_name: "", from_dept: "", from_branch_code: "", from_branch_name: "", from_brand: "", from_shop_id: "",
    item_detail: "", qty: 1, unit: S.units[0], remark: "",
  };
  // จำผู้ส่งล่าสุดของเครื่องนี้ไว้ให้ ไม่ต้องพิมพ์ซ้ำทุกแถว
  const sender = store.get("sender", {});
  for (const f of SENDER_FIELDS) if (sender[f]) r[f] = sender[f];
  refreshDraftBranch(r, "from");
  return r;
}

function copyRow(src) {
  const r = blankRow();
  for (const f of FIELDS) r[f] = src[f];
  r._from = src.job_no;
  refreshDraftBranch(r, "to");
  refreshDraftBranch(r, "from");
  if (r.deposit_date < S.today) r.deposit_date = S.today;
  if (r.delivery_date < S.today) r.delivery_date = S.today;
  return r;
}

function payload(r) {
  const o = {};
  for (const f of FIELDS) o[f] = r[f] == null ? "" : r[f];
  o.qty = clampQty(r.qty);
  return o;
}

function missing(r) { return REQUIRED.filter(([f]) => !String(r[f] || "").trim()); }
function hasContent(r) { return ["to_name", "to_dept", "to_branch_code", "item_detail", "remark"].some(f => String(r[f] || "").trim()); }

function rememberSender(r) {
  const o = {};
  for (const f of SENDER_FIELDS) o[f] = r[f] || "";
  store.set("sender", o);
}

function visibleJobs() {
  const all = S.jobs.map(row => ({ row, no: row.seq }));
  const toks = S.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return all;
  return all.filter(({ row }) => {
    const hay = [row.job_no, row.to_name, row.to_dept, row.to_branch_code, row.to_branch_name,
      row.from_name, row.from_dept, row.from_branch_code, row.from_branch_name,
      row.item_detail, row.unit, row.remark].join(" ").toLowerCase();
    return toks.every(t => hay.includes(t));
  });
}

// =============================================================================
//  วาดหน้าจอ
// =============================================================================
function isMobileView() { return document.body.classList.contains("view-mobile"); }

function render() {
  renderDateNav();
  renderSummary();
  if (isMobileView()) renderCards(); else renderSheet();
}

function renderDateNav() {
  const btn = $("#dateCurrent");
  // replaceChildren แปลง null เป็นข้อความ "null" → ใส่ป้าย "วันนี้" เฉพาะเมื่อเป็นวันนี้
  btn.replaceChildren(ico("calendar-day"), h("span", null, fmtDateLong(S.date)),
    ...(S.date === S.today ? [h("span", { class: "is-today" }, "วันนี้")] : []));
  $("#dateNext").disabled = S.date >= S.today;
  $("#dateToday").hidden = S.date === S.today;
}

function renderSummary() {
  const vis = S.q.trim() ? visibleJobs().length : null;
  const parts = [h("span", null, "ทั้งหมด ", h("b", null, S.jobs.length), " รายการ")];
  if (vis != null) parts.push(" · ", h("span", null, "ตรงกับที่ค้นหา ", h("b", null, vis), " รายการ"));
  if (S.drafts.length) parts.push(" · ", h("span", null, "แถวใหม่ยังไม่บันทึก ", h("b", null, S.drafts.length)));
  if (S.loadedAt) parts.push(h("span", { style: "float:right" }, `อัปเดต ${S.loadedAt.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })} น.`));
  $("#summary").replaceChildren(...parts);
}

// ---------- เวอร์ชันคอม: ตาราง ----------
function renderSheet() {
  const body = $("#sheetBody");
  body.replaceChildren();
  if (S.loading && !S.jobs.length) {
    body.append(emptyRow("กำลังโหลดข้อมูล…", "clock-three"));
    return;
  }
  const rows = visibleJobs();
  rows.forEach(({ row, no }) => body.append(sheetRow(row, no)));
  S.drafts.forEach(d => body.append(sheetRow(d, "–")));   // เลขจริงได้จากเซิร์ฟเวอร์ตอนกดบันทึก
  if (!rows.length && !S.drafts.length) {
    body.append(emptyRow(S.q.trim() ? "ไม่พบรายการที่ค้นหา"
      : S.date === S.today ? "ยังไม่มีรายการของวันนี้ — กด “เพิ่มรายการ” เพื่อเริ่มกรอก" : "ไม่มีรายการในวันที่เลือก", "truck"));
  }
  body.append(h("tr", { class: "add-row" }, h("td", { colspan: 15 },
    h("div", { style: "position:sticky;left:.5rem;display:inline-block" },
      h("button", { type: "button", class: "btn btn-ghost", onclick: addRow }, ico("plus"), "เพิ่มแถว")))));
}

function emptyRow(msg, ic) {
  return h("tr", { class: "sheet-empty" }, h("td", { colspan: 15 },
    h("div", { style: "position:sticky;left:0;width:min(100%,60rem)" }, ico(ic), msg)));
}

// แถวใหม่ = กรอกได้ / แถวที่บันทึกแล้ว = อ่านอย่างเดียว (จะแก้ให้กดคัดลอก → แก้ → บันทึก → ลบรายการเดิม)
function sheetRow(r, no) {
  const draft = !r.id;
  const tr = h("tr", { class: draft ? "is-draft" : null, "data-key": rowKey(r) });
  tr.append(
    h("td", { class: "td-no sticky-1" }, no),
    h("td", { class: "td-job sticky-2" }, draft ? h("span", { class: "draft-tag", title: r._from ? "คัดลอกจาก " + r._from : null }, "ใหม่") : r.job_no),
    ...(draft ? [
      tdDate(r, "deposit_date", "วันที่ฝาก"),
      tdDate(r, "delivery_date", "วันที่ส่ง"),
      tdText(r, "to_name", "ถึง ผู้รับ", 150),
      tdText(r, "to_dept", "แผนก ผู้รับ", 150),
      tdBranch(r, "to", "สาขา ผู้รับ"),
      tdText(r, "from_name", "จาก ผู้ส่ง", 150),
      tdText(r, "from_dept", "แผนก ผู้ส่ง", 150),
      tdBranch(r, "from", "สาขา ผู้ส่ง"),
      tdText(r, "item_detail", "รายละเอียด สิ่งที่ส่ง", 500),
      h("td", { "data-f": "qty" }, stepper(r, () => changed(r))),
      h("td", { "data-f": "unit" }, unitSelect(r, "cell-in", () => changed(r))),
      tdText(r, "remark", "หมายเหตุ", 500),
    ] : [
      tdView("deposit_date", fmtDate(r.deposit_date), "v-num"),
      tdView("delivery_date", fmtDate(r.delivery_date), "v-num"),
      tdView("to_name", r.to_name),
      tdView("to_dept", r.to_dept),
      tdViewBranch(r, "to"),
      tdView("from_name", r.from_name),
      tdView("from_dept", r.from_dept),
      tdViewBranch(r, "from"),
      tdView("item_detail", r.item_detail),
      tdView("qty", Number(r.qty).toLocaleString("th-TH"), "v-num v-qty"),
      tdView("unit", r.unit),
      tdView("remark", r.remark),
    ]),
    tdActions(r),
  );
  markMissing(tr, r);
  return tr;
}

function markMissing(tr, r) {
  if (!tr) return;
  const show = r.id || r._tried;
  for (const [f] of REQUIRED) {
    const td = tr.querySelector(`td[data-f="${f}"]`);
    if (td) td.classList.toggle("td-missing", !!show && !String(r[f] || "").trim());
  }
}

function tdView(f, text, cls) {
  const s = text == null ? "" : String(text);
  return h("td", { "data-f": f }, h("div", { class: "cell-view" + (cls ? " " + cls : ""), title: s || null }, s));
}

function tdViewBranch(r, side) {
  const code = r[side + "_branch_code"], name = r[side + "_branch_name"];
  return h("td", { "data-f": side + "_branch_code" },
    h("div", { class: "cell-view cell-branch", title: code ? `${code} ${name || ""}`.trim() : null },
      code ? [h("span", { class: "b-code" }, code), name ? h("span", { class: "b-name" }, name) : null] : null));
}

function tdText(r, f, label, max) {
  const inp = h("input", { class: "cell-in", type: "text", value: r[f] || "", maxlength: max, "aria-label": label, enterkeyhint: "next" });
  inp.addEventListener("input", () => { r[f] = inp.value; changed(r); });
  inp.addEventListener("keydown", cellKeys);
  return h("td", { "data-f": f }, inp);
}

function tdDate(r, f, label) {
  const btn = h("button", { type: "button", class: "cell-btn cell-date", "aria-label": label });
  const paint = () => btn.replaceChildren(fmtDate(r[f]) || "—");
  paint();
  btn.addEventListener("click", () => openCalendar(r[f], iso => { r[f] = iso; paint(); changed(r); }));
  return h("td", { "data-f": f }, btn);
}

function tdBranch(r, side, label) {
  const btn = h("button", { type: "button", class: "cell-btn cell-branch", "aria-label": label });
  const paint = () => {
    const code = r[side + "_branch_code"], name = r[side + "_branch_name"];
    btn.title = code ? `${code} ${name || ""}`.trim() : "";
    btn.replaceChildren(...(code
      ? [h("span", { class: "b-code" }, code), name ? h("span", { class: "b-name" }, name) : null]
      : [ico("shop"), h("span", { class: "b-empty" }, "เลือกสาขา")]).filter(Boolean));
  };
  paint();
  btn.addEventListener("click", () => openBranchPicker(label, r, side, () => { paint(); changed(r); }));
  return h("td", { "data-f": side + "_branch_code" }, btn);
}

function stepper(r, onChange, big) {
  const inp = h("input", { type: "number", inputmode: "numeric", min: 1, max: QTY_MAX, value: r.qty, "aria-label": "จำนวน" });
  const set = v => { r.qty = clampQty(v); inp.value = r.qty; onChange(); };
  inp.addEventListener("input", () => { if (inp.value !== "") { r.qty = clampQty(inp.value); onChange(); } });
  inp.addEventListener("blur", () => { r.qty = clampQty(inp.value); inp.value = r.qty; });
  inp.addEventListener("focus", () => inp.select());
  if (!big) inp.addEventListener("keydown", cellKeys);
  return h("div", { class: "stepper" + (big ? " stepper-lg" : "") },
    h("button", { type: "button", "aria-label": "ลดจำนวน", onclick: () => set((Number(r.qty) || 1) - 1) }, ico("minus")),
    inp,
    h("button", { type: "button", "aria-label": "เพิ่มจำนวน", onclick: () => set((Number(r.qty) || 0) + 1) }, ico("plus")));
}

function unitSelect(r, cls, onChange) {
  const units = S.units.length ? S.units : DEFAULT_UNITS;   // หน่วยที่ถูกซ่อน → เลือกหน่วยแรกแทน (เซิร์ฟเวอร์ไม่รับหน่วยที่ซ่อน)
  const sel = h("select", { class: cls, "aria-label": "หน่วย" }, units.map(u => h("option", { value: u }, u)));
  sel.value = units.includes(r.unit) ? r.unit : units[0];
  r.unit = sel.value;
  sel.addEventListener("change", () => { r.unit = sel.value; onChange(); });
  return sel;
}

function tdActions(r) {
  if (!r.id) {
    return h("td", { class: "td-act" }, h("div", { class: "row-act" },
      h("button", { type: "button", class: "btn btn-ok btn-sm", onclick: () => saveDraft(r) }, ico("check"), "บันทึก"),
      h("button", { type: "button", class: "btn-icon", title: "ยกเลิกแถวนี้", "aria-label": "ยกเลิกแถวนี้", onclick: () => cancelDraft(r) }, ico("close"))));
  }
  return h("td", { class: "td-act" }, h("div", { class: "row-act" },
    h("button", { type: "button", class: "btn-icon", title: "คัดลอกเป็นแถวใหม่ (จะแก้ไข: คัดลอก → แก้ → บันทึก → ลบรายการเดิม)", "aria-label": "คัดลอกแถวนี้", onclick: () => duplicateRow(r) }, ico("duplicate")),
    h("button", { type: "button", class: "btn-icon del", title: "ลบแถวนี้", "aria-label": "ลบแถวนี้", onclick: () => deleteRow(r) }, ico("trash"))));
}

// Enter = ลงไปช่องเดียวกันแถวถัดไป (เหมือน Excel)
function cellKeys(e) {
  if (e.key !== "Enter" || e.isComposing) return;
  e.preventDefault();
  const td = e.target.closest("td");
  const idx = [...td.parentElement.children].indexOf(td);
  const next = td.parentElement.nextElementSibling;
  const target = next && next.children[idx] && next.children[idx].querySelector("input, select, button");
  if (target) { target.focus(); if (target.select) target.select(); }
}

// ---------- บันทึก ----------
function changed(r) {
  markMissing(rowEl(r), r);
  renderSummary();
}

async function saveDraft(r) {
  const miss = missing(r);
  if (miss.length) {
    r._tried = true;
    const tr = rowEl(r);
    markMissing(tr, r);
    toast("กรุณากรอก: " + miss.map(m => m[1]).join(", "), "err");
    const first = tr && tr.querySelector(`td[data-f="${miss[0][0]}"] input, td[data-f="${miss[0][0]}"] button`);
    if (first) first.focus();
    return;
  }
  if (r._busy) return;
  r._busy = true;
  try {
    const d = await api("/jobs", { method: "POST", body: payload(r) });
    rememberSender(r);
    S.drafts = S.drafts.filter(x => x !== r);
    await placeNewJob(d.item, r._from);
  } catch (e) {
    toast("บันทึกไม่สำเร็จ: " + e.message, "err");
  } finally {
    r._busy = false;
  }
}

// ใส่รายการที่เพิ่งได้เลขงานลงในหน้าจอ
async function placeNewJob(item, from) {
  if (item.work_date !== S.date) {          // เช่น ข้ามเที่ยงคืนพอดี
    S.date = item.work_date;
    S.today = item.work_date;
    await loadJobs();
  } else {
    S.jobs.push(item);
    render();
  }
  toast(from ? `บันทึกแล้ว ได้เลขงาน ${item.job_no} — ถ้าเป็นการแก้ไข อย่าลืมลบ ${from}` : `บันทึกแล้ว ได้เลขงาน ${item.job_no}`, "ok");
  const el = document.querySelector(`[data-key="j${item.id}"]`);
  if (el) { el.classList.add("flash"); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
}

async function ensureToday() {
  S.today = bangkokISO(new Date());
  if (S.date === S.today) return;
  S.date = S.today;
  await loadJobs();
  toast("สลับมาที่วันนี้แล้ว (รายการใหม่จะลงวันนี้เสมอ)", "info");
}

async function addRow() {
  await ensureToday();
  if (isMobileView()) { openForm(blankRow()); return; }
  const r = blankRow();
  S.drafts.push(r);
  render();
  focusRow(r, "to_name");
}

async function duplicateRow(src) {
  const r = copyRow(src);
  await ensureToday();
  if (isMobileView()) { openForm(r); return; }
  S.drafts.push(r);
  render();
  focusRow(r, "item_detail");
  toast(`คัดลอก ${src.job_no} แล้ว — แก้ข้อมูลแล้วกด “บันทึก” (ถ้าเป็นการแก้ไข ให้ลบ ${src.job_no} ทีหลัง)`, "info");
}

function focusRow(r, f) {
  const tr = rowEl(r);
  if (!tr) return;
  tr.scrollIntoView({ block: "nearest" });
  const el = tr.querySelector(`td[data-f="${f}"] input`);
  if (el) el.focus();
}

async function cancelDraft(r) {
  if (hasContent(r) && !await confirmDialog("ยกเลิกแถวใหม่นี้?", "ข้อมูลที่พิมพ์ไว้ในแถวนี้จะหายไป", "ยกเลิกแถว")) return;
  S.drafts = S.drafts.filter(x => x !== r);
  render();
}

async function deleteRow(r) {
  const desc = [r.job_no, r.to_branch_code, r.item_detail].filter(Boolean).join(" · ");
  if (!await confirmDialog("ลบรายการนี้ใช่ไหม?", desc, "ลบรายการ")) return false;
  try {
    await api("/jobs/" + r.id, { method: "DELETE" });
    S.jobs = S.jobs.filter(x => x !== r);
    render();
    toast("ลบรายการแล้ว", "ok");
    return true;
  } catch (e) {
    toast("ลบไม่สำเร็จ: " + e.message, "err");
    return false;
  }
}

// ---------- เวอร์ชันมือถือ: การ์ด ----------
function renderCards() {
  const box = $("#cards");
  box.replaceChildren();
  if (S.loading && !S.jobs.length) {
    box.append(h("div", { class: "cards-empty" }, ico("clock-three"), "กำลังโหลดข้อมูล…"));
    return;
  }
  const rows = visibleJobs();
  rows.forEach(({ row, no }) => box.append(card(row, no)));
  S.drafts.forEach((d, i) => box.append(card(d, S.jobs.length + i + 1)));
  if (!rows.length && !S.drafts.length) {
    box.append(h("div", { class: "cards-empty" }, ico("truck"),
      S.q.trim() ? "ไม่พบรายการที่ค้นหา"
        : S.date === S.today ? "ยังไม่มีรายการของวันนี้ กดปุ่ม “เพิ่มรายการ” ด้านล่างเพื่อเริ่ม" : "ไม่มีรายการในวันที่เลือก"));
  }
}

function card(r, no) {
  const draft = !r.id;
  const toSub = [r.to_name, r.to_dept].filter(Boolean).join(" · ");
  const fromSub = [r.from_dept, r.from_branch_code].filter(Boolean).join(" · ");
  const el = h("article", { class: "card", "data-key": rowKey(r) },
    h("div", { class: "card-top" },
      h("span", { class: "card-no" }, no),
      h("span", { class: "card-job" }, draft ? "ใหม่ (ยังไม่บันทึก)" : r.job_no),
      h("span", { class: "card-date" }, "ฝาก ", h("b", null, fmtDate(r.deposit_date)), h("br"), "ส่ง ", h("b", null, fmtDate(r.delivery_date)))),
    h("div", { class: "card-row" }, h("span", { class: "lbl to" }, "ถึง"),
      h("div", null,
        h("div", { class: "main" }, r.to_branch_code ? [h("span", { class: "b-code" }, r.to_branch_code), " ", r.to_branch_name] : "— ยังไม่เลือกสาขา —"),
        toSub ? h("div", { class: "sub" }, toSub) : null)),
    h("div", { class: "card-row" }, h("span", { class: "lbl from" }, "จาก"),
      h("div", null, h("div", { class: "main" }, r.from_name || "—"), fromSub ? h("div", { class: "sub" }, fromSub) : null)),
    h("div", { class: "card-row" }, h("span", { class: "lbl item" }, "ของ"),
      h("div", { class: "main" }, r.item_detail || "—", h("span", { class: "card-qty" }, `${r.qty} ${r.unit}`))),
    r.remark ? h("div", { class: "card-row" }, h("span", { class: "lbl" }, "หมายเหตุ"), h("div", { class: "sub" }, r.remark)) : null,
    h("div", { class: "card-act" }, draft
      ? h("button", { type: "button", class: "btn btn-ghost", onclick: () => openForm(r, r) }, ico("pencil"), "กรอกต่อ")
      : [h("button", { type: "button", class: "btn btn-ghost", onclick: () => duplicateRow(r) }, ico("duplicate"), "คัดลอก"),
         h("button", { type: "button", class: "btn btn-ghost del", onclick: () => deleteRow(r) }, ico("trash"), "ลบ")]));
  if (draft) el.addEventListener("click", e => { if (!e.target.closest("button")) openForm(r, r); });
  return el;
}

// ---------- ฟอร์ม (มือถือ) ----------
const FORM = { row: null, draft: null };

// ใช้กรอกรายการใหม่เท่านั้น — รายการที่บันทึกแล้วแก้ไม่ได้ (คัดลอกมาแก้แทน)
function openForm(r, draft) {
  FORM.draft = draft || null;    // แถวใหม่จากตาราง (ถ้ามี)
  FORM.row = { ...r };
  $("#formTitle").textContent = r._from ? "คัดลอกจาก " + r._from : "เพิ่มรายการใหม่";
  buildForm(FORM.row);
  openModal("#formModal");
  $("#formBody").scrollTop = 0;
}

function field(f, label, control, opt = {}) {
  return h("div", { class: "field" + (opt.full ? " full" : ""), "data-f": f },
    h("label", { for: control.id || null }, label, opt.req ? h("span", { class: "req" }, " *") : null),
    control);
}

function clearMissing(f) {
  const el = document.querySelector(`#formBody .field[data-f="${f}"]`);
  if (el) el.classList.remove("missing");
}

function fText(r, f, label, opt = {}) {
  const inp = h(opt.area ? "textarea" : "input", {
    class: "f-in", id: "f_" + f, maxlength: opt.max || 150, rows: opt.area ? 2 : null,
    type: opt.area ? null : "text", enterkeyhint: "next", autocomplete: "off",
  });
  inp.value = r[f] || "";
  inp.addEventListener("input", () => { r[f] = inp.value; clearMissing(f); });
  return field(f, label, inp, opt);
}

function fDate(r, f, label) {
  const btn = h("button", { type: "button", class: "f-btn", id: "f_" + f });
  const paint = () => btn.replaceChildren(ico("calendar-day"), h("span", null, fmtDate(r[f])));
  paint();
  btn.addEventListener("click", () => openCalendar(r[f], iso => { r[f] = iso; paint(); }));
  return field(f, label, btn);
}

function fBranch(r, side, label, opt = {}) {
  const f = side + "_branch_code";
  const btn = h("button", { type: "button", class: "f-btn", id: "f_" + f });
  const paint = () => {
    const code = r[f], name = r[side + "_branch_name"];
    btn.replaceChildren(ico("shop"), ...(code
      ? [h("span", { class: "b-code" }, code), name ? h("span", { class: "b-name" }, name) : null]
      : [h("span", { class: "ph" }, "แตะเพื่อค้นหาสาขา")]).filter(Boolean));
  };
  paint();
  btn.addEventListener("click", () => openBranchPicker(label, r, side, () => { paint(); clearMissing(f); }));
  return field(f, label, btn, { ...opt, full: true });
}

function buildForm(r) {
  $("#formBody").replaceChildren(
    h("section", { class: "fsec" }, h("h3", null, ico("calendar-day"), "วันที่"),
      h("div", { class: "fgrid fgrid-2" }, fDate(r, "deposit_date", "วันที่ฝาก"), fDate(r, "delivery_date", "วันที่ส่ง"))),
    h("section", { class: "fsec to" }, h("h3", null, ico("map-pin"), "ปลายทาง · ผู้รับ"),
      h("div", { class: "fgrid" },
        fText(r, "to_name", "ถึง ผู้รับ"), fText(r, "to_dept", "แผนก ผู้รับ"),
        fBranch(r, "to", "สาขา ผู้รับ", { req: true }))),
    h("section", { class: "fsec from" }, h("h3", null, ico("circle-user"), "ต้นทาง · ผู้ส่ง"),
      h("div", { class: "fgrid" },
        fText(r, "from_name", "จาก ผู้ส่ง", { req: true }), fText(r, "from_dept", "แผนก ผู้ส่ง"),
        fBranch(r, "from", "สาขา ผู้ส่ง"))),
    h("section", { class: "fsec item" }, h("h3", null, ico("truck"), "สิ่งที่ส่ง"),
      h("div", { class: "fgrid" },
        fText(r, "item_detail", "รายละเอียด สิ่งที่ส่ง", { req: true, full: true, area: true, max: 500 }),
        field("qty", "จำนวน", stepper(r, () => {}, true)),
        field("unit", "หน่วย", unitSelect(r, "f-in", () => {})),
        fText(r, "remark", "หมายเหตุ", { full: true, area: true, max: 500 }))),
  );
}

async function submitForm(e) {
  e.preventDefault();
  const r = FORM.row;
  r.qty = clampQty(r.qty);
  const miss = missing(r);
  document.querySelectorAll("#formBody .field.missing").forEach(el => el.classList.remove("missing"));
  if (miss.length) {
    miss.forEach(([f]) => { const el = document.querySelector(`#formBody .field[data-f="${f}"]`); if (el) el.classList.add("missing"); });
    toast("กรุณากรอก: " + miss.map(m => m[1]).join(", "), "err");
    const first = document.querySelector(`#formBody .field[data-f="${miss[0][0]}"]`);
    if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  const btn = $("#formSave");
  btn.disabled = true;
  try {
    const d = await api("/jobs", { method: "POST", body: payload(r) });
    rememberSender(r);
    if (FORM.draft) S.drafts = S.drafts.filter(x => x !== FORM.draft);
    closeModal("#formModal");
    await placeNewJob(d.item, r._from);
  } catch (err) {
    toast("บันทึกไม่สำเร็จ: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
}

// =============================================================================
//  ป๊อปอัพ (เปิด/ปิด, Esc, คลิกนอกกรอบ)
// =============================================================================
const modalStack = [];

function openModal(sel) {
  const m = typeof sel === "string" ? $(sel) : sel;
  m._returnFocus = document.activeElement;
  m.style.zIndex = 50 + modalStack.length;   // ป๊อปอัพที่เปิดทีหลังอยู่บนสุดเสมอ (เช่น ปฏิทินบนฟอร์ม)
  m.hidden = false;
  modalStack.push(m);
  document.body.style.overflow = "hidden";
}

function closeModal(sel) {
  const m = typeof sel === "string" ? $(sel) : sel;
  if (m.hidden) return;
  m.hidden = true;
  const i = modalStack.indexOf(m);
  if (i !== -1) modalStack.splice(i, 1);
  if (!modalStack.length) document.body.style.overflow = "";
  if (m._onClose) { const f = m._onClose; m._onClose = null; f(); }
  if (m._returnFocus && document.contains(m._returnFocus)) m._returnFocus.focus({ preventScroll: true });
}

function confirmDialog(title, msg, okText) {
  return new Promise(resolve => {
    const m = $("#confirmModal");
    $("#confirmTitle").textContent = title;
    $("#confirmMsg").textContent = msg || "";
    $("#confirmYes").textContent = okText || "ใช่";
    let done = false;
    const finish = v => { if (done) return; done = true; m._onClose = null; closeModal(m); resolve(v); };
    $("#confirmYes").onclick = () => finish(true);
    $("#confirmNo").onclick = () => finish(false);
    openModal(m);
    m._onClose = () => finish(false);
    $("#confirmNo").focus();
  });
}

// ---------- ป๊อปอัพเลือกสาขา ----------
const BP = { r: null, side: null, done: null, tag: "", items: [], active: -1 };

function openBranchPicker(label, r, side, done) {
  Object.assign(BP, { r, side, done, tag: "", active: -1 });
  $("#branchTitle").textContent = "เลือก" + label;
  const inp = $("#branchSearch");
  inp.value = "";
  renderTagChips();
  renderBranchList();
  openModal("#branchModal");
  inp.focus();
}

// ปุ่มแท็ก (ตั้งในหน้าตั้งค่า) — 1 สาขามีได้หลายแท็ก เรียงแท็กที่ใช้มากก่อน
function branchTags(list) {
  const count = new Map();
  for (const b of list) for (const t of b.tags || []) count.set(t, (count.get(t) || 0) + 1);
  return [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || a.localeCompare(b, "th"));
}

function renderTagChips() {
  const tags = branchTags(S.branches);
  if (BP.tag && !tags.includes(BP.tag)) BP.tag = "";
  $("#branchTags").replaceChildren(
    ...["", ...tags].map(t => h("button", {
      type: "button", class: "chip" + (BP.tag === t ? " on" : ""), "aria-pressed": BP.tag === t ? "true" : "false",
      onclick: () => { BP.tag = t; renderTagChips(); renderBranchList(); $("#branchSearch").focus(); },
    }, t ? [ico("tag"), t] : "ทั้งหมด")));
}

function scoreBranch(b, toks) {
  let total = 0;
  const s = b._s;
  for (const t of toks) {
    const tn = t.replace(/^0+/, "");
    let sc = 0;
    if (s.code === t) sc = 100;
    else if (s.code.startsWith(t)) sc = 80;
    else if (s.shop === t || (tn && s.shop.replace(/^0+/, "") === tn)) sc = 75;
    else if (s.name.startsWith(t)) sc = 60;
    else if (s.name.includes(" " + t)) sc = 55;
    else if (s.name.includes(t)) sc = 40;
    else if (s.alternate.includes(t)) sc = 38;
    else if (s.tags.includes(t)) sc = 36;
    else if (s.code.includes(t)) sc = 35;
    else if (s.shop.includes(t)) sc = 25;
    else if (s.brand === t) sc = 20;
    else return 0;
    total += sc;
  }
  return total;
}

function recentBranches() {
  const rec = store.get("recent", []);
  if (!Array.isArray(rec)) return [];
  return rec.filter(Boolean).map(b => S.branches.find(current => current.brand === b.brand && current.shop_id === b.shop_id)).filter(Boolean);
}

function addRecent(b) {
  const keep = { brand: b.brand, shop_id: b.shop_id, code: b.code, name: b.name };
  const rec = recentBranches().filter(x => !(x.brand === b.brand && x.shop_id === b.shop_id));
  store.set("recent", [keep, ...rec].slice(0, 8));
}

function renderBranchList() {
  const raw = $("#branchSearch").value.trim();
  const toks = raw.toLowerCase().split(/\s+/).filter(Boolean);
  const list = $("#branchList");
  const pool = BP.tag ? S.branches.filter(b => b.tags.includes(BP.tag)) : S.branches;
  const nodes = [];
  let results;

  if (!toks.length) {
    const rec = recentBranches().filter(b => !BP.tag || b.tags.includes(BP.tag));
    if (rec.length) {
      nodes.push(h("div", { class: "bl-head" }, "ใช้ล่าสุด"));
      rec.forEach(b => nodes.push(branchItem(b, [])));
    }
    nodes.push(h("div", { class: "bl-head" }, BP.tag ? `แท็ก ${BP.tag}` : "สาขาทั้งหมด"));
    results = pool;
  } else {
    results = pool.map(b => [scoreBranch(b, toks), b]).filter(x => x[0] > 0)
      .sort((a, b) => b[0] - a[0] || a[1].code.localeCompare(b[1].code)).map(x => x[1]);
  }

  results.slice(0, BRANCH_LIMIT).forEach(b => nodes.push(branchItem(b, toks)));
  if (results.length > BRANCH_LIMIT) {
    nodes.push(h("div", { class: "bl-more" }, `แสดง ${BRANCH_LIMIT} จาก ${results.length} สาขา — พิมพ์เพิ่มเพื่อค้นหาให้แคบลง`));
  }
  if (toks.length && !results.length) nodes.push(h("div", { class: "bl-more" }, "ไม่พบสาขาที่ค้นหา"));

  list.replaceChildren(...nodes);
  list.scrollTop = 0;
  BP.items = [...list.querySelectorAll(".bl-item")];
  BP.active = toks.length && BP.items.length ? 0 : -1;
  paintActive();
}

function branchItem(b, toks) {
  const r = BP.r, side = BP.side;
  const sel = r && r[side + "_branch_code"] === b.code && (r[side + "_shop_id"] || "") === (b.shop_id || "");
  return h("button", { type: "button", class: "bl-item" + (sel ? " selected" : ""), role: "option", onclick: () => pickBranch(b) },
    h("span", { class: "bl-code" }, hl(b.code, toks)),
    h("span", { class: "bl-name" }, hl(b.name, toks)),
    h("span", { class: "bl-meta" }, b.tags.map(t => h("span", { class: "tag" }, t))));
}

function paintActive() {
  BP.items.forEach((el, i) => el.classList.toggle("active", i === BP.active));
  const el = BP.items[BP.active];
  if (el) el.scrollIntoView({ block: "nearest" });
}

function pickBranch(b) {
  const { r, side } = BP;
  r[side + "_branch_code"] = b.code || "";
  r[side + "_branch_name"] = b.name || "";
  r[side + "_brand"] = b.brand || "";
  r[side + "_shop_id"] = b.shop_id || "";
  if (b.brand) addRecent(b);
  closeModal("#branchModal");
  if (BP.done) BP.done();
}

function branchKeys(e) {
  if (e.isComposing) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!BP.items.length) return;
    const n = BP.items.length;
    BP.active = e.key === "ArrowDown" ? (BP.active + 1) % n : (BP.active - 1 + n) % n;
    paintActive();
  } else if (e.key === "Enter") {
    e.preventDefault();
    const el = BP.items[BP.active] || BP.items[0];
    if (el) el.click();
  }
}

// ---------- ปฏิทิน ----------
const CAL = { value: null, y: 0, m: 0, done: null };

function openCalendar(value, done) {
  CAL.value = value || S.today;
  CAL.done = done;
  const d = parseISO(CAL.value);
  CAL.y = d.getFullYear();
  CAL.m = d.getMonth();
  renderCal();
  openModal("#calModal");
  const sel = $("#calDays .sel") || $("#calDays .today");
  if (sel) sel.focus();
}

function renderCal() {
  $("#calTitle").replaceChildren(`${TH_MONTHS[CAL.m]} ${CAL.y}`, h("small", null, `พ.ศ. ${CAL.y + 543}`));
  const first = new Date(CAL.y, CAL.m, 1);
  const start = new Date(CAL.y, CAL.m, 1 - first.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = localISO(d);
    const cls = ["cal-day", d.getMonth() !== CAL.m && "out", iso === S.today && "today", iso === CAL.value && "sel"].filter(Boolean).join(" ");
    days.push(h("button", { type: "button", class: cls, "aria-label": fmtDateLong(iso), onclick: () => pickDate(iso) }, d.getDate()));
  }
  $("#calDays").replaceChildren(...days);
}

function shiftMonth(n) {
  const d = new Date(CAL.y, CAL.m + n, 1);
  CAL.y = d.getFullYear();
  CAL.m = d.getMonth();
  renderCal();
}

function pickDate(iso) {
  const done = CAL.done;
  closeModal("#calModal");
  if (done) done(iso);
}

// =============================================================================
//  หน้าตั้งค่า (กดไอคอนรถมุมซ้ายบน): เพิ่ม/แก้/ซ่อนสาขา + แท็ก, แก้หน่วยที่ส่ง
// =============================================================================
const SET = { tab: "branches", branches: [], units: [], q: "", show: "all", edit: null, busy: false };

async function openSettings() {
  Object.assign(SET, { edit: null, q: "", show: "all" });
  renderSettings();
  openModal("#setModal");
  try {
    const [b, u] = await Promise.all([api("/settings/branches"), api("/settings/units")]);
    SET.branches = b.items;
    SET.units = u.items;
  } catch (e) {
    toast("โหลดข้อมูลตั้งค่าไม่ได้: " + e.message, "err");
  }
  renderSettings();
}

function renderSettings() {
  document.querySelectorAll("#setTabs button").forEach(b => {
    b.classList.toggle("on", b.dataset.tab === SET.tab);
    b.setAttribute("aria-selected", b.dataset.tab === SET.tab ? "true" : "false");
  });
  // replaceChildren แปลง null เป็นข้อความ "null" → กรองออกก่อน
  $("#setBody").replaceChildren(...(SET.tab === "branches" ? setBranchesView() : setUnitsView()).filter(Boolean));
  if (SET.tab === "branches") paintSetList();
}

// ---------- แท็บสาขา ----------
function setBranchesView() {
  const hidden = SET.branches.filter(b => b.hidden).length;
  const search = h("input", { type: "search", class: "f-in", value: SET.q, placeholder: "ค้นหารหัส ชื่อ หรือแท็ก", "aria-label": "ค้นหาสาขา" });
  search.addEventListener("input", () => { SET.q = search.value; paintSetList(); });
  const filters = [["all", `ทั้งหมด ${SET.branches.length}`], ["shown", `แสดงอยู่ ${SET.branches.length - hidden}`], ["hidden", `ซ่อนอยู่ ${hidden}`]];
  return [
    h("p", { class: "set-note" }, "สาขาที่ซ่อนจะไม่อยู่ในรายการเลือกสาขา (ใบแจ้งงานเก่ายังแสดงตามเดิม) · แท็กใช้เป็นปุ่มหมวดตอนเลือกสาขา 1 สาขามีได้หลายแท็ก"),
    h("div", { class: "set-bar" }, search,
      h("button", { type: "button", class: "btn btn-gold", onclick: () => { SET.edit = "new"; renderSettings(); } }, ico("plus"), "เพิ่มสาขา")),
    h("div", { class: "chips set-chips" }, filters.map(([k, label]) => h("button", {
      type: "button", class: "chip" + (SET.show === k ? " on" : ""), onclick: () => { SET.show = k; renderSettings(); },
    }, label))),
    SET.edit === "new" ? branchForm(null) : null,
    h("div", { class: "set-list", id: "setList" }),
  ];
}

function paintSetList() {
  const box = $("#setList");
  if (!box) return;
  const toks = SET.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = SET.branches.filter(b => (SET.show === "all" || (SET.show === "hidden") === b.hidden)
    && toks.every(t => [b.code, b.name, b.alternate_name, ...b.tags].join(" ").toLowerCase().includes(t)));
  box.replaceChildren(...(rows.length
    ? rows.map(b => (SET.edit === b.id ? branchForm(b) : branchRow(b)))
    : [h("div", { class: "bl-more" }, SET.branches.length ? "ไม่พบสาขา" : "กำลังโหลด…")]));
}

function branchRow(b) {
  return h("div", { class: "set-row" + (b.hidden ? " is-hidden" : "") },
    h("span", { class: "bl-code" }, b.code),
    h("div", { class: "set-main" },
      h("div", { class: "set-name" }, b.name, b.hidden ? h("span", { class: "set-flag" }, "ซ่อนอยู่") : null),
      h("div", { class: "set-tags" }, b.tags.length ? b.tags.map(t => h("span", { class: "tag" }, t)) : h("span", { class: "set-none" }, "ยังไม่มีแท็ก"))),
    h("div", { class: "set-act" },
      h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => { SET.edit = b.id; renderSettings(); } }, ico("pencil"), "แก้ไข"),
      h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => saveBranch(b, { hidden: !b.hidden }) },
        ico(b.hidden ? "eye" : "eye-off"), b.hidden ? "แสดง" : "ซ่อน")));
}

function branchForm(b) {
  const tags = b ? [...b.tags] : [];
  const code = h("input", { class: "f-in", id: "s_code", value: b ? b.code : "", maxlength: 20, placeholder: "เช่น WH49", disabled: !!b, autocomplete: "off" });
  const name = h("input", { class: "f-in", id: "s_name", value: b ? b.name : "", maxlength: 255, placeholder: "เช่น Warehouse 49", autocomplete: "off" });
  const alt = h("input", { class: "f-in", id: "s_alt", value: b ? b.alternate_name : "", maxlength: 255, placeholder: "ชื่อไทย / คำที่ใช้ค้นหา เช่น คลังสินค้า 49", autocomplete: "off" });
  const newTag = h("input", { class: "f-in", maxlength: 30, placeholder: "พิมพ์แท็กใหม่ เช่น คลังสินค้า", "aria-label": "แท็กใหม่", autocomplete: "off" });
  const pick = h("div", { class: "tag-pick" });
  const paint = () => pick.replaceChildren(...[...new Set([...branchTags(SET.branches), ...tags])].map(t => h("button", {
    type: "button", class: "chip" + (tags.includes(t) ? " on" : ""), "aria-pressed": tags.includes(t) ? "true" : "false",
    onclick: () => { const i = tags.indexOf(t); if (i >= 0) tags.splice(i, 1); else tags.push(t); paint(); },
  }, ico("tag"), t)));
  const addTag = () => {
    const t = newTag.value.replace(/,/g, " ").trim();
    if (t && !tags.includes(t)) tags.push(t);
    newTag.value = "";
    paint();
  };
  newTag.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); addTag(); } });
  paint();
  const save = () => {
    addTag();                                   // แท็กที่พิมพ์ค้างไว้ก็นับด้วย
    const body = { name: name.value.trim(), alternate_name: alt.value.trim(), tags };
    if (!b) {
      body.code = code.value.trim();
      if (!/^[0-9A-Za-z._-]{1,20}$/.test(body.code)) { toast("รหัสใช้ได้เฉพาะ A-Z 0-9 . _ - ไม่เกิน 20 ตัว (ไม่มีเว้นวรรค)", "err"); code.focus(); return; }
    }
    if (!body.name) { toast("กรุณาใส่ชื่อ", "err"); name.focus(); return; }
    saveBranch(b, body);
  };
  setTimeout(() => (b ? name : code).focus(), 0);
  return h("div", { class: "set-form" },
    h("h3", null, b ? `แก้ไข ${b.code}` : "เพิ่มสาขา / สถานที่ใหม่"),
    h("div", { class: "fgrid" },
      field("s_code", "รหัส (แสดงในไฟล์ Excel)" + (b ? " — เปลี่ยนไม่ได้" : ""), code, { req: !b }),
      field("s_name", "ชื่อ", name, { req: true }),
      field("s_alt", "ชื่อรอง / คำค้นหา", alt, { full: true }),
      h("div", { class: "field full" }, h("label", null, "แท็ก (กดเลือกได้หลายอัน)"), pick,
        h("div", { class: "tag-new" }, newTag, h("button", { type: "button", class: "btn btn-ghost", onclick: addTag }, ico("plus"), "เพิ่มแท็ก")))),
    h("div", { class: "set-form-foot" },
      h("button", { type: "button", class: "btn btn-ghost", onclick: () => { SET.edit = null; renderSettings(); } }, "ยกเลิก"),
      h("button", { type: "button", class: "btn btn-gold", onclick: save }, ico("check"), "บันทึก")));
}

async function saveBranch(b, body) {
  if (SET.busy) return;
  SET.busy = true;
  try {
    const d = b ? await api("/settings/branches/" + b.id, { method: "PUT", body })
                : await api("/settings/branches", { method: "POST", body });
    const i = SET.branches.findIndex(x => x.id === d.item.id);
    if (i >= 0) SET.branches[i] = d.item; else SET.branches.push(d.item);
    SET.branches.sort((x, y) => x.code.localeCompare(y.code));
    SET.edit = null;
    renderSettings();
    const c = d.item.code;
    toast(!b ? `เพิ่ม ${c} แล้ว` : "hidden" in body ? (d.item.hidden ? `ซ่อน ${c} แล้ว` : `แสดง ${c} แล้ว`) : `บันทึก ${c} แล้ว`, "ok");
    loadBranches();                             // รายการเลือกสาขาอัปเดตทันที
  } catch (e) {
    toast("บันทึกไม่สำเร็จ: " + e.message, "err");
  } finally {
    SET.busy = false;
  }
}

// ---------- แท็บหน่วย ----------
function setUnitsView() {
  const inp = h("input", { class: "f-in", maxlength: 10, placeholder: "หน่วยใหม่ เช่น ลัง", "aria-label": "หน่วยใหม่", autocomplete: "off" });
  const add = () => {
    const name = inp.value.trim();
    if (name) unitCall(() => api("/settings/units", { method: "POST", body: { name } }), `เพิ่มหน่วย “${name}” แล้ว`);
  };
  inp.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); add(); } });
  return [
    h("p", { class: "set-note" }, "เรียงลำดับตามที่แสดงในช่องเลือกหน่วย · หน่วยที่ซ่อนจะเลือกไม่ได้ แต่ใบแจ้งงานเก่ายังแสดงหน่วยเดิม · เปลี่ยนชื่อไม่กระทบรายการที่บันทึกแล้ว"),
    h("div", { class: "set-bar" }, inp, h("button", { type: "button", class: "btn btn-gold", onclick: add }, ico("plus"), "เพิ่มหน่วย")),
    h("div", { class: "set-list" }, SET.units.length ? SET.units.map(unitRow) : h("div", { class: "bl-more" }, "กำลังโหลด…")),
  ];
}

function unitRow(u, i) {
  if (SET.edit === "u" + u.id) {
    const inp = h("input", { class: "f-in", value: u.name, maxlength: 10, "aria-label": "ชื่อหน่วยใหม่", autocomplete: "off" });
    const save = () => {
      const name = inp.value.trim();
      if (!name || name === u.name) { SET.edit = null; renderSettings(); return; }
      unitCall(() => api("/settings/units/" + u.id, { method: "PUT", body: { name } }), `เปลี่ยน “${u.name}” เป็น “${name}” แล้ว`);
    };
    inp.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); save(); } });
    setTimeout(() => inp.focus(), 0);
    return h("div", { class: "set-row" }, inp,
      h("div", { class: "set-act" },
        h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => { SET.edit = null; renderSettings(); } }, "ยกเลิก"),
        h("button", { type: "button", class: "btn btn-gold btn-sm", onclick: save }, ico("check"), "บันทึก")));
  }
  const move = dir => unitCall(() => api(`/settings/units/${u.id}/move`, { method: "POST", body: { dir } }));
  return h("div", { class: "set-row" + (u.hidden ? " is-hidden" : "") },
    h("div", { class: "set-main" }, h("div", { class: "set-name unit-name" }, u.name, u.hidden ? h("span", { class: "set-flag" }, "ซ่อนอยู่") : null)),
    h("div", { class: "set-act" },
      h("button", { type: "button", class: "btn-icon", title: "เลื่อนขึ้น", "aria-label": `เลื่อน ${u.name} ขึ้น`, disabled: i === 0, onclick: () => move(-1) }, ico("chev-up")),
      h("button", { type: "button", class: "btn-icon", title: "เลื่อนลง", "aria-label": `เลื่อน ${u.name} ลง`, disabled: i === SET.units.length - 1, onclick: () => move(1) }, ico("chev-down")),
      h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => { SET.edit = "u" + u.id; renderSettings(); } }, ico("pencil"), "เปลี่ยนชื่อ"),
      h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => unitCall(() => api("/settings/units/" + u.id, { method: "PUT", body: { hidden: !u.hidden } }), u.hidden ? `แสดง “${u.name}” แล้ว` : `ซ่อน “${u.name}” แล้ว`) },
        ico(u.hidden ? "eye" : "eye-off"), u.hidden ? "แสดง" : "ซ่อน")));
}

async function unitCall(request, msg) {
  if (SET.busy) return;
  SET.busy = true;
  try {
    SET.units = (await request()).items;
    SET.edit = null;
    renderSettings();
    if (msg) toast(msg, "ok");
    const m = await api("/meta");               // ช่องเลือกหน่วยในหน้าหลักใช้หน่วยใหม่ทันที
    if (Array.isArray(m.units) && m.units.length) { S.units = m.units; render(); }
  } catch (e) {
    toast("บันทึกไม่สำเร็จ: " + e.message, "err");
  } finally {
    SET.busy = false;
  }
}

// =============================================================================
//  เปลี่ยนวัน / ค้นหา / พิมพ์ / Excel
// =============================================================================
function setDate(iso) {
  if (iso === S.date) return;
  if (S.drafts.length) {
    toast("มีแถวใหม่ที่ยังไม่บันทึก — กด “บันทึก” หรือยกเลิกก่อนเปลี่ยนวัน", "err");
    return;
  }
  S.date = iso > S.today ? S.today : iso;
  S.jobs = [];
  loadJobs();
}

function printDay() {
  const rows = visibleJobs();
  if (!rows.length) { toast("ไม่มีรายการให้พิมพ์", "info"); return; }
  $("#printArea").replaceChildren(
    h("h1", null, "ใบแจ้งงานขนส่ง SST"),
    h("div", { class: "p-meta" },
      h("span", null, "วันที่ " + fmtDateLong(S.date) + (S.q.trim() ? ` (ค้นหา: ${S.q.trim()})` : "")),
      h("span", null, "พิมพ์เมื่อ " + new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }))),
    h("table", null,
      h("thead", null, h("tr", null, COLS.map(c => h("th", { class: c.from ? "from" : null }, c.label)))),
      h("tbody", null, rows.map(({ row, no }) => h("tr", null, COLS.map(c => h("td", { class: c.left ? "l" : null }, c.get(row, no))))))));
  window.print();
}

async function exportExcel() {
  const rows = visibleJobs();
  if (!rows.length) { toast("ไม่มีรายการให้ส่งออก", "info"); return; }
  const btn = $("#btnExcel");
  btn.disabled = true;
  try {
    const response = await apiFetch("/export?" + new URLSearchParams({ date: S.date, q: S.q }));
    if (!response.ok) throw new Error("เซิร์ฟเวอร์สร้างไฟล์ไม่สำเร็จ");
    const url = URL.createObjectURL(await response.blob());
    const link = h("a", { href: url, download: `ใบแจ้งงานขนส่ง_${S.date}.xlsx` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("ดาวน์โหลดไฟล์ Excel แล้ว", "ok");
  } catch (e) {
    toast("ส่งออกไม่ได้: " + e.message, "err");
  } finally {
    btn.disabled = false;
  }
}

// =============================================================================
//  รูปแบบหน้าจอ / ขนาดตัวอักษร
// =============================================================================
const mqMobile = window.matchMedia("(max-width: 900px)");

function applyView() {
  const pref = store.get("view", "auto");
  const mobile = pref === "mobile" || (pref === "auto" && mqMobile.matches);
  document.body.classList.toggle("view-mobile", mobile);
  document.body.classList.toggle("view-desktop", !mobile);
  $("#viewDesktop").classList.toggle("on", !mobile);
  $("#viewMobile").classList.toggle("on", mobile);
}

function applySize() {
  const size = String(store.get("size", "1"));
  document.documentElement.dataset.size = size;
  document.querySelectorAll(".seg-size button").forEach(b => b.classList.toggle("on", b.dataset.size === size));
}

// แก้ข้อมูลอยู่ / มีป๊อปอัพเปิด / มีแถวใหม่ → ห้ามรีเฟรชทับ
function idle() {
  if (S.drafts.length || modalStack.length) return false;
  const a = document.activeElement;
  return !(a && a.closest && a.closest("#sheet, #cards") && a.matches("input, select, textarea"));
}

function tick() {
  const t = bangkokISO(new Date());
  if (t !== S.today) {                       // ข้ามเที่ยงคืน → เริ่มวันใหม่ เลขงานเริ่ม 1 ใหม่
    const wasToday = S.date === S.today;
    S.today = t;
    if (wasToday && idle()) { S.date = t; S.jobs = []; loadJobs(); return; }
  }
  if (!document.hidden && idle()) loadJobs({ silent: true });
}

// =============================================================================
//  เริ่มต้น
// =============================================================================
function setIcons() {
  $("#brandMark").replaceChildren(ico("truck"), h("span", { class: "brand-gear" }, ico("settings")));
  $("#viewDesktop").replaceChildren(ico("monitor"), h("span", { class: "lbl" }, "คอม"));
  $("#viewMobile").replaceChildren(ico("smartphone"), h("span", { class: "lbl" }, "มือถือ"));
  $("#datePrev").replaceChildren(ico("arrow-small-left"));
  $("#dateNext").replaceChildren(ico("arrow-small-right"));
  $("#searchIcon").replaceChildren(ico("search"));
  $(".search-ic").replaceChildren(ico("search"));
  $("#btnAdd").replaceChildren(ico("plus"), "เพิ่มรายการ");
  $("#btnPrint").replaceChildren(ico("printer"), "พิมพ์");
  $("#btnExcel").replaceChildren(ico("file-export"), "Excel");
  $("#btnRefresh").replaceChildren(ico("refresh"));
  $("#fab").replaceChildren(ico("plus"), "เพิ่มรายการ");
  $("#calPrev").replaceChildren(ico("arrow-small-left"));
  $("#calNext").replaceChildren(ico("arrow-small-right"));
  $("#formSave").replaceChildren(ico("check"), "บันทึก");
  document.querySelectorAll(".modal-head [data-close]").forEach(b => b.replaceChildren(ico("close")));
}

function bindEvents() {
  $("#datePrev").addEventListener("click", () => setDate(addDays(S.date, -1)));
  $("#dateNext").addEventListener("click", () => setDate(addDays(S.date, 1)));
  $("#dateToday").addEventListener("click", () => setDate(S.today));
  $("#dateCurrent").addEventListener("click", () => openCalendar(S.date, setDate));
  $("#btnAdd").addEventListener("click", addRow);
  $("#fab").addEventListener("click", addRow);
  $("#btnPrint").addEventListener("click", printDay);
  $("#btnExcel").addEventListener("click", exportExcel);
  $("#btnRefresh").addEventListener("click", () => {
    loadJobs();
    loadBranches();
  });

  let qT;
  $("#searchBox").addEventListener("input", e => {
    clearTimeout(qT);
    qT = setTimeout(() => { S.q = e.target.value; render(); }, 150);
  });

  document.querySelectorAll(".seg-size button").forEach(b => b.addEventListener("click", () => {
    store.set("size", b.dataset.size);
    applySize();
  }));
  document.querySelectorAll(".seg-view button").forEach(b => b.addEventListener("click", () => {
    store.set("view", b.dataset.view);
    applyView();
    render();
  }));
  mqMobile.addEventListener("change", () => {
    if (store.get("view", "auto") === "auto") { applyView(); render(); }
  });

  // ป๊อปอัพ
  document.querySelectorAll(".overlay").forEach(o => {
    o.addEventListener("click", e => { if (e.target === o) closeModal(o); });
    o.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => closeModal(o)));
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && modalStack.length) { e.preventDefault(); closeModal(modalStack[modalStack.length - 1]); }
    if (e.key === "Tab" && modalStack.length) {
      const modal = modalStack[modalStack.length - 1];
      const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { e.preventDefault(); first?.focus(); }
    }
  });

  let bT;
  $("#branchSearch").addEventListener("input", () => { clearTimeout(bT); bT = setTimeout(renderBranchList, 60); });
  $("#branchSearch").addEventListener("keydown", branchKeys);
  $("#branchClear").addEventListener("click", () => pickBranch({ code: "", name: "", brand: "", shop_id: "" }));

  $("#calPrev").addEventListener("click", () => shiftMonth(-1));
  $("#calNext").addEventListener("click", () => shiftMonth(1));
  $("#calToday").addEventListener("click", () => pickDate(S.today));
  $("#calTomorrow").addEventListener("click", () => pickDate(addDays(S.today, 1)));

  $("#jobForm").addEventListener("submit", submitForm);

  $("#brandMark").addEventListener("click", openSettings);
  document.querySelectorAll("#setTabs button").forEach(b => b.addEventListener("click", () => {
    SET.tab = b.dataset.tab;
    SET.edit = null;
    renderSettings();
  }));

  window.addEventListener("beforeunload", e => {
    if (S.drafts.some(hasContent)) { e.preventDefault(); e.returnValue = ""; }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  setInterval(tick, POLL_MS);
}

async function init() {
  setIcons();
  bindEvents();
  applySize();
  applyView();
  window.tnReady = true;                   // เริ่มหน้าเว็บสำเร็จ → ปิดตัวเตือน "หน้าเว็บเพิ่งอัปเดต" ใน index.html
  S.date = S.today;
  try {
    const m = await api("/meta");          // ใช้ "วันนี้" ของเซิร์ฟเวอร์ (เวลาไทย) เป็นหลัก
    S.today = m.today;
    S.date = m.today;
    if (Array.isArray(m.units) && m.units.length) S.units = m.units;
  } catch (e) {
    setOnline(false, e.message);
  }
  await Promise.all([loadJobs(), loadBranches()]);
}

init();
