// ============================================
// LAT SCANNER INVENTAIRE V2 - Mobile App Logic
// New Architecture: 18 Tables (A-R) with Mould & Seat Tracking
// ============================================

// Global State
let currentTab = 'scan';
let allTables = [];
let allPositions = [];
let allMoulds = [];
let allSeats = [];
let selectedTable = null;
let selectedPosition = null;
let cameraStreamMoule = null;
let cameraStreamSeat = null;
let scanAnimationMoule = null;
let scanAnimationSeat = null;

// Page Titles
const pageTitles = {
  scan: 'Scanner',
  dashboard: 'Dashboard',
  moulds: 'Moules',
  seats: 'Sièges',
  history: 'Historique',
  config: 'Configuration',
  admin: 'Administration'
};

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  try {
    // Load all data
    allTables = await getTables();
    allPositions = await sbSelect('table_positions', '*&order=table_id,position_number');
    allMoulds = await getAllMoulds();
    allSeats = await getAllSeats();

    // Render initial views
    renderTableGrid();
    updateDashboardStats();
    renderMouldsList();
    renderSeatsList();
    loadHistory();
    loadConfigStats();

    // Populate admin dropdowns
    populateAdminTableSelects();

    // Load operator name
    const savedOperator = localStorage.getItem('lat_operateur');
    if (savedOperator) {
      document.getElementById('config-operator-name').value = savedOperator;
    }

    console.log('✅ App initialized successfully');
  } catch (e) {
    console.error('❌ Initialization error:', e);
    showToast('Erreur de configuration. Vérifiez Supabase.', 'error');
  }
}

// ============================================
// TOAST NOTIFICATION
// ============================================
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// TAB SWITCHING
// ============================================
function switchTab(tabName) {
  currentTab = tabName;

  // Update views
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById(`tab-${tabName}`).classList.add('active');

  // Update navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    item.removeAttribute('aria-current');
  });
  const activeNavItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  if (activeNavItem) {
    activeNavItem.classList.add('active');
    activeNavItem.setAttribute('aria-current', 'page');
  }

  // Update title
  document.getElementById('page-title').textContent = pageTitles[tabName];

  // Reload data for specific tabs
  if (tabName === 'dashboard') {
    updateDashboardStats();
    renderDashboardTables();
  } else if (tabName === 'moulds') {
    renderMouldsList();
  } else if (tabName === 'seats') {
    renderSeatsList();
  } else if (tabName === 'history') {
    loadHistory();
  } else if (tabName === 'config') {
    loadConfigStats();
  } else if (tabName === 'admin') {
    populateAdminTableSelects();
  }
}

// ============================================
// SCAN TAB - TABLE SELECTION
// ============================================
function renderTableGrid() {
  const grid = document.getElementById('table-grid');
  grid.innerHTML = allTables.map(table => `
    <button class="table-btn" onclick="selectTable('${table.id}')">${table.nom}</button>
  `).join('');
}

function selectTable(tableId) {
  selectedTable = allTables.find(t => t.id === tableId);
  if (!selectedTable) return;

  // Update UI
  document.querySelectorAll('.table-btn').forEach(btn => btn.classList.remove('selected'));
  event.target.classList.add('selected');

  document.getElementById('selected-table-info').textContent =
    `Table ${selectedTable.nom} sélectionnée — ${selectedTable.dimension_spec || 'Aucune dimension'}`;

  // Show position card
  document.getElementById('position-card').style.display = 'block';
  renderPositionGrid();

  // Haptic feedback
  if (navigator.vibrate) navigator.vibrate(10);
}

function renderPositionGrid() {
  const grid = document.getElementById('position-grid');
  const tablePositions = allPositions.filter(p => p.table_id === selectedTable.id);

  grid.innerHTML = tablePositions.map(pos => `
    <button class="position-btn" onclick="selectPosition('${pos.id}')">${pos.position_number}</button>
  `).join('');
}

