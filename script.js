/* =========================================================================
 *  Battery IoT Monitor — dashboard logic
 * -------------------------------------------------------------------------
 *  Yang WAJIB kamu ganti: GAS_URL di bawah ini, isi dengan URL Web App
 *  hasil deploy Apps Script (folder apps-script/Code.gs).
 * ========================================================================= */

const CONFIG = {
  GAS_URL: "https://script.google.com/macros/s/AKfycbzF1J0xijxH_TBtWfQxUYdfU7uY4bCmEW15QVxu-Jc2BWDzTrJ-fSSPuPNBg3bHOoXG/exec",
  AUTO_REFRESH_MS: 15000
};

// ------------------------------ State ------------------------------------
let currentSheet = "";
let sheetMeta = null; // hasil ?action=meta (spreadsheetId, daftar sheet+gid)
let jsonpCounter = 0;

// ------------------------------ Elemen DOM --------------------------------
const el = (id) => document.getElementById(id);
const sheetSelect   = el("sheetSelect");
const refreshBtn    = el("refreshBtn");
const downloadBtn   = el("downloadBtn");
const connState     = el("connState");
const statusText    = el("statusText");
const lastUpdated   = el("lastUpdated");
const footerSheet   = el("footerSheet");
const footerCount   = el("footerCount");
const chartEmpty    = el("chartEmpty");
const canvas        = el("historyChart");
const ctx           = canvas.getContext("2d");

// ============================== JSONP helper ===============================
// Dipakai supaya dashboard (di domain Vercel) bisa membaca hasil Apps Script
// tanpa kena blokir CORS bawaan browser.
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cbName = "__gasCb" + (jsonpCounter++);
    const script = document.createElement("script");

    const cleanup = () => {
      delete window[cbName];
      script.remove();
    };

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Gagal memuat data dari Apps Script"));
    };

    const sep = url.indexOf("?") === -1 ? "?" : "&";
    script.src = url + sep + "callback=" + cbName;
    document.body.appendChild(script);

    setTimeout(() => {
      if (window[cbName]) {
        cleanup();
        reject(new Error("Waktu permintaan habis"));
      }
    }, 10000);
  });
}

function gasCall(action, extraParams) {
  const params = new URLSearchParams(Object.assign({ action }, extraParams || {}));
  return jsonp(CONFIG.GAS_URL + "?" + params.toString());
}

// ============================== Status UI ===================================
function setStatus(kind, text) {
  connState.className = "dot dot-" + kind;
  statusText.textContent = text;
}

// ============================== Populate sheet list ==========================
async function loadMeta() {
  try {
    sheetMeta = await gasCall("meta");
    sheetSelect.innerHTML = "";
    sheetMeta.sheets.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.name;
      opt.textContent = s.name;
      sheetSelect.appendChild(opt);
    });
    currentSheet = sheetMeta.defaultSheet || sheetMeta.sheets[0].name;
    sheetSelect.value = currentSheet;
    footerSheet.textContent = currentSheet;
  } catch (err) {
    setStatus("error", "Tidak bisa memuat daftar sheet: " + err.message);
  }
}

// ============================== Format helpers ===============================
function fmt(value, decimals) {
  if (value === undefined || value === null || value === "" || isNaN(value)) return "--";
  return Number(value).toFixed(decimals);
}

function flash(elm) {
  elm.style.opacity = 0.35;
  requestAnimationFrame(() => {
    elm.style.transition = "opacity 250ms ease";
    elm.style.opacity = 1;
  });
}

// ============================== Update readouts ===============================
function applyLatest(data) {
  if (!data || data.status === "empty") {
    setStatus("idle", "Belum ada data masuk untuk sheet ini.");
    return;
  }

  el("socValue").textContent = fmt(data.SOC_percent, 1);
  el("voltValue").textContent = fmt(data.Voltage_V, 3);
  el("currValue").textContent = fmt(data.Current_mA, 0);
  el("vsensValue").textContent = fmt(data.Voltage_Sensor_V, 3);
  el("sohValue").textContent = fmt(data.SOH_percent, 1);
  el("cycleValue").textContent = fmt(data.Cycle_Count, 3);
  el("rssiValue").textContent = fmt(data.RSSI_dBm, 0);

  [ "socValue","voltValue","currValue","vsensValue","sohValue","cycleValue","rssiValue" ]
    .forEach((id) => flash(el(id)));

  const soc = Number(data.SOC_percent) || 0;
  el("socBarFill").style.width = Math.max(0, Math.min(100, soc)) + "%";

  const current = Number(data.Current_mA);
  const modeBadge = el("modeBadge");
  if (!isNaN(current)) {
    if (current > 20) {
      modeBadge.textContent = "Charging";
      modeBadge.className = "badge badge-charge";
    } else if (current < -20) {
      modeBadge.textContent = "Discharging";
      modeBadge.className = "badge badge-discharge";
    } else {
      modeBadge.textContent = "Idle";
      modeBadge.className = "badge badge-idle";
    }
  }

  const relayBadge = el("relayBadge");
  const relayState = data.Relay_State || "";
  relayBadge.textContent = "Relay " + (relayState || "—");
  relayBadge.className = "badge " + (relayState === "CHARGE" ? "badge-charge" : relayState === "DISCHARGE" ? "badge-discharge" : "badge-idle");

  const time = data.Time ? new Date(data.Time) : new Date();
  lastUpdated.textContent = time.toLocaleTimeString("id-ID");

  setStatus("ok", "Tersambung ke Apps Script.");
}

