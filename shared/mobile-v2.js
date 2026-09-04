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
let selectedType = null; // 'moule' ou 'seat' — quel emplacement de la position est actif
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

// Affiche le plan de la table : rangée de moules (NORD) et rangée de sièges
// (SUD). Chaque cellule montre le numéro de la pièce installée (ou vide).
function renderPositionGrid() {
  const moulesRow = document.getElementById('map-moules-row');
  const seatsRow = document.getElementById('map-seats-row');

  const tablePositions = allPositions
    .filter(p => p.table_id === selectedTable.id)
    .sort((a, b) => a.position_number - b.position_number);

  moulesRow.innerHTML = tablePositions.map(pos => {
    const moule = allMoulds.find(m => m.position_id === pos.id);
    const numero = moule ? moule.no_moule : '';
    return `
      <button class="map-cell moule ${moule ? 'filled' : ''}" data-pos="${pos.id}" data-type="moule" onclick="selectPosition('${pos.id}','moule')">
        <span class="map-cell-pos">M${pos.position_number}</span>
        <span class="map-cell-no">${numero}</span>
      </button>`;
  }).join('');

  seatsRow.innerHTML = tablePositions.map(pos => {
    const seat = allSeats.find(s => s.position_id === pos.id);
    const numero = seat ? seat.no_seat : '';
    return `
      <button class="map-cell seat ${seat ? 'filled' : ''}" data-pos="${pos.id}" data-type="seat" onclick="selectPosition('${pos.id}','seat')">
        <span class="map-cell-pos">S${pos.position_number}</span>
        <span class="map-cell-no">${numero}</span>
      </button>`;
  }).join('');

  // Réappliquer la surbrillance sur la cellule active (position + type)
  if (selectedPosition && selectedType) {
    const cell = document.querySelector(`.map-cell[data-pos="${selectedPosition.id}"][data-type="${selectedType}"]`);
    if (cell) cell.classList.add('selected');
  }
}