async function selectPosition(positionId) {
  selectedPosition = allPositions.find(p => p.id === positionId);
  if (!selectedPosition) return;

  // Update UI
  document.querySelectorAll('.position-btn').forEach(btn => btn.classList.remove('selected'));
  event.target.classList.add('selected');

  document.getElementById('selected-position-info').textContent =
    `Table ${selectedTable.nom} — Position ${selectedPosition.position_number}`;

  // Show scan card and load position status
  document.getElementById('scan-card').style.display = 'block';
  await loadPositionStatus();

  // Scroll to scan card
  document.getElementById('scan-card').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Haptic feedback
  if (navigator.vibrate) navigator.vibrate(10);
}

async function loadPositionStatus() {
  const occupancy = await getPositionOccupancy(selectedPosition.id);

  const mouleEl = document.getElementById('status-moule');
  const seatEl = document.getElementById('status-seat');

  if (occupancy.moule) {
    mouleEl.textContent = `${occupancy.moule.no_moule} (${occupancy.moule.condition || 'N/A'})`;
    mouleEl.style.color = '#2e9e56';
  } else {
    mouleEl.textContent = 'Aucun';
    mouleEl.style.color = '#888';
  }

  if (occupancy.seat) {
    seatEl.textContent = `${occupancy.seat.no_seat} (${occupancy.seat.condition || 'N/A'})`;
    seatEl.style.color = '#2e9e56';
  } else {
    seatEl.textContent = 'Aucun';
    seatEl.style.color = '#888';
  }
}

function retourSelectionPosition() {
  document.getElementById('scan-card').style.display = 'none';
  selectedPosition = null;
  stopScanMoule();
  stopScanSeat();
}

// ============================================
// SCAN MOULE
// ============================================
function toggleManualMoule() {
  const manualSection = document.getElementById('manual-moule');
  const isVisible = manualSection.style.display !== 'none';
  manualSection.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) {
    document.getElementById('input-moule').focus();
  }
}

async function startScanMoule() {
  const camArea = document.getElementById('cam-moule');
  const video = document.getElementById('video-moule');
  const statusEl = document.getElementById('scan-status-moule');
  const scanBtn = document.getElementById('scan-btn-moule');

  try {
    cameraStreamMoule = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = cameraStreamMoule;

    camArea.style.display = 'block';
    statusEl.style.display = 'block';
    statusEl.textContent = 'Scanning...';
    scanBtn.textContent = '⏸ Arrêter';
    scanBtn.onclick = stopScanMoule;

    video.onloadedmetadata = () => {
      scanAnimationMoule = requestAnimationFrame(scanFrameMoule);
    };
  } catch (e) {
    showToast('Impossible d\'accéder à la caméra', 'error');
    console.error(e);
  }
}

function scanFrameMoule() {
  const video = document.getElementById('video-moule');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      stopScanMoule();
      handleMouleScanned(code.data);
      return;
    }
  }

  scanAnimationMoule = requestAnimationFrame(scanFrameMoule);
}

function stopScanMoule() {
  if (cameraStreamMoule) {
    cameraStreamMoule.getTracks().forEach(track => track.stop());
    cameraStreamMoule = null;
  }
  if (scanAnimationMoule) {
    cancelAnimationFrame(scanAnimationMoule);
    scanAnimationMoule = null;
  }

  document.getElementById('cam-moule').style.display = 'none';
  document.getElementById('scan-status-moule').style.display = 'none';
  const scanBtn = document.getElementById('scan-btn-moule');
  scanBtn.textContent = '▶ Scanner Moule';
  scanBtn.onclick = startScanMoule;
}

async function handleMouleScanned(code) {
  document.getElementById('flash-moule').style.display = 'block';
  setTimeout(() => {
    document.getElementById('flash-moule').style.display = 'none';
  }, 500);

  await installerMouleByNumber(code.trim());
}

async function saveMouleManual() {
  const input = document.getElementById('input-moule');
  const code = input.value.trim();
  if (!code) {
    showToast('Veuillez entrer un numéro', 'error');
    return;
  }

  await installerMouleByNumber(code);
  input.value = '';
}

