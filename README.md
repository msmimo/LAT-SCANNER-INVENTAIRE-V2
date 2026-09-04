# LAT Scanner Inventaire - APEX Mobile

🔧 Système de gestion d'inventaire pour les moules et pièces avec interface mobile APEX intégrée.

---

# Handoff Document — APEX QR Scanning System & Next Steps

## 👤 User Profile

- **Name:** Maggie
- **Role:** Process Engineer, Canadian aluminum foundry
- **Sites:** UGB and ULAT
- **Languages:** Chinese, French, English (all used in work context)
- **Tech comfort:** High — builds internal tooling, explores AI/automation actively
- **Goal:** Automate as much as possible; reduce manual steps

---

## 🏗️ Current System Architecture

### Frontend
- **2 static HTML pages** hosted on GitHub Pages (public repo, considering GitHub Pro for private)
  - `https://msmimo-ai.github.io/table-APEX1/` → `apex1-v7.html`
  - `https://msmimo-ai.github.io/table-APEX2/` → `apex2-v1.html`
- Both pages are **identical in structure**, only differ in which Supabase table they write to
- Latest HTML files are in `/mnt/user-data/outputs/apex1-v7.html` and `apex2-v1.html`

### Backend — Supabase
- **Project URL:** `https://puydipjoykvwzpwnjedi.supabase.co`
- **Anon key:** `sb_publishable_yZeJG14bj8esqS9D743ymA_1eYH64CG` (public, in HTML)
- **Tables:**
  - `APEX1` — columns: `position` (text), `no.pièce` (text), `date` (text, EDT format)
  - `APEX2` — same structure as APEX1
  - `pending_notification` — columns: `id`, `triggered_at`, `sent`, `sent_snapshot`, `sent_history`
  - `config` — key/value store (currently unused but available)
- **RLS:** Enabled on APEX1 and APEX2 with policies: insert ✅, select ✅, delete ✅, update ❌
- **All Supabase calls use native `fetch`** (not Supabase JS client) due to mobile browser compatibility issues with DataCloneError

### Email — Resend (paid plan)
- **Domain:** `rtacoulee.com` (verified in Resend)
- **From address:** `rapport@rtacoulee.com`
- **API key:** stored in Supabase Edge Function Secrets as `RESEND_API_KEY`

### Edge Functions (Supabase)
1. **`send-daily-report`** — sends weekly report every day at 6AM EDT (cron: `0 10 * * *`) containing full history of APEX1 + APEX2
2. **`send-history-report`** — change-triggered, sends full history when `sent_history = false` and oldest pending notification is 30+ min old
3. **`send-snapshot-report`** — change-triggered, sends current state (latest part per position) when `sent_snapshot = false` and oldest pending notification is 5+ min old. JWT verification is **OFF** for this function (others use anon key auth)

### Cron Jobs (pg_cron)
- `daily-scan-report` → triggers `send-daily-report` every day 6AM EDT
- `check-history-notification` → every 5 min, triggers `send-history-report`
- `check-snapshot-notification` → every 5 min, triggers `send-snapshot-report` (no auth header — JWT is off)

### Database Trigger
- `apex1_change` and `apex2_change` — fire on INSERT or DELETE on APEX1/APEX2
- Call `notify_change()` function which inserts into `pending_notification` if no unsent notification in last 30 min

---

## 📱 App Features (both APEX1 and APEX2 pages)

