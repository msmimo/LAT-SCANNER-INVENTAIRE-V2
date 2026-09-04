# 🚀 LAT Scanner Inventaire V2 - Deployment Guide

## 📋 Overview

This guide walks through deploying the **completely redesigned** LAT Scanner Inventaire V2 system with the new architecture:
- **18 Tables** (A-R) instead of DC74/DC75
- **5 Positions per table** (1-5)
- **Dual tracking**: Mould + Seat per position
- **4 Status types**: Mise en production, Chez Huot, À entretenir, Remisé

---

## 🗄️ Step 1: Database Migration

### 1.1 Backup Existing Data (IMPORTANT!)

Before running any migration, **backup your existing Supabase database**:

```sql
-- In Supabase SQL Editor, export existing data if needed
SELECT * FROM pieces;
SELECT * FROM historique;
```

### 1.2 Run Migration Script

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file `database-schema-v2.sql`
4. Execute the entire script

This will:
- Create all new tables (`tables`, `positions`, `moulds`, `seats`, `historique`, `audit`, `pending_notification`)
- Create 18 tables (A-R)
- Create 90 positions (18 × 5)
- Create 90 moulds (5 per table: am1-am5, bm1-bm5, ..., rm1-rm5)
- Create 90 seats (5 per table: as1-as5, bs1-bs5, ..., rs1-rs5)
- Set up indexes and triggers
- Configure RLS policies

### 1.3 Verify Migration

Run these verification queries:

```sql
-- Should return 18
SELECT COUNT(*) as total_tables FROM tables;

-- Should return 90
SELECT COUNT(*) as total_positions FROM positions;

-- Should return 90
SELECT COUNT(*) as total_moulds FROM moulds;

-- Should return 90
SELECT COUNT(*) as total_seats FROM seats;

-- View all tables with position counts
SELECT t.nom, COUNT(p.id) as nb_positions
FROM tables t
LEFT JOIN positions p ON p.table_id = t.id
GROUP BY t.nom
ORDER BY t.ordre_affichage;
```

---

## 📱 Step 2: Frontend Configuration

### 2.1 Update Supabase Credentials

Edit `shared/api.js` and update:

```javascript
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_KEY = 'YOUR-ANON-KEY';
```

### 2.2 File Structure

Ensure you have these files:

```
LAT SCANNER INVENTAIRE V2/
├── index-v2.html                    # New main interface
├── shared/
│   ├── api.js                       # Updated with V2 functions
│   ├── mobile.css                   # Base styles
│   ├── mobile-v2-additions.css      # V2-specific styles
│   ├── mobile-v2.js                 # V2 app logic
│   └── icon-192.png                 # App icon
├── database-schema-v2.sql           # Migration script
├── DEPLOYMENT-GUIDE-V2.md           # This file
└── README.md                        # Project documentation
```

### 2.3 Rename Files for Production

**Option A: Replace old system entirely**
```bash
# Backup old files
mv index.html index-v1-backup.html
mv shared/mobile.js shared/mobile-v1-backup.js

# Activate V2
mv index-v2.html index.html
mv shared/mobile-v2.js shared/mobile.js
mv shared/mobile-v2-additions.css shared/mobile-additions.css
```

**Option B: Keep both versions (testing)**
- Access V1 at: `https://your-domain.com/index.html`
- Access V2 at: `https://your-domain.com/index-v2.html`

---

## 🌐 Step 3: Deployment Options

### Option A: GitHub Pages

1. **Create/Update repository**
   ```bash
   git init
   git add .
   git commit -m "Deploy LAT Scanner V2"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/lat-scanner-v2.git
   git push -u origin main
   ```

2. **Enable GitHub Pages**
   - Go to repository **Settings** → **Pages**
   - Source: `Deploy from a branch`
   - Branch: `main` / `root`
   - Save

3. **Access your app**
   - URL: `https://YOUR-USERNAME.github.io/lat-scanner-v2/index-v2.html`

### Option B: Netlify

1. **Deploy via Netlify CLI**
   ```bash
   npm install -g netlify-cli
   netlify deploy --prod
   ```