async function installerMouleByNumber(number) {
  try {
    // Find moule by number
    const moule = allMoulds.find(m => m.no_moule.toLowerCase() === number.toLowerCase());

    if (!moule) {
      showToast(`Moule "${number}" introuvable`, 'error');
      return;
    }

    // Check if moule belongs to this table
    if (moule.table_nom !== selectedTable.nom) {
      showToast(`Ce moule appartient à la table ${moule.table_nom}, pas ${selectedTable.nom}`, 'error');
      return;
    }

    // Check if moule is already installed somewhere
    if (moule.statut === 'Mise en production' && moule.position_id) {
      const confirm = window.confirm(`Ce moule est déjà installé. Le déplacer ici?`);
      if (!confirm) return;
    }

    // Install moule
    await installerMoule(moule.id, selectedPosition.id);

    // Log history
    await enregistrerHistorique({
      piece: { id: moule.id },
      ancienStatut: moule.statut,
      nouveauStatut: 'Mise en production',
      typeAction: 'installation_moule',
      position: selectedPosition,
      notes: `Moule ${number} installé à Table ${selectedTable.nom} Position ${selectedPosition.position_number}`
    });

    showToast(`✓ Moule ${number} installé`, 'success');

    // Reload data and status
    allMoulds = await getAllMoulds();
    await loadPositionStatus();
  } catch (e) {
    console.error(e);
    showToast(e.message || 'Erreur installation moule', 'error');
  }
}

// ============================================
// SCAN SEAT
// ============================================
function toggleManualSeat() {
  const manualSection = document.getElementById('manual-seat');
  const isVisible = manualSection.style.display !== 'none';
  manualSection.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) {
    document.getElementById('input-seat').focus();
  }
}

async function startScanSeat() {
  const camArea = document.getElementById('cam-seat');
  const video = document.getElementById('video-seat');
  const statusEl = document.getElementById('scan-status-seat');
  const scanBtn = document.getElementById('scan-btn-seat');

  try {
    cameraStreamSeat = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = cameraStreamSeat;

    camArea.style.display = 'block';
    statusEl.style.display = 'block';
    statusEl.textContent = 'Scanning...';
    scanBtn.textContent = '⏸ Arrêter';
    scanBtn.onclick = stopScanSeat;

    video.onloadedmetadata = () => {
      scanAnimationSeat = requestAnimationFrame(scanFrameSeat);
    };
  } catch (e) {
    showToast('Impossible d\'accéder à la caméra', 'error');
    console.error(e);
  }
}

function scanFrameSeat() {
  const video = document.getElementById('video-seat');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code) {
      stopScanSeat();
      handleSeatScanned(code.data);
      return;
    }
  }

  scanAnimationSeat = requestAnimationFrame(scanFrameSeat);
}

function stopScanSeat() {
  if (cameraStreamSeat) {
    cameraStreamSeat.getTracks().forEach(track => track.stop());
    cameraStreamSeat = null;
  }
  if (scanAnimationSeat) {
    cancelAnimationFrame(scanAnimationSeat);
    scanAnimationSeat = null;
  }

  document.getElementById('cam-seat').style.display = 'none';
  document.getElementById('scan-status-seat').style.display = 'none';
  const scanBtn = document.getElementById('scan-btn-seat');
  scanBtn.textContent = '▶ Scanner Siège';
  scanBtn.onclick = startScanSeat;
}

async function handleSeatScanned(code) {
  document.getElementById('flash-seat').style.display = 'block';
  setTimeout(() => {
    document.getElementById('flash-seat').style.display = 'none';
  }, 500);

  await installerSeatByNumber(code.trim());
}

async function saveSeatManual() {
  const input = document.getElementById('input-seat');
  const code = input.value.trim();
  if (!code) {
    showToast('Veuillez entrer un numéro', 'error');
    return;
  }

  await installerSeatByNumber(code);
  input.value = '';
}

async function installerSeatByNumber(number) {
  try {
    const seat = allSeats.find(s => s.no_seat.toLowerCase() === number.toLowerCase());

    if (!seat) {
      showToast(`Siège "${number}" introuvable`, 'error');
      return;
    }

    if (seat.table_nom !== selectedTable.nom) {
      showToast(`Ce siège appartient à la table ${seat.table_nom}, pas ${selectedTable.nom}`, 'error');
      return;
    }

    if (seat.statut === 'Mise en production' && seat.position_id) {
      const confirm = window.confirm(`Ce siège est déjà installé. Le déplacer ici?`);
      if (!confirm) return;
    }

    await installerSeat(seat.id, selectedPosition.id);

    await enregistrerHistorique({
      piece: { id: seat.id },
      ancienStatut: seat.statut,
      nouveauStatut: 'Mise en production',
      typeAction: 'installation_seat',
      position: selectedPosition,
      notes: `Siège ${number} installé à Table ${selectedTable.nom} Position ${selectedPosition.position_number}`
    });

    showToast(`✓ Siège ${number} installé`, 'success');

    allSeats = await getAllSeats();
    await loadPositionStatus();
  } catch (e) {
    console.error(e);
    showToast(e.message || 'Erreur installation siège', 'error');
  }
}