// ============================== Chart (custom canvas) ==========================
function drawChart(rows) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 900;
  const cssHeight = 220;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!rows || rows.length < 2) {
    chartEmpty.style.display = "block";
    return;
  }
  chartEmpty.style.display = "none";

  const padding = { top: 10, right: 10, bottom: 18, left: 44 };
  const w = cssWidth - padding.left - padding.right;
  const h = cssHeight - padding.top - padding.bottom;

  const voltages = rows.map((r) => Number(r.Voltage_V)).filter((v) => !isNaN(v));
  const currents = rows.map((r) => Number(r.Current_mA)).filter((v) => !isNaN(v));

  const vMin = Math.min(...voltages), vMax = Math.max(...voltages);
  const iMin = Math.min(...currents), iMax = Math.max(...currents);
  const vRange = (vMax - vMin) || 1;
  const iRange = (iMax - iMin) || 1;

  const xFor = (i) => padding.left + (i / (rows.length - 1)) * w;
  const yForV = (v) => padding.top + h - ((v - vMin) / vRange) * h;
  const yForI = (i) => padding.top + h - ((i - iMin) / iRange) * h;

  // grid hairlines
  ctx.strokeStyle = "rgba(122,108,90,0.18)";
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = padding.top + (h / 4) * g;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + w, y);
    ctx.stroke();
  }

  function drawLine(getY, values, color) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    rows.forEach((r, i) => {
      const val = Number(values[i]);
      if (isNaN(val)) return;
      const x = xFor(i);
      const y = getY(val);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  drawLine(yForV, rows.map((r) => r.Voltage_V), "#E7A23C");
  drawLine(yForI, rows.map((r) => r.Current_mA), "#6FB8AE");

  // y-axis labels (voltage)
  ctx.fillStyle = "#6C6152";
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.textAlign = "right";
  ctx.fillText(vMax.toFixed(2) + "V", padding.left - 6, padding.top + 8);
  ctx.fillText(vMin.toFixed(2) + "V", padding.left - 6, padding.top + h);
}

// ============================== Load & refresh ================================
async function refreshAll() {
  if (!currentSheet) return;
  refreshBtn.classList.add("btn-busy");
  try {
    const [latest, history] = await Promise.all([
      gasCall("latest", { sheet: currentSheet }),
      gasCall("all", { sheet: currentSheet })
    ]);
    applyLatest(latest);

    const rows = (history && history.rows) || [];
    drawChart(rows);
    footerCount.textContent = rows.length + " titik data";
  } catch (err) {
    setStatus("error", "Gagal mengambil data: " + err.message);
  } finally {
    refreshBtn.classList.remove("btn-busy");
  }
}

// ============================== Download data ==================================
function downloadData() {
  if (!sheetMeta) {
    // fallback: minta CSV langsung dari Apps Script
    const params = new URLSearchParams({ action: "export", sheet: currentSheet });
    window.open(CONFIG.GAS_URL + "?" + params.toString(), "_blank");
    return;
  }
  const sheetInfo = sheetMeta.sheets.find((s) => s.name === currentSheet);
  if (sheetInfo) {
    // Unduh file .xlsx ASLI langsung dari Google Sheets (butuh sharing "Anyone with link")
    const url = "https://docs.google.com/spreadsheets/d/" + sheetMeta.spreadsheetId +
      "/export?format=xlsx&gid=" + sheetInfo.gid;
    window.open(url, "_blank");
  } else {
    const params = new URLSearchParams({ action: "export", sheet: currentSheet });
    window.open(CONFIG.GAS_URL + "?" + params.toString(), "_blank");
  }
}

// ============================== Event bindings ==================================
sheetSelect.addEventListener("change", (e) => {
  currentSheet = e.target.value;
  footerSheet.textContent = currentSheet;
  refreshAll();
});

refreshBtn.addEventListener("click", refreshAll);
downloadBtn.addEventListener("click", downloadData);

window.addEventListener("resize", () => {
  // re-draw chart on resize using last known rows via a re-fetch (cheap, rare event)
  refreshAll();
});

// ============================== Init ==================================
(async function init() {
  if (!CONFIG.GAS_URL || CONFIG.GAS_URL.indexOf("PASTE_URL") !== -1) {
    setStatus("error", "Isi dulu CONFIG.GAS_URL di script.js dengan URL Apps Script kamu.");
    return;
  }
  setStatus("idle", "Memuat daftar baterai…");
  await loadMeta();
  await refreshAll();
  setInterval(refreshAll, CONFIG.AUTO_REFRESH_MS);
})();