### Main Table View
- Visual representation of the APEX table with 5 seats (#1–#5, left to right)
- Each seat has 4 clickable strips: NORD (top/short), SUD (bottom/short), OUEST (left/long), EST (right/long)
- **Position coding system:**
  - Short sides (NORD/SUD): `{seat}EF{N|S}` → e.g. `1EFN`, `3EFS`
  - Long sides (OUEST/EST): `{seat}RF{O|E}` → e.g. `2RFO`, `5RFE`
- After scanning, the strip turns **green** for 3 seconds, then shows the part number in the strip

### Validation Rules
- All scanned/entered content must be **numeric only** → error: *"Résultat inconnu du scan."* / *"Résultat inconnu."*
- **EF (short sides):** even numbers only → odd number error: *"Le code scanné/saisi est une face de laminage."*
- **RF (long sides):** odd numbers only → even number error: *"Le code scanné/saisi est une petite face."*

### Scanning
- Uses **jsQR** library (from jsdelivr CDN) with `requestAnimationFrame` for max frame rate
- Camera fills full viewfinder area
- Supports manual input with numeric keyboard on mobile (`inputmode="numeric"`)

### Historique Panel
- Shows last 40 records from the table, ordered by date desc
- Each record: Position code | No. pièce | Date | ✕ delete button
- Delete removes the row from Supabase

### Recherche Panel (Snapshot in time)
- User picks a datetime → shows what was installed at each position at that moment
- Displays as 5 seat diagrams (same visual as main table)
- Green strips = has data at that time

### Tableau de Pièce
- Orange button at bottom of page
- Fetches ALL data from both APEX1 and APEX2
- Groups by part number, tracks full journey across both tables
- Shows: No. Pièce | Position | APEX | Date d'installation | Date de maintenance
- **Date d'installation** = first scan of that part at that position/apex (consecutive same part = take oldest)
- **Date de maintenance** = when a different part replaced it at that position
- **"En service"** (green) = still installed
- Auto-refreshes when tableau is open and a new scan is saved
- Uses `cache: 'no-store'` to prevent browser caching

---

## 🔧 Technical Notes for Next Agent

### All fetch calls use native fetch, not Supabase JS client
```javascript
const url = SUPABASE_URL + '/rest/v1/APEX1?select=*&order=date.desc&limit=40';
const res = await fetch(url, {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Accept': 'application/json'
  },
  cache: 'no-store'
});
```

### Position parsing
```javascript
function makePos(seat, face) { return seat + FACE_TYPE[face] + FACE_CODE[face]; }
function parsePos(pos) {
  const m = pos.match(/^(\d+)(EF|RF)(N|S|E|O)$/);
  if (!m) return [null, null];
  const faceMap = { N:'top', S:'bottom', E:'right', O:'left' };
  return [m[1], faceMap[m[3]]];
}
```

### Date format
- All dates stored as **EDT text string**: `2026-05-19 11:09:20` (via `toLocaleString('sv-SE', { timeZone: 'America/Toronto' })`)
- DST handled automatically by the browser

### Column names (careful with special characters)
- `"no.pièce"` — must be quoted in SQL due to dot and accent
- `position` — plain text
- `date` — text (was timestamptz, changed to text to show EDT)

---

## 🚧 Next Steps (in progress when handoff occurred)

### Immediate: Oracle Data Integration
Maggie wants to calculate **how many casts each part number experienced**, by joining:
- **Supabase data:** part number was at position X from `date_installation` to `date_maintenance`
- **Oracle data:** each cast has a date → if cast date falls within [date_installation, date_maintenance] → that cast belongs to that part

**Oracle data** is pulled via a **company-built Excel Add-in** (called "requete") that writes directly into Excel cells.

**Planned approach:**
- Excel file on **shared company network drive** (colleagues use this)
- **Power Query** in Excel to pull Supabase data (via REST API)
- Join Oracle data + Supabase data in Excel
- Calculate cast count per part number
- One-click refresh via Excel "Refresh All"

**Blocked on:** Maggie has not yet sent a screenshot of the Oracle data format (column names, what one row represents). This is **required before writing any Power Query or Office Script code**.

### Power Query for Supabase
Once Oracle format is known, write Power Query M code to:
1. Fetch all APEX1 + APEX2 data from Supabase REST API
2. Reconstruct part journey (install date / maintenance date per part per position)
3. Join with Oracle cast dates
4. Count casts per part number

---

## 🗂️ Other Projects (context only, not active in this session)

### GPC Dashboard (PyQt5)
- Offline Windows desktop app for aluminum casting chemical composition analysis
- French UI, supports UGB/ULAT factories
- Charts: dual-axis global, per-element trending, spec bands, Carte de contrôle (delta recouvrement ±0.02)
- Performance optimized: ~500ms refresh (was 4000ms)

### Calcul GPC-batch Report (tkinter)
- Parses Excel furnace batch sheets
- Calculates weighted alloy compositions: Σ(Masse × % × Facteur) / Masse_Totale
- Features: live editor, DÉRIVATION CALIBRATION, multi-AU support, MOUVEMENTS & HISTORIQUE tab

---

## ⚠️ Important Constraints

- **Company laptop:** Cannot use Claude, cannot install arbitrary software
- **Company email:** Blocks emails from Claude/AI tools (Resend emails from `rapport@rtacoulee.com` are fine)
- **Network drive:** Power Automate cannot access it (not in Microsoft cloud)
- **Teams/SharePoint:** Available and accessible by Power Automate
- **Copilot:** Available on company laptop
- **Power Automate:** Available
- **Office Scripts:** Available (Excel Online)
- **VBA:** Works on local Excel desktop only

---

## 📁 Output Files Available

| File | Description |
|---|---|
| `apex1-v7.html` | Latest APEX 1 frontend |
| `apex2-v1.html` | Latest APEX 2 frontend |

Both are in `/mnt/user-data/outputs/` in the current Claude session. If starting a new session, Maggie will need to re-upload or the agent will need to regenerate from scratch based on this document.