// ============================================
// DASHBOARD
// ============================================
async function updateDashboardStats() {
  const production = [...allMoulds, ...allSeats].filter(p => p.statut === 'Mise en production').length;
  const huot = [...allMoulds, ...allSeats].filter(p => p.statut === 'Chez Huot').length;
  const entretien = [...allMoulds, ...allSeats].filter(p => p.statut === 'Inventaire - À entretenir').length;
  const remise = [...allMoulds, ...allSeats].filter(p => p.statut === 'Remisé').length;

  document.getElementById('stat-production').textContent = production;
  document.getElementById('stat-huot').textContent = huot;
  document.getElementById('stat-entretien').textContent = entretien;
  document.getElementById('stat-remise').textContent = remise;
}

async function renderDashboardTables() {
  const container = document.getElementById('dashboard-tables-container');

  const html = await Promise.all(allTables.map(async table => {
    const positions = allPositions.filter(p => p.table_id === table.id);
    const occupancyPromises = positions.map(pos => getPositionOccupancy(pos.id));
    const occupancies = await Promise.all(occupancyPromises);

    const filledPositions = occupancies.filter(occ => occ.moule || occ.seat).length;
    const totalPositions = positions.length;

    return `
      <div class="table-status-card">
        <div class="table-status-header">
          <strong>Table ${table.nom}</strong>
          <span>${filledPositions}/${totalPositions}</span>
        </div>
        <div class="table-status-bar">
          <div class="table-status-fill" style="width:${(filledPositions/totalPositions)*100}%"></div>
        </div>
      </div>
    `;
  }));

  container.innerHTML = html.join('');
}

function filterByStatut(statut) {
  // Switch to moulds tab and filter
  switchTab('moulds');
  document.getElementById('moulds-status-filter').value = statut;
  filterMoulds();
}

// ============================================
// MOULDS LIST
// ============================================
async function renderMouldsList() {
  allMoulds = await getAllMoulds();
  filterMoulds();
}

function filterMoulds() {
  const filterText = document.getElementById('moulds-filter').value.toLowerCase();
  const filterStatut = document.getElementById('moulds-status-filter').value;

  const filtered = allMoulds.filter(m => {
    const matchText = m.no_moule.toLowerCase().includes(filterText);
    const matchStatut = !filterStatut || m.statut === filterStatut;
    return matchText && matchStatut;
  });

  const container = document.getElementById('moulds-list');

  if (filtered.length === 0) {
    container.innerHTML = '<p class="hint-text">Aucun moule trouvé</p>';
    return;
  }

  container.innerHTML = filtered.map(moule => {
    const statusClass = moule.statut.replace(/\s+/g, '-').toLowerCase();
    const positionInfo = moule.position_id ?
      `<br><small>Table ${moule.table_nom} — Position ${getPositionNumber(moule.position_id)}</small>` : '';

    return `
      <div class="piece-item ${statusClass}">
        <div class="piece-info">
          <strong>${moule.no_moule}</strong> — ${moule.table_nom}
          <br><small>${moule.statut}</small>
          ${positionInfo}
        </div>
        <button class="btn-action" onclick="showMouleActions('${moule.id}')">⋯</button>
      </div>
    `;
  }).join('');
}

function getPositionNumber(positionId) {
  const pos = allPositions.find(p => p.id === positionId);
  return pos ? pos.position_number : '?';
}

