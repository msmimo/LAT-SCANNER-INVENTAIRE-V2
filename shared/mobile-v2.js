// ============================================
// LAT SCANNER INVENTAIRE V2 - Mobile App Logic
// Tables gérées dynamiquement (ajout/suppression en config) avec suivi moules & sièges
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
// Scanner des pages Moules / Sièges (recherche par scan au lieu de saisie)
let listScanStream = null;
let listScanAnimation = null;

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
  // 1) Les tables d'abord, et on affiche la grille TOUT DE SUITE.
  //    Ainsi, une panne réseau sur une autre requête (positions, moules,
  //    sièges…) ne peut plus vider l'écran de scan : les tables restent visibles.
  try {
    allTables = await getTables();
    renderTableGrid();
    populateAdminTableSelects();
  } catch (e) {
    console.error('❌ Erreur de chargement des tables:', e);
    showToast('Erreur de chargement des tables. Vérifiez la connexion.', 'error');
  }

  // 2) Le reste des données, dans un bloc séparé : un échec ici ne doit
  //    pas empêcher la sélection de table ci-dessus.
  try {
    allPositions = await sbSelect('table_positions', '*&order=table_id,position_number');
    allMoulds = await getAllMoulds();
    allSeats = await getAllSeats();

    updateDashboardStats();
    renderMouldsList();
    renderSeatsList();
    loadHistory();
    loadConfigStats();
  } catch (e) {
    console.error('❌ Erreur de chargement des données:', e);
    showToast('Certaines données n\'ont pas pu être chargées.', 'error');
  }

  // 3) Nom de l'opérateur (localStorage, indépendant du réseau).
  const savedOperator = localStorage.getItem('lat_operateur');
  if (savedOperator) {
    const opEl = document.getElementById('config-operator-name');
    if (opEl) opEl.value = savedOperator;
  }

  console.log('✅ App initialized');
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
    renderAdminTablesList();
  }
}

// ============================================
// SCAN TAB - TABLE SELECTION
// ============================================
function renderTableGrid() {
  const grid = document.getElementById('table-grid');
  const searchEl = document.getElementById('table-search');
  const filtre = searchEl ? searchEl.value.trim().toLowerCase() : '';

  const tables = filtre
    ? allTables.filter(t => t.nom.toLowerCase().includes(filtre))
    : allTables;

  if (tables.length === 0) {
    grid.innerHTML = '<p class="hint-text" style="grid-column:1/-1;">Aucune table trouvée</p>';
    return;
  }

  grid.innerHTML = tables.map(table => `
    <button class="table-btn" onclick="selectTable('${table.id}')">${formatNomTable(table.nom)}</button>
  `).join('');
}

// Recherche de table par nom (barre de recherche du scan)
function filterTableGrid() {
  renderTableGrid();
}

