# ✅ LAT Scanner Inventaire V2 - Quick Start Checklist

Use this checklist to ensure successful deployment and testing.

---

## 📋 Pre-Deployment Checklist

### Database Setup
- [ ] Create new Supabase project (or use existing)
- [ ] Backup existing data (if migrating from V1)
- [ ] Open Supabase SQL Editor
- [ ] Copy entire contents of `database-schema-v2.sql`
- [ ] Execute migration script
- [ ] Verify: Run `SELECT COUNT(*) FROM tables;` → Should return **18**
- [ ] Verify: Run `SELECT COUNT(*) FROM positions;` → Should return **90**
- [ ] Verify: Run `SELECT COUNT(*) FROM moulds;` → Should return **90**
- [ ] Verify: Run `SELECT COUNT(*) FROM seats;` → Should return **90**

### Frontend Configuration
- [ ] Open `shared/api.js`
- [ ] Update `SUPABASE_URL` with your project URL
- [ ] Update `SUPABASE_KEY` with your anon key
- [ ] Save changes

### File Preparation
- [ ] Ensure all files are present:
  - [ ] `index-v2.html`
  - [ ] `shared/api.js`
  - [ ] `shared/mobile.css`
  - [ ] `shared/mobile-v2-additions.css`
  - [ ] `shared/mobile-v2.js`
- [ ] (Optional) Rename `index-v2.html` to `index.html` for production

---

## 🚀 Deployment Checklist

Choose your deployment method:

### Option A: GitHub Pages
- [ ] Create GitHub repository
- [ ] Push all files to repository
- [ ] Enable GitHub Pages in repository settings
- [ ] Set source to `main` branch, `root` folder
- [ ] Access app at: `https://YOUR-USERNAME.github.io/YOUR-REPO/`
- [ ] Verify app loads correctly

### Option B: Netlify
- [ ] Install Netlify CLI: `npm install -g netlify-cli`
- [ ] Run: `netlify deploy --prod`
- [ ] Follow prompts to link/create site
- [ ] Access app at provided Netlify URL
- [ ] Verify app loads correctly

### Option C: Vercel
- [ ] Install Vercel CLI: `npm install -g vercel`
- [ ] Run: `vercel --prod`
- [ ] Follow prompts
- [ ] Access app at provided Vercel URL
- [ ] Verify app loads correctly

### Option D: Manual Upload
- [ ] Upload all files to your web server
- [ ] Ensure **HTTPS** is enabled (required for camera)
- [ ] Access app via your domain
- [ ] Verify app loads correctly

---

## 🧪 Testing Checklist

### Initial Load Test
- [ ] Open app on mobile device
- [ ] App loads within 3 seconds
- [ ] No console errors (F12 developer tools)
- [ ] Navigation tabs visible at bottom
- [ ] Header shows "Scanner"

### Config Setup
- [ ] Navigate to Config tab (⚙️)
- [ ] Enter operator name
- [ ] Click "Sauvegarder"
- [ ] See success message
- [ ] Refresh page → Name persists

### Scan Tab - Table Selection
- [ ] See 18 table buttons (A, B, C, ..., R)
- [ ] Tap any table button (e.g., Table A)
- [ ] Button highlights (darkens)
- [ ] Position card appears below
- [ ] See 5 position buttons (1, 2, 3, 4, 5)

### Scan Tab - Position Selection
- [ ] Tap any position button (e.g., Position 1)
- [ ] Button highlights (purple)
- [ ] Scan card appears
- [ ] Position status shows:
  - Moule: Aucun
  - Siège: Aucun

### Scan Tab - Install Moule (Manual Entry)
- [ ] Click "✎ Saisie manuelle" under Moule section
- [ ] Manual input field appears
- [ ] Enter moule number (e.g., `am1`)
- [ ] Click "✓ Installer"
- [ ] See success toast: "✓ Moule am1 installé"
- [ ] Position status updates: Moule shows `am1 (good)`