function showMouleActions(mouleId) {
  const moule = allMoulds.find(m => m.id === mouleId);
  if (!moule) return;

  const actions = ['Chez Huot', 'Inventaire - À entretenir', 'Remisé'];
  const action = prompt(`Moule ${moule.no_moule}\nChoisir action:\n1. Chez Huot\n2. À entretenir\n3. Remisé\n4. Retirer de la position`);

  if (action === '1') changerStatutMoule(mouleId, 'Chez Huot').then(() => refresh());
  else if (action === '2') changerStatutMoule(mouleId, 'Inventaire - À entretenir').then(() => refresh());
  else if (action === '3') changerStatutMoule(mouleId, 'Remisé').then(() => refresh());
  else if (action === '4') retirerMoule(mouleId).then(() => refresh());

  async function refresh() {
    allMoulds = await getAllMoulds();
    renderMouldsList();
    showToast('✓ Statut mis à jour', 'success');
  }
}

// ============================================
// SEATS LIST
// ============================================
async function renderSeatsList() {
  allSeats = await getAllSeats();
  filterSeats();
}

function filterSeats() {
  const filterText = document.getElementById('seats-filter').value.toLowerCase();
  const filterStatut = document.getElementById('seats-status-filter').value;

  const filtered = allSeats.filter(s => {
    const matchText = s.no_seat.toLowerCase().includes(filterText);
    const matchStatut = !filterStatut || s.statut === filterStatut;
    return matchText && matchStatut;
  });

  const container = document.getElementById('seats-list');

  if (filtered.length === 0) {
    container.innerHTML = '<p class="hint-text">Aucun siège trouvé</p>';
    return;
  }

  container.innerHTML = filtered.map(seat => {
    const statusClass = seat.statut.replace(/\s+/g, '-').toLowerCase();
    const positionInfo = seat.position_id ?
      `<br><small>Table ${seat.table_nom} — Position ${getPositionNumber(seat.position_id)}</small>` : '';

    return `
      <div class="piece-item ${statusClass}">
        <div class="piece-info">
          <strong>${seat.no_seat}</strong> — ${seat.table_nom}
          <br><small>${seat.statut}</small>
          ${positionInfo}
        </div>
        <button class="btn-action" onclick="showSeatActions('${seat.id}')">⋯</button>
      </div>
    `;
  }).join('');
}

function showSeatActions(seatId) {
  const seat = allSeats.find(s => s.id === seatId);
  if (!seat) return;

  const action = prompt(`Siège ${seat.no_seat}\nChoisir action:\n1. Chez Huot\n2. À entretenir\n3. Remisé\n4. Retirer de la position`);

  if (action === '1') changerStatutSeat(seatId, 'Chez Huot').then(() => refresh());
  else if (action === '2') changerStatutSeat(seatId, 'Inventaire - À entretenir').then(() => refresh());
  else if (action === '3') changerStatutSeat(seatId, 'Remisé').then(() => refresh());
  else if (action === '4') retirerSeat(seatId).then(() => refresh());

  async function refresh() {
    allSeats = await getAllSeats();
    renderSeatsList();
    showToast('✓ Statut mis à jour', 'success');
  }
}

// ============================================
// HISTORY
// ============================================
async function loadHistory() {
  const history = await sbSelect('historique', '*&order=created_at.desc&limit=100');
  filterHistory(history);
}