function selectTable(tableId) {
  selectedTable = allTables.find(t => t.id === tableId);
  if (!selectedTable) return;

  // Update UI
  document.querySelectorAll('.table-btn').forEach(btn => btn.classList.remove('selected'));
  event.target.classList.add('selected');

  document.getElementById('selected-table-info').textContent =
    `Table ${formatNomTable(selectedTable.nom)} sélectionnée — ${selectedTable.dimension_spec || 'Aucune dimension'}`;

  // Show position card
  const positionCard = document.getElementById('position-card');
  positionCard.style.display = 'block';
  renderPositionGrid();

  // Amener l'utilisateur directement à la zone de scan (plan de la table)
  positionCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
    `Table ${formatNomTable(selectedTable.nom)} — Position ${selectedPosition.position_number} — ${typeLabel}`;

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
  if (statut === 'Mise en production') return 'Installé';
  if (statut === 'Inventaire - À entretenir') return 'À entretenir';
  return statut;
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
          <strong>Table ${formatNomTable(table.nom)}</strong>
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
    const dimension = formatNomTable(moule.table_nom);

    return `
      <div class="piece-item ${statusClass}">
        <div class="piece-info">
          <div class="piece-line">
            <span class="piece-name">${moule.no_moule}</span>
            <span class="piece-pos">${dimension}</span>
            <span class="piece-status">${libelleStatut(statutEffectif)}</span>
          </div>
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

  // On propose toutes les actions SAUF le statut déjà en cours (« Prêt » reste automatique).
  const actuel = getStatutEffectif(moule);
  const actions = [];
  if (actuel !== 'Mise en production') {
    // « Installé » : on demandera ensuite sur quelle table installer (fenêtre déroulante).
    actions.push({ label: 'Installé', run: () => openInstallModal('moule', mouleId) });
  }
  ['Chez Huot', 'Inventaire - À entretenir', 'Remisé', 'Rebuté']
    .filter(s => s !== actuel)
    .forEach(s => actions.push({ label: libelleStatut(s), run: () => changerStatutMoule(mouleId, s).then(refresh) }));
  if (moule.position_id) {
    actions.push({ label: 'Retirer de la position', run: () => retirerMoule(mouleId).then(refresh) });
  }

  const lignes = actions.map((a, i) => `${i + 1}. ${a.label}`);
  const choix = prompt(`Moule ${moule.no_moule}\n\nChanger le statut :\n${lignes.join('\n')}`);
  if (choix === null) return;
  const idx = parseInt(choix, 10) - 1;
  if (idx >= 0 && idx < actions.length) actions[idx].run();

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
    const dimension = formatNomTable(seat.table_nom);

    return `
      <div class="piece-item ${statusClass}">
        <div class="piece-info">
          <div class="piece-line">
            <span class="piece-name">${seat.no_seat}</span>
            <span class="piece-pos">${dimension}</span>
            <span class="piece-status">${libelleStatut(statutEffectif)}</span>
          </div>
        </div>
        <button class="btn-action" onclick="showSeatActions('${seat.id}')">⋯</button>
      </div>
    `;
  }).join('');
}

function showSeatActions(seatId) {
  const seat = allSeats.find(s => s.id === seatId);
  if (!seat) return;

  // On propose toutes les actions SAUF le statut déjà en cours (« Prêt » reste automatique).
  const actuel = getStatutEffectif(seat);
  const actions = [];
  if (actuel !== 'Mise en production') {
    // « Installé » : on demandera ensuite sur quelle table installer (fenêtre déroulante).
    actions.push({ label: 'Installé', run: () => openInstallModal('seat', seatId) });
  }
  ['Chez Huot', 'Inventaire - À entretenir', 'Remisé', 'Rebuté']
    .filter(s => s !== actuel)
    .forEach(s => actions.push({ label: libelleStatut(s), run: () => changerStatutSeat(seatId, s).then(refresh) }));
  if (seat.position_id) {
    actions.push({ label: 'Retirer de la position', run: () => retirerSeat(seatId).then(refresh) });
  }

  const lignes = actions.map((a, i) => `${i + 1}. ${a.label}`);
  const choix = prompt(`Siège ${seat.no_seat}\n\nChanger le statut :\n${lignes.join('\n')}`);
  if (choix === null) return;
  const idx = parseInt(choix, 10) - 1;
  if (idx >= 0 && idx < actions.length) actions[idx].run();

  async function refresh() {
    allSeats = await getAllSeats();
    renderSeatsList();
    showToast('✓ Statut mis à jour', 'success');
  }
}

// ============================================
// INSTALLATION DEPUIS LA LISTE (choix de la table via liste déroulante)
// ============================================
function openInstallModal(type, pieceId) {
  const overlay = document.getElementById('install-overlay');
  const select = document.getElementById('install-table-select');
  const label = document.getElementById('install-label');
  if (!overlay || !select) return;

  const piece = type === 'moule'
    ? allMoulds.find(m => m.id === pieceId)
    : allSeats.find(s => s.id === pieceId);
  const numero = piece ? (piece.no_moule || piece.no_seat) : '';
  if (label) label.textContent = type === 'moule' ? `Installer le moule ${numero}` : `Installer le siège ${numero}`;

  overlay.dataset.type = type;
  overlay.dataset.pieceId = pieceId;

  // Liste déroulante des tables ; la table d'origine de la pièce est présélectionnée.
  select.innerHTML = allTables
    .map(t => `<option value="${t.id}"${piece && t.nom === piece.table_nom ? ' selected' : ''}>${formatNomTable(t.nom)}</option>`)
    .join('');

  overlay.style.display = 'flex';

  // Deuxième liste : positions 1 à 5 de la table choisie.
  refreshInstallPositions();
}

// Remplit la liste des positions (1 à 5) de la table sélectionnée, en indiquant
// à chaque position la pièce déjà en place (le cas échéant). Rappelée quand on
// change de table.
function refreshInstallPositions() {
  const overlay = document.getElementById('install-overlay');
  const posSelect = document.getElementById('install-position-select');
  const tableSelect = document.getElementById('install-table-select');
  if (!overlay || !posSelect || !tableSelect) return;

  const type = overlay.dataset.type;
  const tableId = tableSelect.value;
  const liste = type === 'moule' ? allMoulds : allSeats;

  const positions = allPositions
    .filter(p => p.table_id === tableId)
    .sort((a, b) => a.position_number - b.position_number);

  posSelect.innerHTML = positions.map(p => {
    const occupant = liste.find(x => x.position_id === p.id);
    const nom = occupant ? (occupant.no_moule || occupant.no_seat) : '';
    const suffixe = occupant ? ` — occupée (${nom})` : ' — libre';
    return `<option value="${p.id}">Position ${p.position_number}${suffixe}</option>`;
  }).join('');

  // Présélectionne la première position libre (sinon la première de la liste).
  const libre = positions.find(p => !liste.some(x => x.position_id === p.id));
  if (libre) posSelect.value = libre.id;
}

function closeInstallModal() {
  const overlay = document.getElementById('install-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function confirmInstall() {
  const overlay = document.getElementById('install-overlay');
  const type = overlay.dataset.type;
  const pieceId = overlay.dataset.pieceId;
  const tableId = document.getElementById('install-table-select').value;
  const posId = document.getElementById('install-position-select').value;
  const table = allTables.find(t => t.id === tableId);
  if (!table) { showToast('Choisissez une table', 'error'); return; }

  const pos = allPositions.find(p => p.id === posId);
  if (!pos) { showToast('Choisissez une position', 'error'); return; }

  // Une pièce (autre que celle qu'on installe) occupe-t-elle déjà cette position ?
  const liste = type === 'moule' ? allMoulds : allSeats;
  const occupant = liste.find(x => x.position_id === posId && x.id !== pieceId);
  if (occupant) {
    const nomOcc = occupant.no_moule || occupant.no_seat;
    const ok = confirm(`La position ${pos.position_number} de la table ${formatNomTable(table.nom)} est déjà occupée par ${nomOcc}.\n\nVoulez-vous vraiment le remplacer ? (${nomOcc} passera au statut « À entretenir »)`);
    if (!ok) return;
  }

  try {
    if (type === 'moule') {
      const moule = allMoulds.find(m => m.id === pieceId);
      const ancien = moule ? moule.statut : null;
      await sbUpdate('moulds', pieceId, { table_nom: table.nom });
      await installerMoule(pieceId, pos.id);
      await enregistrerHistorique({
        piece: { id: pieceId, no_piece: moule ? moule.no_moule : '', table_nom: table.nom },
        typePiece: 'moule',
        ancienStatut: ancien,
        nouveauStatut: 'Mise en production',
        typeAction: 'installation_moule',
        position: pos,
        notes: `Moule installé sur ${table.nom} position ${pos.position_number}`
      });
      allMoulds = await getAllMoulds();
      renderMouldsList();
    } else {
      const seat = allSeats.find(s => s.id === pieceId);
      const ancien = seat ? seat.statut : null;
      await sbUpdate('seats', pieceId, { table_nom: table.nom });
      await installerSeat(pieceId, pos.id);
      await enregistrerHistorique({
        piece: { id: pieceId, no_piece: seat ? seat.no_seat : '', table_nom: table.nom },
        typePiece: 'seat',
        ancienStatut: ancien,
        nouveauStatut: 'Mise en production',
        typeAction: 'installation_seat',
        position: pos,
        notes: `Siège installé sur ${table.nom} position ${pos.position_number}`
      });
      allSeats = await getAllSeats();
      renderSeatsList();
    }
    closeInstallModal();
    showToast(`✓ Installé sur ${formatNomTable(table.nom)} — position ${pos.position_number}`, 'success');
  } catch (e) {
    console.error(e);
    showToast('Erreur lors de l\'installation', 'error');
  }
}

// ============================================
// SCAN DANS LES PAGES MOULES / SIÈGES
// Scanner un code affiche uniquement cette pièce (comme une recherche),
// puis on change son statut via le bouton « ⋯ », comme en recherche manuelle.
// ============================================
async function startListScan(type) {
  const overlay = document.getElementById('list-scan-overlay');
  const video = document.getElementById('list-scan-video');
  const label = document.getElementById('list-scan-label');
  if (!overlay || !video) return;

  overlay.dataset.type = type;
  if (label) label.textContent = type === 'moule' ? 'Scanner un moule' : 'Scanner un siège';
  overlay.style.display = 'flex';

  try {
    listScanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = listScanStream;
    video.onloadedmetadata = () => {
      listScanAnimation = requestAnimationFrame(listScanFrame);
    };
  } catch (e) {
    console.error(e);
    showToast('Impossible d\'accéder à la caméra', 'error');
    stopListScan();
  }
}

function listScanFrame() {
  const video = document.getElementById('list-scan-video');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code) {
      const type = document.getElementById('list-scan-overlay').dataset.type;
      const valeur = code.data.trim();
      stopListScan();
      appliquerScanListe(type, valeur);
      return;
    }
  }
  listScanAnimation = requestAnimationFrame(listScanFrame);
}

function stopListScan() {
  if (listScanStream) {
    listScanStream.getTracks().forEach(t => t.stop());
    listScanStream = null;
  }
  if (listScanAnimation) {
    cancelAnimationFrame(listScanAnimation);
    listScanAnimation = null;
  }
  const overlay = document.getElementById('list-scan-overlay');
  if (overlay) overlay.style.display = 'none';
}

function appliquerScanListe(type, valeur) {
  if (type === 'moule') {
    const input = document.getElementById('moulds-filter');
    const statut = document.getElementById('moulds-status-filter');
    if (input) input.value = valeur;
    if (statut) statut.value = ''; // ne pas masquer la pièce par un filtre de statut
    filterMoulds();
    switchTab('moulds');
    const trouve = allMoulds.some(m => (m.no_moule || '').toLowerCase() === valeur.toLowerCase());
    showToast(trouve ? `Moule ${valeur}` : `Aucun moule « ${valeur} »`, trouve ? 'success' : 'error');
  } else {
    const input = document.getElementById('seats-filter');
    const statut = document.getElementById('seats-status-filter');
    if (input) input.value = valeur;
    if (statut) statut.value = '';
    filterSeats();
    switchTab('seats');
    const trouve = allSeats.some(s => (s.no_seat || '').toLowerCase() === valeur.toLowerCase());
    showToast(trouve ? `Siège ${valeur}` : `Aucun siège « ${valeur} »`, trouve ? 'success' : 'error');
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
    const matchPiece = (h.no_piece || '').toLowerCase().includes(filterPiece);
    const matchType = !filterType || h.type_piece === filterType;
    return matchPiece && matchType;
  });

  const tbody = document.getElementById('history-table-body');

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:1rem;text-align:center;color:#888;">Aucun historique</td></tr>';
    return;
  }

  const fmt = d => d ? new Date(d).toLocaleString('fr-CA', { dateStyle: 'short', timeStyle: 'short' }) : '';

  tbody.innerHTML = filtered.map(h => {
    // Retrouver la table (lettre) et la position (1-5) de cet enregistrement
    const piece = [...allMoulds, ...allSeats].find(p => p.id === h.piece_id);
    const tableNom = piece ? piece.table_nom : (h.table_nom || '—');
    const position = h.position_id ? getPositionNumber(h.position_id) : '—';
    const icone = h.type_piece === 'moule' ? '🔧' : (h.type_piece === 'seat' ? '🪑' : '');
    const endDate = h.fin_statut ? fmt(h.fin_statut) : '<span style="color:#4caf50;">En cours</span>';

    return `
      <tr>
        <td style="padding:0.5rem;"><strong>${icone} ${h.no_piece || '—'}</strong></td>
        <td style="padding:0.5rem;">${formatNomTable(tableNom)}</td>
        <td style="padding:0.5rem;">${position}</td>
        <td style="padding:0.5rem;">${libelleStatut(h.nouveau_statut || '—')}</td>
        <td style="padding:0.5rem;font-size:0.75rem;">${fmt(h.debut_statut || h.created_at)}</td>
        <td style="padding:0.5rem;font-size:0.75rem;">${endDate}</td>
      </tr>
    `;
  }).join('');
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
  allTables = await getTables();
  allMoulds = await getAllMoulds();
  allSeats = await getAllSeats();

  const production = [...allMoulds, ...allSeats].filter(p => p.statut === 'Mise en production').length;

  document.getElementById('config-stat-moulds').textContent = allMoulds.length;
  document.getElementById('config-stat-seats').textContent = allSeats.length;
  document.getElementById('config-stat-tables').textContent = allTables.length;
  document.getElementById('config-stat-production').textContent = production;

  const infoTables = document.getElementById('config-info-tables');
  if (infoTables) infoTables.textContent = allTables.length;
}

// ============================================
// ADMIN - ADD MOULE/SEAT/TABLE
// ============================================
function populateAdminTableSelects() {
  const options = allTables.map(t => `<option value="${t.nom}">${formatNomTable(t.nom)}</option>`).join('');
  document.getElementById('admin-new-moule-table').innerHTML = '<option value="">Sélectionner table...</option>' + options;
  document.getElementById('admin-new-seat-table').innerHTML = '<option value="">Sélectionner table...</option>' + options;
}

// Statuts qu'un utilisateur peut choisir manuellement (« Prêt » reste automatique).
const STATUTS_MANUELS = ['Mise en production', 'Chez Huot', 'Inventaire - À entretenir', 'Remisé', 'Rebuté', 'Prêt'];

// Demande un statut via une invite numérotée.
// Renvoie la valeur interne, null si annulé, ou undefined si le choix est invalide.
function demanderStatut(titre) {
  const lignes = STATUTS_MANUELS.map((s, i) => `${i + 1}. ${libelleStatut(s)}`);
  const choix = prompt(`${titre}\n\nStatut de la pièce :\n${lignes.join('\n')}`);
  if (choix === null) return null;
  const idx = parseInt(choix, 10) - 1;
  if (idx < 0 || idx >= STATUTS_MANUELS.length) return undefined;
  return STATUTS_MANUELS[idx];
}

async function ajouterNouveauMoule() {
  const no = document.getElementById('admin-new-moule-no').value.trim();
  const table = document.getElementById('admin-new-moule-table').value;
  const dim = document.getElementById('admin-new-moule-dim').value.trim();
  const messageEl = document.getElementById('admin-message');

  if (!no || !table) {
    messageEl.textContent = '⚠️ Veuillez remplir tous les champs requis';
    return;
  }

  const statut = demanderStatut(`Nouveau moule ${no}`);
  if (statut === null) return;                                    // annulé
  if (statut === undefined) { messageEl.textContent = '⚠️ Choix de statut invalide'; return; }

  try {
    if (statut === 'Mise en production') {
      // « Installé » : on crée la pièce en réserve puis on suit la règle de la page
      // (choix de la table et de la position, avec confirmation si occupée).
      const cree = await creerMoule({ no_moule: no, table_nom: table, dimension_spec: dim, condition: 'good', statut: 'Remisé' });
      allMoulds = await getAllMoulds();
      renderMouldsList();
      document.getElementById('admin-new-moule-no').value = '';
      document.getElementById('admin-new-moule-dim').value = '';
      messageEl.textContent = `✓ Moule ${no} créé — choisissez la table et la position`;
      openInstallModal('moule', cree.id);
      return;
    }
    await creerMoule({ no_moule: no, table_nom: table, dimension_spec: dim, condition: 'good', statut });
    messageEl.textContent = `✓ Moule ${no} créé (${libelleStatut(statut)})`;
    document.getElementById('admin-new-moule-no').value = '';
    document.getElementById('admin-new-moule-dim').value = '';
    allMoulds = await getAllMoulds();
    renderMouldsList();
  } catch (e) {
    messageEl.textContent = `❌ Erreur: ${e.message}`;
  }
}

async function ajouterNouveauSeat() {
  const no = document.getElementById('admin-new-seat-no').value.trim();
  const table = document.getElementById('admin-new-seat-table').value;
  const dim = document.getElementById('admin-new-seat-dim').value.trim();
  const messageEl = document.getElementById('admin-message');

  if (!no || !table) {
    messageEl.textContent = '⚠️ Veuillez remplir tous les champs requis';
    return;
  }

  const statut = demanderStatut(`Nouveau siège ${no}`);
  if (statut === null) return;                                    // annulé
  if (statut === undefined) { messageEl.textContent = '⚠️ Choix de statut invalide'; return; }

  try {
    if (statut === 'Mise en production') {
      // « Installé » : on crée la pièce en réserve puis on suit la règle de la page
      // (choix de la table et de la position, avec confirmation si occupée).
      const cree = await creerSeat({ no_seat: no, table_nom: table, dimension_spec: dim, condition: 'good', statut: 'Remisé' });
      allSeats = await getAllSeats();
      renderSeatsList();
      document.getElementById('admin-new-seat-no').value = '';
      document.getElementById('admin-new-seat-dim').value = '';
      messageEl.textContent = `✓ Siège ${no} créé — choisissez la table et la position`;
      openInstallModal('seat', cree.id);
      return;
    }
    await creerSeat({ no_seat: no, table_nom: table, dimension_spec: dim, condition: 'good', statut });
    messageEl.textContent = `✓ Siège ${no} créé (${libelleStatut(statut)})`;
    document.getElementById('admin-new-seat-no').value = '';
    document.getElementById('admin-new-seat-dim').value = '';
    allSeats = await getAllSeats();
    renderSeatsList();
  } catch (e) {
    messageEl.textContent = `❌ Erreur: ${e.message}`;
  }
}

// Affichage du nom d'une table : le tiret devient « x » (« 660-1574 » → « 660 x 1574 »).
// La base de données conserve le tiret ; c'est purement l'affichage.
function formatNomTable(nom) {
  return String(nom || '').replace(/\s*-\s*/g, ' x ');
}

// Le nom d'une table est aussi sa dimension : « 711-1346 » → « 711 x 1346 mm ».
// Un suffixe est toléré (ex: « 711-1346PR » → « 711 x 1346 mm »).
function dimensionDepuisNom(nom) {
  const m = String(nom || '').trim().match(/^(\d+)\s*[-x×]\s*(\d+)/i);
  return m ? `${m[1]} x ${m[2]} mm` : '';
}

async function ajouterNouvelleTable() {
  const nom = document.getElementById('admin-new-table-nom').value.trim();
  const descEl = document.getElementById('admin-new-table-desc');
  const desc = descEl ? descEl.value.trim() : '';
  const messageEl = document.getElementById('admin-message');

  if (!nom) {
    messageEl.textContent = '⚠️ Nom requis (ex: 711-1346)';
    return;
  }
  if (allTables.some(t => (t.nom || '').toLowerCase() === nom.toLowerCase())) {
    messageEl.textContent = `⚠️ La table ${nom} existe déjà`;
    return;
  }

  try {
    await creerTable({
      nom: nom,
      dimension_spec: dimensionDepuisNom(nom) || nom,
      description: desc,
      ordre_affichage: allTables.length + 1
    });

    messageEl.textContent = `✓ Table ${nom} créée avec 5 positions`;
    document.getElementById('admin-new-table-nom').value = '';
    if (descEl) descEl.value = '';

    allTables = await getTables();
    allPositions = await sbSelect('table_positions', '*&order=table_id,position_number');
    renderTableGrid();
    renderAdminTablesList();
    populateAdminTableSelects();
  } catch (e) {
    messageEl.textContent = `❌ Erreur: ${e.message}`;
  }
}

// Liste des tables existantes avec bouton de suppression.
function renderAdminTablesList() {
  const container = document.getElementById('admin-tables-list');
  if (!container) return;

  if (!allTables.length) {
    container.innerHTML = '<p class="hint-text">Aucune table.</p>';
    return;
  }

  container.innerHTML = allTables.map(t => {
    const nbMoules = allMoulds.filter(m => m.table_nom === t.nom).length;
    const nbSeats = allSeats.filter(s => s.table_nom === t.nom).length;
    const dim = t.dimension_spec ? ` <span class="hint-text">(${t.dimension_spec})</span>` : '';
    return `
      <div class="admin-table-row">
        <span><strong>${formatNomTable(t.nom)}</strong>${dim}
          <span class="hint-text">— ${nbMoules} moule(s), ${nbSeats} siège(s)</span>
        </span>
        <button class="btn-danger" onclick="supprimerTableUI('${t.id}')">Supprimer</button>
      </div>
    `;
  }).join('');
}

// Suppression d'une table : conserve l'historique, met ses pièces au rebut.
async function supprimerTableUI(tableId) {
  const table = allTables.find(t => t.id === tableId);
  if (!table) return;

  const nbMoules = allMoulds.filter(m => m.table_nom === table.nom).length;
  const nbSeats = allSeats.filter(s => s.table_nom === table.nom).length;
  const total = nbMoules + nbSeats;

  const message = `Supprimer la table ${table.nom} ?\n\n`
    + `${total} pièce(s) (${nbMoules} moule(s), ${nbSeats} siège(s)) passeront au statut « Rebuté ».\n`
    + `L'historique est conservé.\n\nCette action est irréversible.`;
  if (!window.confirm(message)) return;

  const messageEl = document.getElementById('admin-message');
  if (messageEl) messageEl.textContent = `⏳ Suppression de la table ${table.nom}...`;

  try {
    await supprimerTable(table);

    // Recharger l'état
    allTables = await getTables();
    allPositions = await sbSelect('table_positions', '*&order=table_id,position_number');
    allMoulds = await getAllMoulds();
    allSeats = await getAllSeats();
    if (selectedTable && selectedTable.id === tableId) selectedTable = null;

    renderTableGrid();
    renderAdminTablesList();
    populateAdminTableSelects();

    if (messageEl) messageEl.textContent = `✓ Table ${table.nom} supprimée — ${total} pièce(s) rebutée(s), historique conservé`;
  } catch (e) {
    if (messageEl) messageEl.textContent = `❌ Erreur: ${e.message}`;
  }
}

// ============================================
// START APPLICATION
// ============================================
document.addEventListener('DOMContentLoaded', init);
