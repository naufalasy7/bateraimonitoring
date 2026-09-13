# Battery IoT Monitor — Dashboard Web

Dashboard statis (HTML/CSS/JS murni, tanpa build step) untuk memantau data
baterai secara live dan mengunduh data mentahnya.

## 1. Konfigurasi

Edit `script.js`, ganti baris ini dengan URL Web App Apps Script kamu:

```js
const CONFIG = {
  GAS_URL: "https://script.google.com/macros/s/xxxxxxxx/exec",
  AUTO_REFRESH_MS: 15000
};
```

Daftar "Baterai" di dropdown akan otomatis terisi dari sheet-sheet yang ada
di spreadsheet kamu (tidak perlu di-hardcode).

## 2. Coba lokal

Buka `index.html` langsung di browser, atau jalankan server statis sederhana:

```bash
npx serve .
```

## 3. Deploy ke Vercel

**Lewat GitHub (disarankan):**
1. Push folder `web-dashboard/` ini ke sebuah repo GitHub.
2. Di [vercel.com](https://vercel.com) → **Add New Project** → import repo
   tersebut.
3. Framework preset: **Other** (tidak perlu build command, ini static site).
4. Root directory: arahkan ke folder `web-dashboard` kalau repo berisi
   ketiga folder project ini sekaligus.
5. Deploy.

**Lewat CLI:**
```bash
npm i -g vercel
cd web-dashboard
vercel --prod
```

## 4. Cara kerja "Unduh data"

Tombol **Unduh data** membuka tab baru langsung ke URL export Google Sheets
(`.../export?format=xlsx&gid=...`) sehingga file **Excel asli** ter-download
dengan format lengkap — bukan sekadar CSV. Ini butuh sharing Spreadsheet
minimal **"Anyone with the link — Viewer"**.

Kalau kamu tidak ingin men-share Spreadsheet secara publik, ganti tombol ini
agar memakai endpoint `?action=export` (CSV) di `Code.gs`, yang tetap
berjalan lewat izin deployment Apps Script sendiri (lihat komentar di
`downloadData()` pada `script.js`).