### Scan Tab - Install Seat (Manual Entry)
- [ ] Click "✎ Saisie manuelle" under Siège section
- [ ] Enter seat number (e.g., `as1`)
- [ ] Click "✓ Installer"
- [ ] See success toast: "✓ Siège as1 installé"
- [ ] Position status updates: Siège shows `as1 (good)`

### Scan Tab - QR Code Scanning (Optional)
- [ ] Click "▶ Scanner Moule"
- [ ] Camera permission dialog appears
- [ ] Grant permission
- [ ] Camera feed displays
- [ ] Point camera at QR code
- [ ] Code detected and processed
- [ ] Camera stops automatically
- [ ] Success message appears

### Dashboard Tab
- [ ] Navigate to Dashboard tab (📊)
- [ ] See 4 stat cards:
  - En production: Shows count > 0
  - Chez Huot: Shows 0
  - À entretenir: Shows 0
  - Remisé: Shows count > 0
- [ ] "État des tables" section shows 18 table cards
- [ ] Table A shows 1/5 or 2/5 (based on what you installed)
- [ ] Progress bar reflects occupancy

### Moulds Tab
- [ ] Navigate to Moulds tab (🔧)
- [ ] See list of moulds
- [ ] Filter input at top works
- [ ] Status filter dropdown works
- [ ] Tap ⋯ button on `am1`
- [ ] Prompt appears with options (1-4)
- [ ] Enter `1` (Chez Huot)
- [ ] Success message appears
- [ ] Moule status updates to "Chez Huot"
- [ ] Border color changes to orange

### Seats Tab
- [ ] Navigate to Seats tab (🪑)
- [ ] See list of seats
- [ ] Tap ⋯ button on `as1`
- [ ] Enter `2` (À entretenir)
- [ ] Success message appears
- [ ] Seat status updates
- [ ] Border color changes to red

### History Tab
- [ ] Navigate to History tab (📋)
- [ ] See table with entries
- [ ] Entries show:
  - Type (🔧 moule or 🪑 seat)
  - No. Pièce (am1, as1, etc.)
  - Action (installation_moule, etc.)
  - Table (A)
  - Date/time
- [ ] Filter by piece number works
- [ ] Filter by type works

### Admin Panel
- [ ] Navigate to Config tab
- [ ] Click "Gérer Tables/Moules/Sièges"
- [ ] Admin page loads

#### Add New Moule
- [ ] Enter number: `am6`
- [ ] Select table: `A`
- [ ] Enter dimension: `1800 x 1400 mm`
- [ ] Click "Créer moule"
- [ ] Success message: "✓ Moule am6 créé"
- [ ] Go to Moulds tab
- [ ] Verify `am6` appears in list

#### Add New Seat
- [ ] Enter number: `as6`
- [ ] Select table: `A`
- [ ] Enter dimension: `1800 x 1400 mm`
- [ ] Click "Créer siège"
- [ ] Success message: "✓ Siège as6 créé"
- [ ] Go to Seats tab
- [ ] Verify `as6` appears in list

#### Add New Table (Optional)
- [ ] Enter name: `S`
- [ ] Enter dimension: `2000 x 1500 mm`
- [ ] Enter description: `Test table`
- [ ] Click "Créer table"
- [ ] Success message appears
- [ ] Go to Scan tab
- [ ] Verify Table S button appears
- [ ] Tap Table S
- [ ] Verify 5 positions appear

---

## 🔍 Validation Checklist

### Data Integrity
- [ ] Open Supabase dashboard
- [ ] Navigate to Table Editor
- [ ] Check `moulds` table:
  - [ ] `am1` has `statut = 'Chez Huot'`
  - [ ] `am1` has `position_id = NULL`
- [ ] Check `seats` table:
  - [ ] `as1` has `statut = 'Inventaire - À entretenir'`
  - [ ] `as1` has `position_id = NULL`
- [ ] Check `historique` table:
  - [ ] Multiple entries exist
  - [ ] Each entry has `type_piece`, `no_piece`, `type_action`