function filterHistory(history = null) {
  if (!history) {
    loadHistory();
    return;
  }

  const filterPiece = document.getElementById('history-filter-piece').value.toLowerCase();
  const filterType = document.getElementById('history-filter-type').value;

  const filtered = history.filter(h => {
    const matchPiece = h.no_piece.toLowerCase().includes(filterPiece);
    const matchType = !filterType || h.type_piece === filterType;
    return matchPiece && matchType;
  });

  const tbody = document.getElementById('history-table-body');

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:1rem;text-align:center;color:#888;">Aucun historique</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(h => `
    <tr>
      <td style="padding:0.5rem;">${h.type_piece === 'moule' ? '🔧' : '🪑'} ${h.type_piece}</td>
      <td style="padding:0.5rem;"><strong>${h.no_piece}</strong></td>
      <td style="padding:0.5rem;">${h.type_action}</td>
      <td style="padding:0.5rem;">${h.table_nom || '—'} ${h.position_number || ''}</td>
      <td style="padding:0.5rem;font-size:0.75rem;">${new Date(h.created_at).toLocaleString('fr-CA')}</td>
    </tr>
  `).join('');
}

// ============================================
// CONFIG
// ============================================
function saveOperatorName() {
  const name = document.getElementById('config-operator-name').value.trim();
  if (!name) {
    showToast('Veuillez entrer un nom', 'error');
    return;
  }
  localStorage.setItem('lat_operateur', name);
  showToast('✓ Nom sauvegardé', 'success');
}

async function loadConfigStats() {
  allMoulds = await getAllMoulds();
  allSeats = await getAllSeats();

  const production = [...allMoulds, ...allSeats].filter(p => p.statut === 'Mise en production').length;

  document.getElementById('config-stat-moulds').textContent = allMoulds.length;
  document.getElementById('config-stat-seats').textContent = allSeats.length;
  document.getElementById('config-stat-production').textContent = production;
}

// ============================================
// ADMIN - ADD MOULE/SEAT/TABLE
// ============================================
function populateAdminTableSelects() {
  const options = allTables.map(t => `<option value="${t.nom}">${t.nom}</option>`).join('');
  document.getElementById('admin-new-moule-table').innerHTML = '<option value="">Sélectionner table...</option>' + options;
  document.getElementById('admin-new-seat-table').innerHTML = '<option value="">Sélectionner table...</option>' + options;
}

async function ajouterNouveauMoule() {
  const no = document.getElementById('admin-new-moule-no').value.trim();
  const table = document.getElementById('admin-new-moule-table').value;
  const dim = document.getElementById('admin-new-moule-dim').value.trim();

  if (!no || !table) {
    document.getElementById('admin-message').textContent = '⚠️ Veuillez remplir tous les champs requis';
    return;
  }

  try {
    await creerMoule({
      no_moule: no,
      table_nom: table,
      dimension_spec: dim,
      condition: 'good'
    });

    document.getElementById('admin-message').textContent = `✓ Moule ${no} créé`;
    document.getElementById('admin-new-moule-no').value = '';
    document.getElementById('admin-new-moule-dim').value = '';
    allMoulds = await getAllMoulds();
  } catch (e) {
    document.getElementById('admin-message').textContent = `❌ Erreur: ${e.message}`;
  }
}

async function ajouterNouveauSeat() {
  const no = document.getElementById('admin-new-seat-no').value.trim();
  const table = document.getElementById('admin-new-seat-table').value;
  const dim = document.getElementById('admin-new-seat-dim').value.trim();

  if (!no || !table) {
    document.getElementById('admin-message').textContent = '⚠️ Veuillez remplir tous les champs requis';
    return;
  }

  try {
    await creerSeat({
      no_seat: no,
      table_nom: table,
      dimension_spec: dim,
      condition: 'good'
    });

    document.getElementById('admin-message').textContent = `✓ Siège ${no} créé`;
    document.getElementById('admin-new-seat-no').value = '';
    document.getElementById('admin-new-seat-dim').value = '';
    allSeats = await getAllSeats();
  } catch (e) {
    document.getElementById('admin-message').textContent = `❌ Erreur: ${e.message}`;
  }
}

async function ajouterNouvelleTable() {
  const nom = document.getElementById('admin-new-table-nom').value.trim().toUpperCase();
  const dim = document.getElementById('admin-new-table-dim').value.trim();
  const desc = document.getElementById('admin-new-table-desc').value.trim();

  if (!nom || !dim) {
    document.getElementById('admin-message').textContent = '⚠️ Nom et dimension requis';
    return;
  }

  try {
    await creerTable({
      nom: nom,
      dimension_spec: dim,
      description: desc,
      ordre_affichage: allTables.length + 1
    });

    document.getElementById('admin-message').textContent = `✓ Table ${nom} créée avec 5 positions`;
    document.getElementById('admin-new-table-nom').value = '';
    document.getElementById('admin-new-table-dim').value = '';
    document.getElementById('admin-new-table-desc').value = '';

    allTables = await getTables();
    allPositions = await sbSelect('table_positions', '*&order=table_id,position_number');
    renderTableGrid();
    populateAdminTableSelects();
  } catch (e) {
    document.getElementById('admin-message').textContent = `❌ Erreur: ${e.message}`;
  }
}

// ============================================
// START APPLICATION
// ============================================
document.addEventListener('DOMContentLoaded', init);