// Sélectionne UN emplacement précis (le moule OU le siège d'une position).
// Seul le scanner correspondant est affiché.
async function selectPosition(positionId, type) {
  selectedPosition = allPositions.find(p => p.id === positionId);
  selectedType = type;
  if (!selectedPosition) return;

  // Mettre en surbrillance uniquement la cellule cliquée
  document.querySelectorAll('.map-cell').forEach(c => c.classList.remove('selected'));
  const cell = document.querySelector(`.map-cell[data-pos="${positionId}"][data-type="${type}"]`);
  if (cell) cell.classList.add('selected');

  const typeLabel = type === 'moule' ? 'Moule' : 'Siège';
  document.getElementById('selected-position-info').textContent =
    `Table ${selectedTable.nom} — Position ${selectedPosition.position_number} — ${typeLabel}`;

  // N'afficher que le scanner correspondant au type sélectionné
  document.getElementById('scan-section-moule').style.display = type === 'moule' ? 'block' : 'none';
  document.getElementById('scan-section-seat').style.display = type === 'seat' ? 'block' : 'none';

  // Arrêter tout scan en cours de l'autre type
  if (type === 'moule') stopScanSeat(); else stopScanMoule();

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
  selectedType = null;
  document.querySelectorAll('.map-cell').forEach(c => c.classList.remove('selected'));
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

    // Vérifications selon le statut actuel de la pièce à installer
    const dest = `Table ${selectedTable.nom} Position ${selectedPosition.position_number}`;
    let repairNote = null;

    if (moule.statut === 'Rebuté') {
      // Pièce mise au rebut : installation interdite
      showToast(`Impossible : le moule ${number} est rebuté (scrapped)`, 'error');
      return;
    } else if (moule.statut === 'Mise en production' && moule.position_id) {
      // Déjà installé ailleurs → confirmer le déplacement
      const posActuelle = getPositionNumber(moule.position_id);
      if (!window.confirm(`Le moule ${number} est installé à la position ${posActuelle}.\nConfirmer le déplacement vers ${dest} ?`)) return;
    } else if (moule.statut === 'Chez Huot') {
      // Revient de Huot → confirmer l'installation
      if (!window.confirm(`Le moule ${number} est actuellement Chez Huot.\nConfirmer l'installation à ${dest} ?`)) return;
    } else if (moule.statut === 'Inventaire - À entretenir') {
      // En entretien → demander quelle réparation a été effectuée
      repairNote = window.prompt(`Le moule ${number} était en entretien.\nQuelle réparation a été effectuée ?`);
      if (repairNote === null) return; // annulé
    }
    // Remisé / Prêt : installation directe, sans confirmation

    // Install moule (déplace automatiquement toute pièce déjà à cette position)
    const res = await installerMoule(moule.id, selectedPosition.id);

    // Journaliser les pièces déplacées (remises en inventaire)
    if (res && res.displaced && res.displaced.length) {
      for (const ex of res.displaced) {
        await enregistrerHistorique({
          piece: { id: ex.id, no_piece: ex.no_moule },
          typePiece: 'moule',
          ancienStatut: ex.statut,
          nouveauStatut: 'Remisé',
          typeAction: 'remplacement_moule',
          position: null,
          notes: `Moule ${ex.no_moule} retiré de ${dest} (remplacé par ${number})`
        });
      }
    }

    // Log history
    const notes = repairNote
      ? `Moule ${number} installé à ${dest} — réparation : ${repairNote}`
      : `Moule ${number} installé à ${dest}`;
    await enregistrerHistorique({
      piece: { id: moule.id, no_piece: moule.no_moule },
      typePiece: 'moule',
      ancienStatut: moule.statut,
      nouveauStatut: 'Mise en production',
      typeAction: 'installation_moule',
      position: selectedPosition,
      notes
    });

    showToast(`✓ Moule ${number} installé`, 'success');

    // Reload data and status
    allMoulds = await getAllMoulds();
    await loadPositionStatus();
    renderPositionGrid();
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

    // Vérifications selon le statut actuel de la pièce à installer
    const dest = `Table ${selectedTable.nom} Position ${selectedPosition.position_number}`;
    let repairNote = null;

    if (seat.statut === 'Rebuté') {
      showToast(`Impossible : le siège ${number} est rebuté (scrapped)`, 'error');
      return;
    } else if (seat.statut === 'Mise en production' && seat.position_id) {
      const posActuelle = getPositionNumber(seat.position_id);
      if (!window.confirm(`Le siège ${number} est installé à la position ${posActuelle}.\nConfirmer le déplacement vers ${dest} ?`)) return;
    } else if (seat.statut === 'Chez Huot') {
      if (!window.confirm(`Le siège ${number} est actuellement Chez Huot.\nConfirmer l'installation à ${dest} ?`)) return;
    } else if (seat.statut === 'Inventaire - À entretenir') {
      repairNote = window.prompt(`Le siège ${number} était en entretien.\nQuelle réparation a été effectuée ?`);
      if (repairNote === null) return; // annulé
    }
    // Remisé / Prêt : installation directe, sans confirmation

    const res = await installerSeat(seat.id, selectedPosition.id);

    // Journaliser les pièces déplacées (remises en inventaire)
    if (res && res.displaced && res.displaced.length) {
      for (const ex of res.displaced) {
        await enregistrerHistorique({
          piece: { id: ex.id, no_piece: ex.no_seat },
          typePiece: 'seat',
          ancienStatut: ex.statut,
          nouveauStatut: 'Remisé',
          typeAction: 'remplacement_seat',
          position: null,
          notes: `Siège ${ex.no_seat} retiré de ${dest} (remplacé par ${number})`
        });
      }
    }

    const notes = repairNote
      ? `Siège ${number} installé à ${dest} — réparation : ${repairNote}`
      : `Siège ${number} installé à ${dest}`;
    await enregistrerHistorique({
      piece: { id: seat.id, no_piece: seat.no_seat },
      typePiece: 'seat',
      ancienStatut: seat.statut,
      nouveauStatut: 'Mise en production',
      typeAction: 'installation_seat',
      position: selectedPosition,
      notes
    });

    showToast(`✓ Siège ${number} installé`, 'success');

    allSeats = await getAllSeats();
    await loadPositionStatus();
    renderPositionGrid();
  } catch (e) {
    console.error(e);
    showToast(e.message || 'Erreur installation siège', 'error');
  }
}

// ============================================
// STATUT EFFECTIF (Prêt calculé automatiquement)
// ============================================
// Une table est "en production" si au moins une pièce (moule ou siège)
// y est en statut "Mise en production".
function tableEnProduction(tableNom) {
  return [...allMoulds, ...allSeats].some(
    p => p.table_nom === tableNom && p.statut === 'Mise en production'
  );
}

// Le statut "Prêt" est déterminé automatiquement : une pièce en réserve
// (stockée "Remisé" ou "Prêt") devient "Prêt" si sa table a déjà au moins
// une pièce en production (donc utilisable immédiatement), sinon "Remisé".
// Les autres statuts (production, Huot, entretien, rebuté) restent inchangés.
function getStatutEffectif(piece) {
  if (piece.statut === 'Remisé' || piece.statut === 'Prêt') {
    return tableEnProduction(piece.table_nom) ? 'Prêt' : 'Remisé';
  }
  return piece.statut;
}

