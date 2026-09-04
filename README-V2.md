# 🏭 LAT Scanner Inventaire V2

**Mobile inventory management system for aluminium foundry moulds and seats**

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Status](https://img.shields.io/badge/status-production-green)
![Platform](https://img.shields.io/badge/platform-mobile%20web-orange)

---

## 🎯 What's New in V2

### Major Architecture Change

**V1 Architecture** (Old):
- 2 tables: DC74, DC75
- Complex position system (EF/RF codes)
- Single piece type tracking

**V2 Architecture** (New):
- **18 Tables**: A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R
- **5 Positions per table**: 1-5 (simple numbering)
- **Dual tracking**: Each position can have 1 Mould + 1 Seat
- **Dimension-specific**: Each table has specific dimension specs
- **4 Clear Status Types**:
  1. `Mise en production` — Installed on table
  2. `Chez Huot` — At external maintenance facility
  3. `Inventaire - À entretenir` — In inventory, needs maintenance
  4. `Remisé` — Removed/Idle (not in maintenance, not on table)

---

## 📱 Features

### 1. **Scanner Interface**
- **Table Selection**: Visual grid to select from 18 tables (A-R)
- **Position Selection**: Choose position 1-5 for selected table
- **Dual Scanning**: Scan or manually enter both:
  - Mould number (e.g., `am1`, `bm3`, `rm5`)
  - Seat number (e.g., `as1`, `bs3`, `rs5`)
- **Real-time Status**: Shows what's currently installed at each position
- **QR Code Support**: Fast scanning with jsQR library
- **Manual Entry**: Numeric keyboard for manual input

### 2. **Dashboard**
- **Statistics Overview**:
  - Total pieces in production
  - Pieces at Huot
  - Pieces needing maintenance
  - Pieces in storage (Remisé)
- **Table Status**: Visual progress bars showing occupancy for all 18 tables
- **Quick Filters**: Tap stat cards to filter by status

### 3. **Moulds Management**
- **List View**: All moulds with status badges
- **Filters**: By number and status
- **Quick Actions**: Change status, remove from position
- **Table Association**: Each mould belongs to a specific table

### 4. **Seats Management**
- **List View**: All seats with status badges
- **Filters**: By number and status
- **Quick Actions**: Same as moulds
- **Independent Tracking**: Seats tracked separately from moulds

### 5. **History Tracking**
- **Complete Log**: Every installation, removal, status change
- **Filters**: By piece number or type (moule/seat)
- **Timeline View**: Chronological record of all actions
- **Operator Tracking**: Who performed each action

### 6. **Configuration**
- **Operator Name**: Set and save operator identity
- **System Statistics**: View totals for moulds, seats, tables
- **Admin Access**: Manage tables, moulds, and seats

### 7. **Admin Panel**
- **Add Moule**: Create new moulds with table association
- **Add Seat**: Create new seats with table association
- **Add Table**: Expand beyond 18 tables if needed
- **Dimension Specs**: Define size specifications for each item

---

## 🏗️ Technical Architecture

### Frontend
- **Pure HTML/CSS/JavaScript** — No framework dependencies
- **Mobile-First Design** — Optimized for touchscreens
- **PWA-Ready** — Can be installed as app on home screen
- **jsQR Library** — QR code scanning via camera
- **Responsive Layout** — Works on phones, tablets, desktop

### Backend
- **Supabase** — PostgreSQL database with REST API
- **Real-time Updates** — Instant data synchronization
- **RLS Policies** — Row-level security
- **Triggers & Functions** — Automated workflows
- **Audit Trail** — Complete history logging

### Database Schema

**Tables:**
- `tables` — 18 work tables (A-R) with dimension specs
- `positions` — 90 positions (18 tables × 5 positions)
- `moulds` — Mould inventory with table association
- `seats` — Seat inventory with table association
- `historique` — Complete history log
- `audit` — Audit trail for compliance
- `pending_notification` — Email notification queue

**Key Relationships:**
```
tables (1) ──< (N) positions
positions (1) ──< (N) moulds [where statut = 'Mise en production']
positions (1) ──< (N) seats [where statut = 'Mise en production']
```

---

## 🚀 Quick Start

### Prerequisites
- Supabase account (free tier works)
- Web hosting (GitHub Pages, Netlify, Vercel, etc.)
- Mobile device with camera (for QR scanning)

### Installation

1. **Clone Repository**
   ```bash
   git clone https://github.com/YOUR-USERNAME/lat-scanner-v2.git
   cd lat-scanner-v2
   ```

2. **Set Up Supabase**
   - Create new Supabase project
   - Run `database-schema-v2.sql` in SQL Editor
   - Copy your project URL and anon key

3. **Configure Frontend**
   Edit `shared/api.js`:
   ```javascript
   const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
   const SUPABASE_KEY = 'YOUR-ANON-KEY';
   ```

4. **Deploy**
   - Upload files to web hosting
   - Access via HTTPS (required for camera)
   - Open on mobile device

5. **Initial Setup**
   - Go to Config tab
   - Set operator name
   - Start scanning!

📖 **Detailed instructions**: See [DEPLOYMENT-GUIDE-V2.md](DEPLOYMENT-GUIDE-V2.md)

---

## 📊 Usage Workflow

### Installing Moule & Seat

1. **Select Table**: Tap table letter (e.g., Table A)
2. **Select Position**: Tap position number (1-5)
3. **Scan Moule**:
   - Tap "Scanner Moule" button
   - Point camera at QR code
   - Or manually enter number (e.g., `am1`)
4. **Scan Seat**:
   - Tap "Scanner Siège" button
   - Point camera at QR code
   - Or manually enter number (e.g., `as1`)
5. **Verify**: Position status updates to show both items

### Changing Status

1. **Go to Moules or Seats Tab**
2. **Find the piece** (use filter if needed)
3. **Tap ⋯ button** on the piece card
4. **Select action**:
   - `1` → Send to Huot
   - `2` → Mark for maintenance
   - `3` → Move to storage (Remisé)
   - `4` → Remove from position

### Viewing History

1. **Go to History Tab**
2. **View all actions** chronologically
3. **Filter by**:
   - Piece number
   - Type (moule/seat)
4. **Track lifecycle** of each piece

---

## 🔧 Administration

### Adding New Moule

1. Go to **Config** → **Gérer Tables/Moules/Sièges**
2. In "Ajouter un moule" section:
   - Enter number (e.g., `am6`)
   - Select table (e.g., `A`)
   - Enter dimension (optional)
3. Click "Créer moule"

### Adding New Seat

Same process as moule, but in "Ajouter un siège" section.

### Adding New Table

1. In "Ajouter une table" section:
   - Enter table name (e.g., `S`)
   - Enter dimension spec (e.g., `1800 x 1400 mm`)
   - Enter description (optional)
2. Click "Créer table"
3. **Automatically creates 5 positions** for new table

---

## 📁 Project Structure

```
LAT SCANNER INVENTAIRE V2/
│
├── index-v2.html                    # Main application interface
│
├── shared/
│   ├── api.js                       # Supabase config & API functions
│   ├── mobile.css                   # Base mobile styles
│   ├── mobile-v2-additions.css      # V2-specific styles
│   ├── mobile-v2.js                 # App logic & event handlers
│   └── icon-192.png                 # PWA icon
│
├── database-schema-v2.sql           # Complete DB migration script
├── DEPLOYMENT-GUIDE-V2.md           # Deployment instructions
├── README-V2.md                     # This file
└── fix-duplicate-positions.sql      # Data cleanup utility
```

---

## 🎨 User Interface

### Navigation Tabs

- **📷 Scan** — Main scanning interface
- **📊 Dashboard** — Statistics and table overview
- **🔧 Moules** — Mould inventory list
- **🪑 Sièges** — Seat inventory list
- **📋 History** — Complete action history
- **⚙️ Config** — Settings and administration

### Color Coding

- **Green** — Mise en production (installed)
- **Orange** — Chez Huot (at maintenance facility)
- **Red** — À entretenir (needs maintenance)
- **Gray** — Remisé (in storage)

---

## 🔐 Security Features

- **RLS Policies** — Row-level security in Supabase
- **Audit Trail** — All actions logged with operator name
- **Input Validation** — Prevents invalid data entry
- **Table Validation** — Ensures moule/seat match table specs
- **Position Locking** — Prevents double-installation

---

## 🌐 Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome (Android) | 90+ | ✅ Full support |
| Safari (iOS) | 14+ | ✅ Full support |
| Firefox (Android) | 90+ | ✅ Full support |
| Edge (Windows) | 90+ | ✅ Full support |
| Samsung Internet | 14+ | ✅ Full support |

**Requirements:**
- HTTPS connection (for camera access)
- JavaScript enabled
- Viewport width: 320px minimum

---

## 📈 Performance

- **Initial Load**: < 2s on 3G
- **Camera Activation**: < 1s
- **QR Scan Detection**: Real-time (60fps)
- **Database Query**: < 500ms
- **Offline Support**: Planned for future release

---

## 🐛 Known Issues & Limitations

1. **Camera Permission**: Must be granted on first use
2. **Offline Mode**: Not yet implemented (requires network)
3. **QR Code Quality**: Works best with high-contrast codes
4. **Table Limit**: Initial deployment has 18 tables (expandable)
5. **Concurrent Edits**: No conflict resolution (last write wins)

---

## 🗺️ Roadmap

### V2.1 (Next Release)
- [ ] Offline mode with local storage sync
- [ ] Barcode support (in addition to QR)
- [ ] Export history to Excel
- [ ] Advanced search and filters
- [ ] Batch operations (install multiple pieces)

### V2.2 (Future)
- [ ] Oracle data integration (cast counting)
- [ ] Predictive maintenance alerts
- [ ] Photo attachments for pieces
- [ ] Multi-language support (EN/FR/ZH)
- [ ] Desktop admin dashboard

### V3.0 (Vision)
- [ ] Native mobile apps (iOS/Android)
- [ ] Real-time collaboration
- [ ] AI-powered recommendations
- [ ] Integration with ERP systems

---

## 🤝 Contributing

This is an internal tool for LAT foundry operations. If you have feature requests or bug reports:

1. Document the issue clearly
2. Provide steps to reproduce
3. Include screenshots if relevant
4. Share with technical team

---

## 📄 License

Internal use only — Canadian aluminum foundry operations

---

## 👥 Credits

**Developed for**: LAT (Aluminum foundry)  
**Sites**: UGB and ULAT  
**Primary User**: Maggie (Process Engineer)  
**Version**: 2.0.0  
**Last Updated**: 2026-09-04

---

## 📞 Support

For technical issues:
1. Check [DEPLOYMENT-GUIDE-V2.md](DEPLOYMENT-GUIDE-V2.md) troubleshooting section
2. Review browser console for errors (F12)
3. Verify Supabase connection and credentials
4. Contact technical team if issue persists

---

## 🔄 Migration from V1

If migrating from the old DC74/DC75 system:

1. **Backup V1 data** before proceeding
2. **Review** [DEPLOYMENT-GUIDE-V2.md](DEPLOYMENT-GUIDE-V2.md) Section 7
3. **Test migration** in staging environment first
4. **Plan downtime** for production cutover
5. **Train operators** on new interface before go-live

**Key Changes to Communicate:**
- New table names (A-R instead of DC74/DC75)
- Simpler position numbering (1-5 instead of EF/RF codes)
- Dual scanning required (moule + seat)
- 4 clear status types (easier workflow)

---

**🎉 Ready to deploy? Follow [DEPLOYMENT-GUIDE-V2.md](DEPLOYMENT-GUIDE-V2.md) for step-by-step instructions!**