### Mobile Responsiveness
- [ ] Test on phone (< 400px width)
  - [ ] All buttons tappable
  - [ ] Text readable
  - [ ] No horizontal scroll
- [ ] Test on tablet (768px+ width)
  - [ ] Layout adjusts appropriately
  - [ ] Touch targets remain large
- [ ] Rotate device (portrait ↔ landscape)
  - [ ] App responds correctly

### Performance
- [ ] Initial page load < 3 seconds on 3G
- [ ] Navigation between tabs instant
- [ ] Camera activation < 1 second
- [ ] Database queries < 500ms
- [ ] No lag when scrolling lists

---

## 🐛 Troubleshooting Checklist

If something doesn't work:

### App Won't Load
- [ ] Check browser console (F12) for errors
- [ ] Verify `SUPABASE_URL` in `api.js` is correct
- [ ] Verify `SUPABASE_KEY` in `api.js` is correct
- [ ] Ensure app is served over HTTPS
- [ ] Clear browser cache and reload

### Tables/Positions Not Showing
- [ ] Verify database migration ran successfully
- [ ] Check Supabase table counts (should be 18, 90, 90, 90)
- [ ] Check browser console for errors
- [ ] Verify RLS policies are set correctly

### Camera Not Working
- [ ] Verify app is on HTTPS (required for camera access)
- [ ] Check camera permissions in browser settings
- [ ] Try different browser (Chrome/Safari)
- [ ] Check console for errors

### Data Not Saving
- [ ] Check browser console for errors
- [ ] Verify Supabase connection
- [ ] Check RLS policies allow INSERT/UPDATE
- [ ] Verify `SUPABASE_KEY` has correct permissions

### Status Not Updating
- [ ] Refresh page (pull down on mobile)
- [ ] Check browser console for errors
- [ ] Verify database query succeeded
- [ ] Check network tab (F12) for failed requests

---

## ✅ Sign-Off Checklist

Before considering deployment complete:

### Technical Sign-Off
- [ ] All database tables created successfully
- [ ] All 18 tables (A-R) present
- [ ] All 90 positions created
- [ ] Initial moulds and seats seeded
- [ ] App loads without errors
- [ ] All navigation tabs work
- [ ] Camera access granted and working
- [ ] Manual entry works
- [ ] Status changes work
- [ ] History logging works
- [ ] Admin functions work

### User Acceptance
- [ ] Operator can select table and position
- [ ] Operator can scan/enter moule
- [ ] Operator can scan/enter seat
- [ ] Operator can view dashboard
- [ ] Operator can filter moulds/seats
- [ ] Operator can change status
- [ ] Operator can view history
- [ ] Operator can add new items (admin)

### Documentation
- [ ] README-V2.md reviewed
- [ ] DEPLOYMENT-GUIDE-V2.md reviewed
- [ ] This checklist completed
- [ ] Screenshots taken (optional)
- [ ] Training materials prepared (optional)

### Production Readiness
- [ ] App URL shared with team
- [ ] Operator name configured
- [ ] Bookmarked or installed on home screen
- [ ] Email notifications configured (optional)
- [ ] Backup plan in place
- [ ] Rollback plan documented

---

## 🎉 Next Steps

Once all checkboxes are complete:

1. **Announce Go-Live**: Inform operators app is ready
2. **Provide Training**: Walk through key workflows
3. **Monitor Usage**: Check for issues in first week
4. **Gather Feedback**: Ask operators for improvement ideas
5. **Plan Enhancements**: Prioritize V2.1 features

---

## 📞 Need Help?

- **Technical Issues**: Check DEPLOYMENT-GUIDE-V2.md troubleshooting section
- **Feature Requests**: Document and discuss with team
- **Bug Reports**: Note steps to reproduce, include screenshots

---

**✅ Checklist Complete?** Congrats! Your LAT Scanner Inventaire V2 is live! 🚀