2. **Or drag & drop**
   - Go to [netlify.com](https://netlify.com)
   - Drag the entire project folder
   - Get instant URL

### Option C: Vercel

```bash
npm install -g vercel
vercel --prod
```

### Option D: Direct Supabase Storage

1. **Upload to Supabase Storage**
   - Create a bucket named `lat-scanner-app`
   - Make it public
   - Upload all files
   - Access via: `https://YOUR-PROJECT.supabase.co/storage/v1/object/public/lat-scanner-app/index-v2.html`

---

## 🔧 Step 4: Configuration & Testing

### 4.1 Set Operator Name

1. Open the app
2. Go to **Config** tab (⚙️)
3. Enter operator name and save

### 4.2 Test Workflow

**Test 1: Table & Position Selection**
- ✅ Tap a table (A-R) → Should highlight and show positions
- ✅ Tap a position (1-5) → Should show scan interface

**Test 2: Install Moule**
- ✅ Click "Scanner Moule" or enter manually (e.g., `am1`)
- ✅ Should show success message
- ✅ Status should update to show moule at position

**Test 3: Install Seat**
- ✅ Same as moule, test with `as1`
- ✅ Both moule and seat should show in position status

**Test 4: Dashboard**
- ✅ Navigate to Dashboard tab
- ✅ Should show statistics (production, Huot, etc.)
- ✅ Table status cards should show occupancy

**Test 5: Change Status**
- ✅ Go to Moules tab
- ✅ Tap ⋯ on a moule
- ✅ Change status (Chez Huot, À entretenir, Remisé)
- ✅ Verify status updates

**Test 6: Admin - Add New Items**
- ✅ Go to Config → "Gérer Tables/Moules/Sièges"
- ✅ Add a new moule (e.g., `am6` for table A)
- ✅ Add a new seat (e.g., `as6` for table A)
- ✅ Add a new table (e.g., `S`)

**Test 7: History**
- ✅ Navigate to History tab
- ✅ Should show all actions (installations, removals, etc.)
- ✅ Filter by piece number or type

---

## 📧 Step 5: Email Notifications (Optional)

### 5.1 Keep Existing Resend Integration

If you had email notifications in V1, you can adapt them:

1. **Update Edge Functions** to query new tables:
   ```javascript
   // Instead of querying APEX1/APEX2:
   const moulds = await supabase.from('moulds').select('*');
   const seats = await supabase.from('seats').select('*');
   ```

2. **Update Email Templates** to reflect new structure (18 tables, moule+seat)

### 5.2 Trigger Notifications

The `pending_notification` table is still available. You can insert records manually or via triggers:

```sql
-- Example: Trigger email when moule installed
CREATE OR REPLACE FUNCTION notify_moule_installed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.statut = 'Mise en production' AND OLD.statut != 'Mise en production' THEN
    INSERT INTO pending_notification (notes)
    VALUES ('Moule ' || NEW.no_moule || ' installé');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER moule_installed_trigger
AFTER UPDATE ON moulds
FOR EACH ROW
EXECUTE FUNCTION notify_moule_installed();
```

---

## 🔒 Step 6: Security & RLS (Optional)

Currently, RLS policies allow all operations for anonymous users. For production:

```sql
-- Example: Restrict deletion to authenticated users only
DROP POLICY "Enable all for anon users" ON moulds;

CREATE POLICY "Allow read for anon" ON moulds
FOR SELECT USING (true);

CREATE POLICY "Allow insert/update for anon" ON moulds
FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated only" ON moulds
FOR DELETE USING (auth.role() = 'authenticated');
```

---

## 📊 Step 7: Data Migration from V1 to V2 (Optional)

If you want to migrate existing piece data from the old system:

```sql
-- Example: Map old DC74 positions to new Table A
-- This is highly dependent on your old schema
-- Adjust accordingly

-- Assuming old system had a 'pieces' table with position codes
INSERT INTO moulds (no_moule, table_nom, statut, position_id)
SELECT
  old_piece_no,
  'A',  -- Map to table A
  CASE
    WHEN old_status = 'DC74' THEN 'Mise en production'
    WHEN old_status = 'Chez Huot' THEN 'Chez Huot'
    ELSE 'Remisé'
  END,
  (SELECT id FROM positions WHERE table_nom = 'A' AND position_number = old_position_num LIMIT 1)
FROM old_pieces_table
WHERE old_table = 'DC74';
```

**⚠️ WARNING**: Test this thoroughly in a staging environment first!

---

## 🐛 Troubleshooting

### Issue: "Erreur Supabase (401)"
**Solution**: Check that `SUPABASE_URL` and `SUPABASE_KEY` in `api.js` are correct

### Issue: Tables not loading
**Solution**: Open browser console (F12), check for errors. Verify migration ran successfully.

### Issue: Camera not working
**Solution**: Ensure app is served over **HTTPS** (required for camera access on mobile)

### Issue: "Table already exists" error during migration
**Solution**: Drop all tables first:
```sql
DROP TABLE IF EXISTS audit CASCADE;
DROP TABLE IF EXISTS historique CASCADE;
DROP TABLE IF EXISTS seats CASCADE;
DROP TABLE IF EXISTS moulds CASCADE;
DROP TABLE IF EXISTS positions CASCADE;
DROP TABLE IF EXISTS tables CASCADE;
DROP TABLE IF EXISTS pending_notification CASCADE;
```
Then re-run the migration script.

---

## 📱 Mobile App Installation (PWA)

Users can install the app on their home screen:

### iOS (Safari)
1. Open the app in Safari
2. Tap Share button
3. Tap "Add to Home Screen"
4. Confirm

### Android (Chrome)
1. Open the app in Chrome
2. Tap menu (⋮)
3. Tap "Add to Home Screen"
4. Confirm

---

## 🎯 Next Steps

1. ✅ Complete database migration
2. ✅ Deploy frontend
3. ✅ Test all workflows
4. 📧 Set up email notifications (optional)
5. 🔒 Configure production RLS policies
6. 📱 Distribute app URL to operators
7. 📊 Monitor usage and gather feedback

---

## 📞 Support

For issues or questions:
- Check browser console for errors (F12)
- Verify Supabase connection
- Review RLS policies if queries return empty
- Check that migration completed successfully

---

## 🔄 Rollback Plan

If V2 has issues, you can quickly rollback:

```bash
# Restore V1 files
mv index-v1-backup.html index.html
mv shared/mobile-v1-backup.js shared/mobile.js
```

The old database tables remain untouched if you used the new schema in a separate set of tables.

---

**Version**: 2.0.0  
**Last Updated**: 2026-09-04  
**Architecture**: 18 Tables (A-R), 5 Positions, Moule + Seat Tracking