// Libellé affiché : le statut interne "Mise en production" est présenté
// comme "Installé" à l'utilisateur (la valeur stockée reste inchangée).
function libelleStatut(statut) {
  return statut === 'Mise en production' ? 'Installé' : statut;
}

// ============================================
// DASHBOARD
// ============================================
async function updateDashboardStats() {
  // Statistiques séparées : moules d'un côté, sièges de l'autre.
  remplirStatsBloc('m', allMoulds);
  remplirStatsBloc('s', allSeats);
}

// Remplit un bloc de statistiques (prefix 'm' pour moules, 's' pour sièges).
function remplirStatsBloc(prefix, pieces) {
  const compteur = statut => pieces.filter(p => getStatutEffectif(p) === statut).length;
  const map = {
    production: 'Mise en production',
    huot: 'Chez Huot',
    entretien: 'Inventaire - À entretenir',
    pret: 'Prêt',
    remise: 'Remisé',
    rebute: 'Rebuté'
  };
  Object.keys(map).forEach(cle => {
    const el = document.getElementById(`stat-${prefix}-${cle}`);
    if (el) el.textContent = compteur(map[cle]);
  });
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

function filterByStatut(statut, type) {
  // Ouvre l'onglet correspondant au type de pièce et applique le filtre de statut.
  if (type === 'seat') {
    switchTab('seats');
    document.getElementById('seats-status-filter').value = statut;
    filterSeats();
  } else {
    switchTab('moulds');
    document.getElementById('moulds-status-filter').value = statut;
    filterMoulds();
  }
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
    const matchStatut = !filterStatut || getStatutEffectif(m) === filterStatut;
    return matchText && matchStatut;
  });

  const container = document.getElementById('moulds-list');

  if (filtered.length === 0) {
    container.innerHTML = '<p class="hint-text">Aucun moule trouvé</p>';
    return;
  }

  container.innerHTML = filtered.map(moule => {
    const statutEffectif = getStatutEffectif(moule);
    const statusClass = statutEffectif.replace(/\s+/g, '-').toLowerCase();
    const positionInfo = moule.position_id ?
      `<br><small>Table ${moule.table_nom} — Position ${getPositionNumber(moule.position_id)}</small>` : '';

    return `
      <div class="piece-item ${statusClass}">
        <div class="piece-info">
          <strong>${moule.no_moule}</strong> — ${moule.table_nom}
          <br><small>${libelleStatut(statutEffectif)}</small>
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

  const action = prompt(`Moule ${moule.no_moule}\nChoisir action:\n1. Chez Huot\n2. À entretenir\n3. Remisé\n4. Rebuté\n5. Retirer de la position\n\n(Prêt est déterminé automatiquement)`);

  if (action === '1') changerStatutMoule(mouleId, 'Chez Huot').then(() => refresh());
  else if (action === '2') changerStatutMoule(mouleId, 'Inventaire - À entretenir').then(() => refresh());
  else if (action === '3') changerStatutMoule(mouleId, 'Remisé').then(() => refresh());
  else if (action === '4') changerStatutMoule(mouleId, 'Rebuté').then(() => refresh());
  else if (action === '5') retirerMoule(mouleId).then(() => refresh());

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
    const matchStatut = !filterStatut || getStatutEffectif(s) === filterStatut;
    return matchText && matchStatut;
  });

  const container = document.getElementById('seats-list');

  if (filtered.length === 0) {
    container.innerHTML = '<p class="hint-text">Aucun siège trouvé</p>';
    return;
  }

  container.innerHTML = filtered.map(seat => {
    const statutEffectif = getStatutEffectif(seat);
    const statusClass = statutEffectif.replace(/\s+/g, '-').toLowerCase();
    const positionInfo = seat.position_id ?
      `<br><small>Table ${seat.table_nom} — Position ${getPositionNumber(seat.position_id)}</small>` : '';

    return `
      <div class="piece-item ${statusClass}">
        <div class="piece-info">
          <strong>${seat.no_seat}</strong> — ${seat.table_nom}
          <br><small>${libelleStatut(statutEffectif)}</small>
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

  const action = prompt(`Siège ${seat.no_seat}\nChoisir action:\n1. Chez Huot\n2. À entretenir\n3. Remisé\n4. Rebuté\n5. Retirer de la position\n\n(Prêt est déterminé automatiquement)`);

  if (action === '1') changerStatutSeat(seatId, 'Chez Huot').then(() => refresh());
  else if (action === '2') changerStatutSeat(seatId, 'Inventaire - À entretenir').then(() => refresh());
  else if (action === '3') changerStatutSeat(seatId, 'Remisé').then(() => refresh());
  else if (action === '4') changerStatutSeat(seatId, 'Rebuté').then(() => refresh());
  else if (action === '5') retirerSeat(seatId).then(() => refresh());

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
