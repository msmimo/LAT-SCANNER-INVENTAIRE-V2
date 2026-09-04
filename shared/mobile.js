// Mobile App State
let currentTab = 'scan';
let cameraStream = null;
let scanAnimation = false;
let allPieces = [];
let allPositions = [];
let allTables = [];
let positionsById = {};
let currentPosition = null;
let pendingPiece = null;

// Page Titles
const pageTitles = {
  scan: 'Scanner',
  dashboard: 'Dashboard',
  pieces: 'Pièces',
  huot: 'Entrepôt Huot',
  history: 'History',
  config: 'Configuration'
};

// Initialize
async function init() {
  // Setup modal maintenance type first (no API call needed)
  document.getElementById('modal-maintenance-type').innerHTML = TYPES_ENTRETIEN.map(t => `<option value="${t}">${t}</option>`).join('');

  // Event listeners
  document.getElementById('mobile-select-position').addEventListener('change', afficherEtatPositionMobile);
  document.getElementById('pieces-filter').addEventListener('input', chargerPiecesParStatut);

  try {
    // Load data
    allTables = await sbSelect('tables_travail', '*&order=nom');
    allPositions = await sbSelect('positions', '*');
    allPositions.forEach(p => positionsById[p.id] = p);

    // Find DC74 table
    const dc74Table = allTables.find(t => t.nom === 'DC74');
    if (dc74Table) {
      // Set DC74 as default and hide table selector
      document.getElementById('mobile-select-table').value = dc74Table.id;
      document.getElementById('table-selector-group').style.display = 'none';
    } else {
      // If DC74 not found, show table selector as fallback
      const tableOptions = allTables.map(t => `<option value="${t.id}">${t.nom}</option>`).join('');
      document.getElementById('mobile-select-table').innerHTML = tableOptions;
    }

    // Populate dashboard table select (keep it for dashboard view)
    const tableOptions = allTables.map(t => `<option value="${t.id}">${t.nom}</option>`).join('');
    document.getElementById('dashboard-table-select').innerHTML = tableOptions;

    // Set DC74 as default in dashboard too
    if (dc74Table) {
      document.getElementById('dashboard-table-select').value = dc74Table.id;
    }

    // Load initial data
    await chargerPositionsMobile();
    await updatePositionSlots(); // Update visual position status
    await chargerPiecesParStatut();
    await chargerStatsDashboard();
    await chargerDashboardTable(); // Load DC74 dashboard data
    await chargerPiecesHuot();
    await chargerExpeditionsRecentes();

  } catch (e) {
    console.error('Erreur d\'initialisation:', e);

    // Show error in UI - only if element exists
    const historyEl = document.getElementById('recent-history');
    if (historyEl) {
      historyEl.innerHTML = '<div class="message error">⚠️ Configuration Supabase requise<br><small>Modifiez shared/api.js</small></div>';
    }

    if (e.message.includes('VOTRE-PROJET') || e.message.includes('Failed to fetch')) {
      console.error('💡 Configuration Supabase manquante. Éditez shared/api.js avec vos identifiants.');
    }
  }
}

// Toast Notification Helper
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;

  // Show toast
  setTimeout(() => toast.classList.add('show'), 10);

  // Hide after 3 seconds
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Tab Switching
function switchTab(tabName) {
  currentTab = tabName;

  // Update views
  document.querySelectorAll('.tab-view').forEach(view => {
    view.classList.remove('active');
  });
  document.getElementById(`tab-${tabName}`).classList.add('active');

  // Update navigation with ARIA
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    item.removeAttribute('aria-current');
  });
  const activeNavItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  activeNavItem.classList.add('active');
  activeNavItem.setAttribute('aria-current', 'page');

  // Update title
  document.getElementById('page-title').textContent = pageTitles[tabName];

  // Reload data for tab
  if (tabName === 'dashboard') {
    // Ensure DC74 is selected in dashboard
    const dc74Table = allTables.find(t => t.nom === 'DC74');
    if (dc74Table) {
      document.getElementById('dashboard-table-select').value = dc74Table.id;
    }
    chargerStatsDashboard();
    chargerDashboardTable();
  } else if (tabName === 'pieces') {
    chargerPiecesParStatut();
  } else if (tabName === 'huot') {
    chargerPiecesHuot();
    chargerExpeditionsRecentes();
  } else if (tabName === 'history') {
    chargerHistoryTab();
  } else if (tabName === 'config') {
    chargerConfigTab();
  }
}

// Position Selection from Interactive Layout
function selectPosition(positionCode) {
  // Find the position by code (M1, M2, S1, etc.)
  const position = allPositions.find(p => p.code_position === positionCode);

  if (!position) {
    // Silently fail, don't show error
    console.log(`Position ${positionCode} non trouvée`);
    return;
  }

  // Update hidden select
  document.getElementById('mobile-select-position').value = position.id;

  // Update visual state
  document.querySelectorAll('.position-slot').forEach(slot => {
    slot.classList.remove('selected');
  });
  const selectedSlot = document.querySelector(`[data-position="${positionCode}"]`);
  if (selectedSlot) {
    selectedSlot.classList.add('selected');
  }

  // Update current position and display state
  currentPosition = position;
  afficherEtatPositionMobile();

  // Haptic feedback
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }

  // Auto-show scanning section
  showScanningInput();
}

// Update position slots with occupancy status
async function updatePositionSlots() {
  if (!allPositions.length) return;

  // Get DC74 table
  const dc74Table = allTables.find(t => t.nom === 'DC74');
  if (!dc74Table) return;

  // Get all pieces for DC74 positions
  const dc74Positions = allPositions.filter(p => p.table_id === dc74Table.id);
  const positionIds = dc74Positions.map(p => p.id);

  if (positionIds.length === 0) return;

  try {
    const pieces = await sbSelect('pieces', `*&position_id=in.(${positionIds.join(',')})`);
    const occupiedPositionIds = new Set(pieces.map(p => p.position_id));

    // Update each slot
    dc74Positions.forEach(pos => {
      const slot = document.querySelector(`[data-position="${pos.code_position}"]`);
      if (slot) {
        slot.classList.remove('occupied', 'empty');
        if (occupiedPositionIds.has(pos.id)) {
          slot.classList.add('occupied');
        } else {
          slot.classList.add('empty');
        }
      }
    });
  } catch (e) {
    console.error('Erreur lors de la mise à jour des slots:', e);
  }
}

// Scanner Functions
async function chargerPositionsMobile() {
  // Get table ID - either from select or find DC74 by default
  let tableId = document.getElementById('mobile-select-table').value;

  if (!tableId && allTables.length > 0) {
    // If no table selected, find DC74
    const dc74Table = allTables.find(t => t.nom === 'DC74');
    if (dc74Table) {
      tableId = dc74Table.id;
      document.getElementById('mobile-select-table').value = tableId;
    }
  }

  const positions = tableId ? allPositions.filter(p => p.table_id === tableId) : [];

  if (positions.length === 0) {
    document.getElementById('mobile-select-position').innerHTML = '<option value="">Aucune position disponible</option>';
    return;
  }

  document.getElementById('mobile-select-position').innerHTML = positions.map(p =>
    `<option value="${p.id}">${p.code_position}</option>`
  ).join('');
  await afficherEtatPositionMobile();
}

async function afficherEtatPositionMobile() {
  const positionId = document.getElementById('mobile-select-position').value;
  currentPosition = allPositions.find(p => p.id === positionId) || null;
  const statusEl = document.getElementById('mobile-etat-position');
  const statusCard = statusEl.closest('.position-status-card');

  if (!currentPosition) {
    statusEl.innerHTML = '<em style="color:#9ca3af;">Cliquez sur une position ci-dessus</em>';
    if (statusCard) statusCard.classList.add('empty-state');
    return;
  }

  try {
    const pieces = await sbSelect('pieces', `*&position_id=eq.${currentPosition.id}`);

    if (pieces.length > 0) {
      const piece = pieces[0];
      statusEl.innerHTML = `
        <strong>${currentPosition.code_position}</strong> -
        Pièce <strong>${piece.no_piece}</strong>
        <br><small style="color:#666;">Statut: ${piece.statut}</small>
      `;
      if (statusCard) statusCard.classList.remove('empty-state');
    } else {
      statusEl.innerHTML = `
        <strong>${currentPosition.code_position}</strong> -
        <span style="color:#10b981;">Position vide ✓</span>
      `;
      if (statusCard) statusCard.classList.remove('empty-state');
    }
  } catch (e) {
    console.error('Erreur affichage état:', e);
    statusEl.textContent = `${currentPosition.code_position} - Erreur de chargement`;
  }
}

async function demarrerScan() {
  document.getElementById('search-section').style.display = 'none';
  document.getElementById('scanner-section').style.display = 'block';
  await updatePositionSlots(); // Refresh status when opening scanner
}

// Show scanning input section after position selection
function showScanningInput() {
  const scanningSection = document.getElementById('scanning-input-section');
  scanningSection.style.display = 'block';

  // Hide instruction card
  const instructionCard = document.querySelector('.instruction-card');
  if (instructionCard) {
    instructionCard.classList.add('hidden');
  }

  // Smooth scroll to input section
  setTimeout(() => {
    scanningSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);

  // Focus on manual input
  const manualInput = document.getElementById('mobile-manual-input');
  setTimeout(() => {
    manualInput.focus();
  }, 300);

  // Clear any previous messages
  document.getElementById('mobile-message-scan').innerHTML = '';
}

function showSearch() {
  document.getElementById('scanner-section').style.display = 'none';
  document.getElementById('search-section').style.display = 'block';
  document.getElementById('search-input').focus();
}

function hideSearch() {
  document.getElementById('search-section').style.display = 'none';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-input').value = '';
}

async function rechercherPiece() {
  const noPiece = document.getElementById('search-input').value.trim();
  const resultsEl = document.getElementById('search-results');

  if (!noPiece) {
    resultsEl.innerHTML = '<p class="text-error">Veuillez saisir un No. pièce</p>';
    return;
  }

  resultsEl.innerHTML = '<p class="loading">Recherche...</p>';

  try {
    const pieces = await sbSelect('pieces', `*&no_piece=ilike.%${encodeURIComponent(noPiece)}%`);

    if (!pieces.length) {
      resultsEl.innerHTML = '<p class="text-error">Aucune pièce trouvée</p>';
      return;
    }

    resultsEl.innerHTML = pieces.map(p => {
      const position = p.position_id ? positionsById[p.position_id] : null;
      return `
        <div class="piece-item">
          <div>
            <div class="piece-no">${p.no_piece}</div>
            <div class="piece-info">${p.statut}</div>
            <div class="piece-info">${position ? position.code_position : 'Aucune position'}</div>
          </div>
        </div>
      `;
    }).join('');

  } catch (e) {
    resultsEl.innerHTML = '<p class="text-error">Erreur de recherche</p>';
  }
}

function demarrerScan() {
  document.getElementById('search-section').style.display = 'none';
  document.getElementById('scanner-section').style.display = 'block';
  demarrerCamera();
}

function arreterScan() {
  arreterCamera();
  document.getElementById('scanner-section').style.display = 'none';
  document.getElementById('scanning-input-section').style.display = 'none';
  document.getElementById('mobile-message-scan').innerHTML = '';
  document.getElementById('mobile-manual-input').value = '';

  // Show instruction card again
  const instructionCard = document.querySelector('.instruction-card');
  if (instructionCard) {
    instructionCard.classList.remove('hidden');
  }

  // Clear position selection
  document.querySelectorAll('.position-slot').forEach(slot => {
    slot.classList.remove('selected');
  });
  currentPosition = null;

  // Reset status card
  const statusEl = document.getElementById('mobile-etat-position');
  const statusCard = statusEl.closest('.position-status-card');
  statusEl.innerHTML = '<em style="color:#9ca3af;">Cliquez sur une position ci-dessus</em>';
  if (statusCard) statusCard.classList.add('empty-state');
}

async function demarrerCamera() {
  const video = document.getElementById('mobile-video');
  const messageEl = document.getElementById('mobile-message-scan');

  // Check if running on HTTPS or localhost
  const isSecureContext = window.isSecureContext;

  if (!isSecureContext && window.location.hostname !== 'localhost') {
    messageEl.innerHTML = `
      <div class="message error">
        <strong>⚠️ Caméra non disponible</strong><br>
        La caméra nécessite HTTPS sur mobile.<br><br>
        <strong>Solutions:</strong><br>
        1. Utilisez la saisie manuelle ci-dessus<br>
        2. Ou visitez: <code style="font-size:11px">https://${window.location.hostname}:3443/mobile.html</code>
      </div>
    `;
    return;
  }

  video.classList.add('active');

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = cameraStream;
    await video.play();
    scanAnimation = true;
    boucleScanMobile();
    messageEl.innerHTML = '<div class="message success">📷 Caméra activée - Scannez le code QR</div>';
  } catch (e) {
    let errorMsg = 'Caméra indisponible';

    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      errorMsg = `
        <strong>🚫 Permission refusée</strong><br>
        Autorisez l'accès à la caméra dans les paramètres du navigateur.<br><br>
        <strong>Ou utilisez la saisie manuelle ci-dessus</strong>
      `;
    } else if (e.name === 'NotFoundError') {
      errorMsg = `
        <strong>📷 Caméra introuvable</strong><br>
        Votre appareil n'a pas de caméra.<br><br>
        <strong>Utilisez la saisie manuelle ci-dessus</strong>
      `;
    } else if (e.name === 'NotSupportedError') {
      errorMsg = `
        <strong>⚠️ HTTPS requis</strong><br>
        La caméra nécessite une connexion sécurisée.<br><br>
        Visitez: <code style="font-size:11px">https://${window.location.hostname}:3443/mobile.html</code><br>
        Ou utilisez la saisie manuelle
      `;
    }

    messageEl.innerHTML = `<div class="message error">${errorMsg}</div>`;
    video.classList.remove('active');
  }
}

function arreterCamera() {
  scanAnimation = false;
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  document.getElementById('mobile-video').classList.remove('active');
}

function boucleScanMobile() {
  if (!scanAnimation) return;

  const video = document.getElementById('mobile-video');
  const canvas = document.getElementById('mobile-canvas');

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code && code.data) {
      arreterCamera();
      traiterCode(code.data.trim());
      return;
    }
  }

  requestAnimationFrame(boucleScanMobile);
}

function traiterSaisieManuelle() {
  const noPiece = document.getElementById('mobile-manual-input').value.trim();
  if (!noPiece) return;
  traiterCode(noPiece);
  document.getElementById('mobile-manual-input').value = '';
}

async function traiterCode(noPiece) {
  const messageEl = document.getElementById('mobile-message-scan');
  messageEl.innerHTML = '';

  if (!currentPosition) {
    messageEl.innerHTML = '<div class="message error">Choisissez une table et une position</div>';
    return;
  }

  const results = await sbSelect('pieces', `*&no_piece=eq.${encodeURIComponent(noPiece)}`);
  let piece = results[0];

  if (!piece) {
    if (!confirm(`Pièce inconnue : ${noPiece}. La créer avec le statut "Inventaire - Prêt" ?`)) {
      return;
    }
    piece = await sbInsert('pieces', { no_piece: noPiece, statut: 'Inventaire - Prêt' });
    await enregistrerAudit({
      typeEntite: 'pieces',
      entiteId: piece.id,
      action: 'creation',
      apres: piece
    });
  }

  pendingPiece = piece;

  if (piece.statut === 'Inventaire - Prêt') {
    await installerPiece(piece, { force: false });
  } else {
    document.getElementById('modal-error-text').textContent =
      `La pièce ${piece.no_piece} est au statut "${piece.statut}". Seules les pièces "Inventaire - Prêt" peuvent être installées.`;
    document.getElementById('modal-error').style.display = 'flex';
  }
}

function closeErrorModal() {
  document.getElementById('modal-error').style.display = 'none';
  pendingPiece = null;
}

function openMaintenanceModal() {
  document.getElementById('modal-error').style.display = 'none';
  document.getElementById('modal-maintenance').style.display = 'flex';
}

function closeMaintenanceModal() {
  document.getElementById('modal-maintenance').style.display = 'none';
  document.getElementById('modal-maintenance-reason').value = '';
  pendingPiece = null;
}

async function confirmerInstallationForcee() {
  const typeEntretien = document.getElementById('modal-maintenance-type').value;
  const raison = document.getElementById('modal-maintenance-reason').value.trim();
  document.getElementById('modal-maintenance').style.display = 'none';
  await installerPiece(pendingPiece, { force: true, typeEntretien, raison });
  document.getElementById('modal-maintenance-reason').value = '';
}

async function installerPiece(piece, { force, typeEntretien, raison }) {
  const messageEl = document.getElementById('mobile-message-scan');
  const ancienStatut = piece.statut;
  const anciennePositionId = piece.position_id;

  console.log(`[INSTALLATION] Début: Pièce ${piece.no_piece} vers position ${currentPosition.code_position}`);
  console.log(`[INSTALLATION] Position ID: ${currentPosition.id}`);

  // ÉTAPE 1: Retirer TOUTES les pièces qui occupent actuellement la position cible
  const occupants = await sbSelect('pieces', `*&position_id=eq.${currentPosition.id}`);

  console.log(`[INSTALLATION] Trouvé ${occupants.length} occupant(s) à la position ${currentPosition.code_position}`);
  let pieceRemplacee = false;

  // Traiter toutes les pièces occupantes une par une
  for (const ancienneInstallee of occupants) {
    // Ne pas traiter la pièce que nous sommes en train d'installer
    if (ancienneInstallee.id === piece.id) {
      console.log(`[INSTALLATION] ${ancienneInstallee.no_piece} est déjà cette position, skip`);
      continue;
    }

    console.log(`[INSTALLATION] RETRAIT de ${ancienneInstallee.no_piece} (ID: ${ancienneInstallee.id}) de ${currentPosition.code_position}`);

    // Mettre à jour la base de données IMMÉDIATEMENT
    const updateResult = await sbUpdate('pieces', ancienneInstallee.id, {
      statut: 'Inventaire - À entretenir',
      position_id: null
    });

    console.log(`[INSTALLATION] Mise à jour effectuée pour ${ancienneInstallee.no_piece}:`, updateResult);

    // Créer l'historique pour la pièce remplacée
    await enregistrerHistorique({
      piece: ancienneInstallee,
      ancienStatut: 'DC74',
      nouveauStatut: 'Inventaire - À entretenir',
      typeAction: 'remplacement',
      position: currentPosition,
      notes: `Remplacée par ${piece.no_piece}`
    });

    console.log(`[INSTALLATION] ✓ ${ancienneInstallee.no_piece} → Inventaire - À entretenir`);
    pieceRemplacee = true;
  }

  // ÉTAPE 2: Petite pause pour s'assurer que les mises à jour sont propagées
  if (pieceRemplacee) {
    console.log(`[INSTALLATION] Attente de 200ms pour propagation...`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // ÉTAPE 3: Vérifier une dernière fois qu'aucune autre pièce n'occupe la position
  const verificationOccupants = await sbSelect('pieces', `*&position_id=eq.${currentPosition.id}`);
  const autresPieces = verificationOccupants.filter(p => p.id !== piece.id);

  console.log(`[INSTALLATION] Vérification: ${verificationOccupants.length} pièce(s) trouvée(s), ${autresPieces.length} autre(s) pièce(s)`);

  if (autresPieces.length > 0) {
    console.error(`[INSTALLATION] ⚠️ ERREUR: ${autresPieces.length} pièce(s) toujours à la position!`);
    console.error('[INSTALLATION] Pièces restantes:', autresPieces.map(p => `${p.no_piece} (${p.id})`));
    // Forcer le nettoyage
    for (const autrePiece of autresPieces) {
      console.log(`[INSTALLATION] FORCE CLEANUP: ${autrePiece.no_piece}`);
      await sbUpdate('pieces', autrePiece.id, {
        statut: 'Inventaire - À entretenir',
        position_id: null
      });
    }
  }

  // ÉTAPE 4: Installer la nouvelle pièce
  console.log(`[INSTALLATION] Installation de ${piece.no_piece} à ${currentPosition.code_position}`);

  await sbUpdate('pieces', piece.id, {
    statut: 'DC74',
    position_id: currentPosition.id
  });

  console.log(`[INSTALLATION] ✓ ${piece.no_piece} installée avec succès`);

  await enregistrerHistorique({
    piece,
    ancienStatut,
    nouveauStatut: 'DC74',
    typeAction: force ? 'installation_forcee' : (pieceRemplacee ? 'remplacement' : 'installation'),
    position: currentPosition,
    notes: force ? `Forcé — ${typeEntretien} — ${raison}` : null
  });

  if (force) {
    await sbInsert('entretiens', {
      piece_id: piece.id,
      position_id: currentPosition.id,
      type_entretien: typeEntretien,
      precision_autre: typeEntretien.startsWith('Autre') ? raison : null,
      raison,
      effectue_par: nomOperateur()
    });
  }

  await enregistrerAudit({
    typeEntite: 'pieces',
    entiteId: piece.id,
    action: force ? 'installation_forcee' : 'installation',
    avant: { statut: ancienStatut },
    apres: { statut: 'DC74', position_id: currentPosition.id }
  });

  // Use toast for success feedback
  showToast(`✓ Pièce ${piece.no_piece} installée sur ${currentPosition.code_position}`, 'success');
  messageEl.innerHTML = '';  // Clear inline message
  pendingPiece = null;

  console.log('[INSTALLATION] Rafraîchissement de l\'interface...');

  // Refresh visual displays in order
  await afficherEtatPositionMobile();
  await updatePositionSlots(); // Update visual status
  await updateAPEXPositions(); // IMPORTANT: Update APEX visual grid
  await chargerHistoriqueRecent();

  // Refresh history tab if it exists
  if (typeof afficherHistory === 'function' && allHistoryData.length > 0) {
    await chargerHistoryTab();
  }

  console.log('[INSTALLATION] ✓ Installation complète');

  // Clear input and hide scanning section after success
  document.getElementById('mobile-manual-input').value = '';

  // Close scanner section after successful install and reset
  setTimeout(() => {
    document.getElementById('scanning-input-section').style.display = 'none';

    // Show instruction card again
    const instructionCard = document.querySelector('.instruction-card');
    if (instructionCard) {
      instructionCard.classList.remove('hidden');
    }

    // Clear selection
    document.querySelectorAll('.position-slot').forEach(slot => {
      slot.classList.remove('selected');
    });

    // Reset status card
    const statusEl = document.getElementById('mobile-etat-position');
    const statusCard = statusEl.closest('.position-status-card');
    statusEl.innerHTML = '<em style="color:#9ca3af;">Cliquez sur une position ci-dessus</em>';
    if (statusCard) statusCard.classList.add('empty-state');
  }, 1500);
}

// History
async function chargerHistoriqueRecent() {
  const historyEl = document.getElementById('recent-history');
  try {
    const history = await sbSelect('historique', '*&order=debut_statut.desc&limit=10');

    if (!history.length) {
      historyEl.innerHTML = '<p class="loading">Aucun historique</p>';
      return;
    }

    historyEl.innerHTML = history.map(h => `
      <div class="history-item">
        <div class="history-header">
          <span class="piece-no">${h.no_piece}</span>
          <span class="timestamp">${new Date(h.debut_statut).toLocaleString('fr-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })}</span>
        </div>
        <div class="action">${h.type_action} → ${h.nouveau_statut}</div>
        ${h.code_position ? `<div class="piece-info">${h.code_position}</div>` : ''}
      </div>
    `).join('');

  } catch (e) {
    historyEl.innerHTML = '<p class="text-error">Erreur de chargement</p>';
  }
}

// Dashboard
async function chargerStatsDashboard() {
  try {
    const pieces = await sbSelect('pieces', 'statut');
    const counts = {};
    STATUTS.forEach(s => counts[s] = 0);
    pieces.forEach(p => counts[p.statut] = (counts[p.statut] || 0) + 1);

    document.getElementById('stat-pret').textContent = counts['Inventaire - Prêt'] || 0;
    document.getElementById('stat-dc74').textContent = counts['DC74'] || 0;
    document.getElementById('stat-dc75').textContent = counts['DC75'] || 0;
    document.getElementById('stat-entretien').textContent = counts['Inventaire - À entretenir'] || 0;
    document.getElementById('stat-huot').textContent = counts['Chez Huot'] || 0;
    document.getElementById('stat-rebutee').textContent = counts['Remisée - Rebutée'] || 0;

  } catch (e) {
    console.error('Erreur stats:', e);
  }
}

async function chargerDashboardTable() {
  const tableId = document.getElementById('dashboard-table-select').value;
  const gridEl = document.getElementById('dashboard-positions');

  if (!tableId) {
    gridEl.innerHTML = '<p class="loading">Sélectionnez une table</p>';
    return;
  }

  const positions = allPositions.filter(p => p.table_id === tableId);

  if (!positions.length) {
    gridEl.innerHTML = '<p class="loading">Aucune position pour cette table</p>';
    return;
  }

  try {
    const posIds = positions.map(p => p.id).join(',');
    const pieces = posIds ? await sbSelect('pieces', `*&position_id=in.(${posIds})`) : [];
    const piecesByPosition = {};
    pieces.forEach(p => piecesByPosition[p.position_id] = p);

    gridEl.innerHTML = positions.map(pos => {
      const piece = piecesByPosition[pos.id];
      return `
        <div class="position-cell ${piece ? 'occupied' : ''}">
          <div class="code">${pos.code_position}</div>
          <div class="piece">${piece ? piece.no_piece : '—'}</div>
        </div>
      `;
    }).join('');
  } catch (e) {
    gridEl.innerHTML = '<p class="text-error">Erreur de chargement</p>';
  }
}

// Pieces by Status
async function chargerPiecesParStatut() {
  const filter = document.getElementById('pieces-filter').value.trim().toLowerCase();

  try {
    allPieces = await sbSelect('pieces', '*&order=no_piece');
    const filtered = allPieces.filter(p =>
      !filter || p.no_piece.toLowerCase().includes(filter)
    );

    const byStatus = {
      'Inventaire - Prêt': [],
      'DC74': [],
      'DC75': [],
      'Inventaire - À entretenir': [],
      'Chez Huot': [],
      'Remisée - Rebutée': []
    };

    filtered.forEach(p => {
      if (byStatus[p.statut]) {
        byStatus[p.statut].push(p);
      }
    });

    // Update counts and lists
    afficherSection('pret', byStatus['Inventaire - Prêt']);
    afficherSection('dc74', byStatus['DC74']);
    afficherSection('dc75', byStatus['DC75']);
    afficherSection('entretien', byStatus['Inventaire - À entretenir']);
    afficherSection('huot', byStatus['Chez Huot']);
    afficherSection('rebutee', byStatus['Remisée - Rebutée']);

  } catch (e) {
    console.error('Erreur chargement pièces:', e);
  }
}

function afficherSection(sectionKey, pieces) {
  // Handle special case for huot pieces count
  const countId = sectionKey === 'huot' ? 'count-huot-pieces' : `count-${sectionKey}`;
  const countEl = document.getElementById(countId);
  if (countEl) {
    countEl.textContent = pieces.length;
  }

  const listEl = document.getElementById(`list-${sectionKey}`);

  if (!pieces.length) {
    listEl.innerHTML = '<p class="loading">Aucune pièce</p>';
    return;
  }

  listEl.innerHTML = pieces.map(p => {
    const position = p.position_id ? positionsById[p.position_id] : null;
    return `
      <div class="piece-item">
        <div>
          <div class="piece-no">${p.no_piece}</div>
          ${position ? `<div class="piece-info">${position.code_position}</div>` : ''}
          <div class="piece-info">${new Date(p.updated_at).toLocaleString('fr-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })}</div>
        </div>
        <div class="piece-action" onclick="changerStatutPiece('${p.id}')">⚙️</div>
      </div>
    `;
  }).join('');
}

async function changerStatutPiece(pieceId) {
  const piece = allPieces.find(p => p.id === pieceId);
  if (!piece) return;

  // Filter out current status from options
  const availableStatuts = STATUTS.filter(s => s !== piece.statut);
  const choix = availableStatuts.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const reponse = prompt(
    `Pièce: ${piece.no_piece}\nStatut actuel: ${piece.statut}\n\nNouveau statut:\n${choix}`,
    ''
  );

  const index = parseInt(reponse, 10) - 1;
  if (isNaN(index) || !availableStatuts[index]) return;

  const nouveauStatut = availableStatuts[index];
  const ancienStatut = piece.statut;

  // Check if need entretien selection
  const statutsRequierantEntretien = ['Inventaire - Prêt', 'DC74', 'DC75'];
  const needsEntretien =
    statutsRequierantEntretien.includes(nouveauStatut) &&
    !statutsRequierantEntretien.includes(ancienStatut);

  let typeEntretien = null;
  let raison = null;

  if (needsEntretien) {
    const entretienChoix = TYPES_ENTRETIEN.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const entretienReponse = prompt(
      `Pièce ${piece.no_piece}: ${ancienStatut} → ${nouveauStatut}\n\nType d'entretien effectué:\n${entretienChoix}`,
      ''
    );

    const entretienIndex = parseInt(entretienReponse, 10) - 1;
    if (isNaN(entretienIndex) || !TYPES_ENTRETIEN[entretienIndex]) {
      alert('Type d\'entretien requis pour ce changement de statut');
      return;
    }

    typeEntretien = TYPES_ENTRETIEN[entretienIndex];

    if (typeEntretien.startsWith('Autre')) {
      raison = prompt('Précisez le type d\'entretien :') || '';
    }
  } else {
    raison = prompt('Raison du changement (optionnel) :') || null;
  }

  // Update piece
  await sbUpdate('pieces', piece.id, {
    statut: nouveauStatut,
    // Only DC74/DC75 can have position
    position_id: (nouveauStatut === 'DC74' || nouveauStatut === 'DC75') ? piece.position_id : null
  });

  // Record entretien if needed
  if (needsEntretien && typeEntretien) {
    await sbInsert('entretiens', {
      piece_id: piece.id,
      position_id: piece.position_id || null,
      type_entretien: typeEntretien,
      precision_autre: typeEntretien.startsWith('Autre') ? raison : null,
      raison: raison || null,
      effectue_par: nomOperateur()
    });
  }

  await enregistrerHistorique({
    piece,
    ancienStatut,
    nouveauStatut,
    typeAction: 'modification_statut',
    position: piece.position_id ? positionsById[piece.position_id] : null,
    notes: needsEntretien ? `Entretien: ${typeEntretien}${raison ? ' - ' + raison : ''}` : raison
  });

  await enregistrerAudit({
    typeEntite: 'pieces',
    entiteId: piece.id,
    action: 'modification_statut',
    avant: { statut: ancienStatut },
    apres: { statut: nouveauStatut },
    raison: needsEntretien ? `Entretien: ${typeEntretien}` : raison
  });

  showToast(`✓ ${piece.no_piece}: ${ancienStatut} → ${nouveauStatut}`, 'success');
  await chargerPiecesParStatut();
}

// Huot
async function chargerPiecesHuot() {
  const listEl = document.getElementById('huot-pieces-list');
  try {
    const pieces = await sbSelect('pieces', '*&statut=eq.Chez Huot&order=updated_at.desc');

    if (!pieces.length) {
      listEl.innerHTML = '<p class="loading">Aucune pièce chez Huot</p>';
      return;
    }

    listEl.innerHTML = pieces.map(p => `
      <div class="piece-item">
        <div>
          <div class="piece-no">${p.no_piece}</div>
          <div class="piece-info">${new Date(p.updated_at).toLocaleString('fr-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })}</div>
        </div>
      </div>
    `).join('');

  } catch (e) {
    listEl.innerHTML = '<p class="text-error">Erreur de chargement</p>';
  }
}

async function expedierVersHuot() {
  const noPiece = document.getElementById('huot-piece-input').value.trim();
  const messageEl = document.getElementById('huot-message');
  messageEl.innerHTML = '';

  if (!noPiece) {
    messageEl.innerHTML = '<div class="message error">Veuillez saisir un No. pièce</div>';
    return;
  }

  try {
    const results = await sbSelect('pieces', `*&no_piece=eq.${encodeURIComponent(noPiece)}`);
    const piece = results[0];

    if (!piece) {
      messageEl.innerHTML = `<div class="message error">Pièce inconnue : ${noPiece}</div>`;
      return;
    }

    const ancienStatut = piece.statut;
    await sbUpdate('pieces', piece.id, { statut: 'Chez Huot', position_id: null });
    await sbInsert('expeditions_huot', {
      piece_id: piece.id,
      no_piece: piece.no_piece,
      expedie_par: nomOperateur()
    });

    await enregistrerHistorique({
      piece,
      ancienStatut,
      nouveauStatut: 'Chez Huot',
      typeAction: 'expedition_huot',
      position: null,
      notes: 'Expédiée vers Huot depuis mobile'
    });

    await enregistrerAudit({
      typeEntite: 'pieces',
      entiteId: piece.id,
      action: 'expedition_huot',
      avant: { statut: ancienStatut },
      apres: { statut: 'Chez Huot' }
    });

    showToast(`✓ ${piece.no_piece} marquée "Chez Huot"`, 'success');
    messageEl.innerHTML = '';
    document.getElementById('huot-piece-input').value = '';
    await chargerPiecesHuot();
    await chargerExpeditionsRecentes();

    // Déclencher notification email
    await triggerEmailNotification(`Pièce ${piece.no_piece} expédiée vers Huot`);

  } catch (e) {
    showToast('Erreur d\'expédition', 'error');
    messageEl.innerHTML = '';
  }
}

async function chargerExpeditionsRecentes() {
  const listEl = document.getElementById('huot-expeditions');
  try {
    const expeditions = await sbSelect('expeditions_huot', '*&supprime=eq.false&order=expedie_le.desc&limit=20');

    if (!expeditions.length) {
      listEl.innerHTML = '<p class="loading">Aucune expédition récente</p>';
      return;
    }

    listEl.innerHTML = expeditions.map(e => `
      <div class="history-item">
        <div class="history-header">
          <span class="piece-no">${e.no_piece}</span>
          <span class="timestamp">${new Date(e.expedie_le).toLocaleString('fr-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })}</span>
        </div>
        <div class="action">Expédié par ${e.expedie_par || '—'}</div>
      </div>
    `).join('');

  } catch (e) {
    listEl.innerHTML = '<p class="text-error">Erreur de chargement</p>';
  }
}

// ===== APEX SCANNER FUNCTIONS =====

let apexActivePosition = null;
let apexScanning = false;
let apexRafId = null;
let apexCurrentStream = null;
const apexCanvas = document.createElement('canvas');
const apexCtx = apexCanvas.getContext('2d', { willReadFrequently: true });
const apexDataStore = {};

// Select position in APEX interface
function selectPositionAPEX(pos) {
  // Remove active from all
  document.querySelectorAll('.apex-position-box').forEach(box => {
    box.classList.remove('active');
  });

  // Set active
  apexActivePosition = pos;
  const box = document.querySelector(`[data-pos="${pos}"]`);
  if (box) {
    box.classList.add('active');
  }

  // Update UI
  document.getElementById('apex-active-tag').textContent = pos;
  document.getElementById('apex-active-tag').style.display = '';
  document.getElementById('apex-hint-text').style.display = 'none';
  document.getElementById('apex-scan-section').style.display = '';

  // Show current value if exists
  const cur = apexDataStore[pos];
  const statusEl = document.getElementById('apex-scan-status');
  if (cur) {
    statusEl.textContent = '▪ Valeur actuelle : ' + cur;
    statusEl.className = 'apex-status ok';
    statusEl.style.display = '';
  } else {
    statusEl.style.display = 'none';
  }

  // Reset camera and manual
  stopAPEXScan();
  document.getElementById('apex-manual-row').style.display = 'none';
  document.getElementById('apex-manual-input').value = '';

  // Haptic feedback
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
}

// Start APEX camera scanning
async function startAPEXScan() {
  if (!apexActivePosition || apexScanning) return;

  const camArea = document.getElementById('apex-cam-area');
  const video = document.getElementById('apex-video');
  const statusEl = document.getElementById('apex-scan-status');
  const btn = document.getElementById('apex-scan-btn');

  camArea.style.display = '';
  statusEl.textContent = 'Démarrage caméra…';
  statusEl.className = 'apex-status';
  statusEl.style.display = '';

  try {
    apexCurrentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = apexCurrentStream;
    await video.play();
    apexScanning = true;
    btn.textContent = '■ Arrêter';
    btn.onclick = stopAPEXScan;
    statusEl.textContent = 'Pointez le QR code vers la caméra…';
    apexTick(video);
  } catch(e) {
    statusEl.textContent = '⚠️ HTTPS requis pour caméra. Utilisez la saisie manuelle.';
    statusEl.className = 'apex-status err';
    camArea.style.display = 'none';
  }
}

// Stop APEX scanning
function stopAPEXScan() {
  apexScanning = false;
  if (apexRafId) {
    cancelAnimationFrame(apexRafId);
    apexRafId = null;
  }
  if (apexCurrentStream) {
    apexCurrentStream.getTracks().forEach(t => t.stop());
    apexCurrentStream = null;
  }
  const video = document.getElementById('apex-video');
  if (video) video.srcObject = null;
  document.getElementById('apex-cam-area').style.display = 'none';
  const btn = document.getElementById('apex-scan-btn');
  btn.textContent = '▶ Scanner';
  btn.onclick = startAPEXScan;
}

// APEX scanning loop
function apexTick(video) {
  if (!apexScanning) return;
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    const scale = Math.min(1, 640 / (video.videoWidth || 640));
    const w = Math.round((video.videoWidth || 640) * scale);
    const h = Math.round((video.videoHeight || 480) * scale);
    if (apexCanvas.width !== w) apexCanvas.width = w;
    if (apexCanvas.height !== h) apexCanvas.height = h;
    apexCtx.drawImage(video, 0, 0, w, h);
    const result = jsQR(apexCtx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
    if (result?.data) {
      document.getElementById('apex-found-flash').style.opacity = '1';
      setTimeout(() => { document.getElementById('apex-found-flash').style.opacity = '0'; }, 250);
      stopAPEXScan();
      saveAPEXValue(result.data);
      return;
    }
  }
  apexRafId = requestAnimationFrame(() => apexTick(video));
}

// Toggle manual input
function toggleAPEXManual() {
  const row = document.getElementById('apex-manual-row');
  const isShowing = row.style.display !== 'none';

  row.style.display = isShowing ? 'none' : '';

  if (!isShowing) {
    // Showing the input
    setTimeout(() => {
      const input = document.getElementById('apex-manual-input');
      input.focus();
      input.select(); // Select any existing text
    }, 100);
  }
}

// Save manual input
function saveAPEXManual() {
  const input = document.getElementById('apex-manual-input');
  const v = input.value.trim();

  // Validation
  if (!v) {
    input.style.borderColor = '#ef4444';
    input.placeholder = '⚠️ Veuillez entrer un numéro!';
    setTimeout(() => {
      input.style.borderColor = '';
      input.placeholder = 'Entrez le numéro...';
    }, 2000);
    return;
  }

  if (!apexActivePosition) {
    showToast('❌ Aucune position sélectionnée', 'error');
    return;
  }

  // Visual feedback - input becomes green
  input.style.borderColor = '#2e9e56';
  input.style.background = '#edfaf3';

  // Save
  saveAPEXValue(v);

  // Reset after a short delay
  setTimeout(() => {
    input.value = '';
    input.style.borderColor = '';
    input.style.background = '';
    document.getElementById('apex-manual-row').style.display = 'none';
  }, 500);
}

// Save value to database and update UI
async function saveAPEXValue(value) {
  if (!apexActivePosition) return;

  const statusEl = document.getElementById('apex-scan-status');
  statusEl.textContent = 'Enregistrement…';
  statusEl.className = 'apex-status';
  statusEl.style.display = '';

  // Find position in allPositions
  const position = allPositions.find(p => p.code_position === apexActivePosition);

  if (!position) {
    statusEl.textContent = '❌ Position introuvable';
    statusEl.className = 'apex-status err';
    return;
  }

  try {
    // Check if piece exists
    const results = await sbSelect('pieces', `*&no_piece=eq.${encodeURIComponent(value)}`);
    let piece = results[0];
    let typeEntretien = null;
    let raisonEntretien = null;
    let ancienStatut = null;
    let isNewPiece = false;

    // === CAS 1: Pièce entièrement nouvelle ===
    if (!piece) {
      if (!confirm(`🆕 NOUVELLE PIÈCE: ${value}\n\nConfirmez-vous la mise en production de cette nouvelle pièce ?`)) {
        statusEl.textContent = '❌ Opération annulée';
        statusEl.className = 'apex-status err';
        return;
      }
      // Créer directement avec statut "DC74"
      piece = await sbInsert('pieces', {
        no_piece: value,
        statut: 'DC74',
        position_id: position.id
      });
      await enregistrerAudit({
        typeEntite: 'pieces',
        entiteId: piece.id,
        action: 'creation_nouvelle_piece',
        apres: piece
      });
      await enregistrerHistorique({
        piece,
        ancienStatut: null,
        nouveauStatut: 'DC74',
        typeAction: 'installation_nouvelle',
        position: position,
        notes: 'Nouvelle pièce créée et installée'
      });

      isNewPiece = true;
      ancienStatut = null;
    }
    // === CAS 2: Pièce "Inventaire - Prêt" ===
    else if (piece.statut === 'Inventaire - Prêt') {
      // Installation directe, aucune confirmation nécessaire
      ancienStatut = piece.statut;
    }
    // === CAS 3: Pièce "Remisée - Rebutée" ===
    else if (piece.statut === 'Remisée - Rebutée') {
      statusEl.textContent = '🚫 Pièce rebutée - Installation interdite';
      statusEl.className = 'apex-status err';
      showToast('🚫 Cette pièce est rebutée.\n\nInformer le superviseur ou le groupe technique.', 'error');
      return;
    }
    // === CAS 4: Pièce "DC74" (déjà installée ailleurs) ===
    else if (piece.statut === 'DC74') {
      if (!confirm(`⚠️ ATTENTION\n\nLa pièce ${piece.no_piece} est déjà en production ailleurs.\n\nConfirmez-vous le déplacement vers cette position ?`)) {
        statusEl.textContent = '❌ Opération annulée';
        statusEl.className = 'apex-status err';
        return;
      }
      ancienStatut = piece.statut;
    }
    // === CAS 5: Autres statuts (Chez Huot, À entretenir) ===
    else {
      // Liste des types de maintenance
      const typesMaintenanceList = [
        "Entretien général (sablage, test d'huile, test d'eau)",
        "Huile - changement de gasket",
        "Huile - débouchage des trous",
        "Eau - changement de gasket",
        "Eau - débouchage des trous",
        "Eau - nettoyage du filtre de coin",
        "Autre (préciser)"
      ];

      // Demander quel type de maintenance a été effectué
      let choixTexte = `🔧 MAINTENANCE REQUISE\n\nLa pièce ${piece.no_piece} est au statut: "${piece.statut}"\n\nQuel type de maintenance a été effectué ?\n\n`;
      typesMaintenanceList.forEach((type, index) => {
        choixTexte += `${index + 1}. ${type}\n`;
      });
      choixTexte += '\nEntrez le numéro (ou Annuler):';

      const reponse = prompt(choixTexte);
      if (!reponse) {
        statusEl.textContent = '❌ Opération annulée';
        statusEl.className = 'apex-status err';
        return;
      }

      const index = parseInt(reponse, 10) - 1;
      if (isNaN(index) || index < 0 || index >= typesMaintenanceList.length) {
        statusEl.textContent = '❌ Choix invalide';
        statusEl.className = 'apex-status err';
        return;
      }

      typeEntretien = typesMaintenanceList[index];

      // Si "Autre", demander précision
      if (typeEntretien.startsWith('Autre')) {
        raisonEntretien = prompt('Précisez le type de maintenance:');
        if (!raisonEntretien) {
          statusEl.textContent = '❌ Opération annulée';
          statusEl.className = 'apex-status err';
          return;
        }
      }

      ancienStatut = piece.statut;
    }

    // Si c'est une nouvelle pièce, on a déjà tout fait, on skip l'installation
    if (isNewPiece) {
      // Just update display and return
      apexDataStore[apexActivePosition] = value;
      const valEl = document.getElementById('apex-val-' + apexActivePosition);
      if (valEl) valEl.textContent = value.slice(0, 6);
      const box = document.querySelector(`[data-pos="${apexActivePosition}"]`);
      if (box) {
        box.classList.remove('active');
        box.classList.add('fresh');
      }
      statusEl.textContent = '✓ Nouvelle pièce créée et installée';
      statusEl.className = 'apex-status ok';
      showToast(`✓ Nouvelle pièce ${value} créée et installée sur ${apexActivePosition}`, 'success');
      await chargerHistoriqueRecent();
      await updateAPEXPositions();
      setTimeout(() => {
        document.getElementById('apex-scan-section').style.display = 'none';
        document.getElementById('apex-active-tag').style.display = 'none';
        document.getElementById('apex-hint-text').style.display = '';
        apexActivePosition = null;
        document.querySelectorAll('.apex-position-box').forEach(box => {
          box.classList.remove('active');
        });
      }, 2000);
      return;
    }

    // Remove old piece if exists
    const occupants = await sbSelect('pieces', `*&position_id=eq.${position.id}`);
    const ancienneInstallee = occupants.find(p => p.id !== piece.id);

    if (ancienneInstallee) {
      await sbUpdate('pieces', ancienneInstallee.id, {
        statut: 'Inventaire - À entretenir',
        position_id: null
      });
      await enregistrerHistorique({
        piece: ancienneInstallee,
        ancienStatut: 'DC74',
        nouveauStatut: 'Inventaire - À entretenir',
        typeAction: 'remplacement',
        position: position,
        notes: `Remplacée par ${piece.no_piece}`
      });
    }

    // Install new piece
    await sbUpdate('pieces', piece.id, {
      statut: 'DC74',
      position_id: position.id
    });

    await enregistrerHistorique({
      piece,
      ancienStatut,
      nouveauStatut: 'DC74',
      typeAction: ancienneInstallee ? 'remplacement' : 'installation',
      position: position,
      notes: null
    });

    await enregistrerAudit({
      typeEntite: 'pieces',
      entiteId: piece.id,
      action: 'installation',
      avant: { statut: ancienStatut },
      apres: { statut: 'DC74', position_id: position.id }
    });

    // Si une maintenance a été effectuée, l'enregistrer
    if (typeEntretien) {
      await sbInsert('entretiens', {
        piece_id: piece.id,
        position_id: position.id,
        type_entretien: typeEntretien,
        precision_autre: typeEntretien.startsWith('Autre') ? raisonEntretien : null,
        raison: raisonEntretien || `Maintenance avant installation - Ancienne statut: ${ancienStatut}`,
        effectue_par: nomOperateur()
      });
    }

    // Save to local store
    apexDataStore[apexActivePosition] = value;

    // Update display
    const valEl = document.getElementById('apex-val-' + apexActivePosition);
    if (valEl) valEl.textContent = value.slice(0, 6);

    // Flash green
    const box = document.querySelector(`[data-pos="${apexActivePosition}"]`);
    if (box) {
      box.classList.remove('active');
      box.classList.add('fresh');
    }

    statusEl.textContent = '✓ Enregistré : ' + value;
    statusEl.className = 'apex-status ok';

    // Show toast
    showToast(`✓ Pièce ${value} installée sur ${apexActivePosition}`, 'success');

    // Refresh data
    await chargerHistoriqueRecent();
    await updateAPEXPositions();

    // Déclencher notification email
    await triggerEmailNotification(`Pièce ${value} installée sur ${apexActivePosition}`);

    // Auto-hide after 2 seconds
    setTimeout(() => {
      document.getElementById('apex-scan-section').style.display = 'none';
      document.getElementById('apex-active-tag').style.display = 'none';
      document.getElementById('apex-hint-text').style.display = '';
      apexActivePosition = null;

      // Clear all active states
      document.querySelectorAll('.apex-position-box').forEach(box => {
        box.classList.remove('active');
      });
    }, 2000);

  } catch (e) {
    console.error('Erreur APEX save:', e);
    statusEl.textContent = '❌ Erreur d\'enregistrement';
    statusEl.className = 'apex-status err';

    // Show detailed error toast
    let errorMsg = '❌ Erreur: ';
    if (e.message.includes('Failed to fetch')) {
      errorMsg += 'Impossible de se connecter à Supabase. Vérifiez votre connexion.';
    } else if (e.message.includes('position')) {
      errorMsg += 'Position introuvable dans la base de données.';
    } else {
      errorMsg += e.message || 'Erreur inconnue';
    }
    showToast(errorMsg, 'error');
  }
}

// Update APEX positions with current data
async function updateAPEXPositions() {
  if (!allPositions.length) return;

  console.log('[UPDATE APEX] Début de la mise à jour des positions APEX');

  // Get DC74 table
  const dc74Table = allTables.find(t => t.nom === 'DC74');
  if (!dc74Table) return;

  // Get all pieces for DC74 positions
  const dc74Positions = allPositions.filter(p => p.table_id === dc74Table.id);
  const positionIds = dc74Positions.map(p => p.id);

  if (positionIds.length === 0) return;

  try {
    // Requête avec filtre statut pour n'obtenir que les pièces "DC74"
    const pieces = await sbSelect('pieces', `*&position_id=in.(${positionIds.join(',')})&statut=eq.DC74`);

    console.log(`[UPDATE APEX] Trouvé ${pieces.length} pièce(s) en production`);

    const piecesByPosition = {};
    pieces.forEach(p => {
      piecesByPosition[p.position_id] = p;
      console.log(`[UPDATE APEX] ${p.no_piece} à position_id ${p.position_id}`);
    });

    // Update each APEX position box
    dc74Positions.forEach(pos => {
      const piece = piecesByPosition[pos.id];
      const valEl = document.getElementById(`apex-val-${pos.code_position}`);
      const box = document.querySelector(`[data-pos="${pos.code_position}"]`);

      if (valEl) {
        if (piece) {
          // Position occupée
          valEl.textContent = piece.no_piece.slice(0, 6);
          apexDataStore[pos.code_position] = piece.no_piece;
          console.log(`[UPDATE APEX] ${pos.code_position} = ${piece.no_piece}`);

          if (box) {
            box.classList.add('fresh');
            box.classList.remove('empty');
          }
        } else {
          // Position vide - IMPORTANT: effacer l'affichage
          valEl.textContent = '';
          delete apexDataStore[pos.code_position];
          console.log(`[UPDATE APEX] ${pos.code_position} = VIDE`);

          if (box) {
            box.classList.remove('fresh');
            box.classList.add('empty');
          }
        }
      }
    });

    console.log('[UPDATE APEX] Mise à jour terminée');
  } catch (e) {
    console.error('Erreur lors de la mise à jour APEX:', e);
  }
}

// History Tab
let allHistoryData = [];
let historyPositionToTable = {}; // Map position_id to table name

async function chargerHistoryTab() {
  try {
    // Load positions and tables to map position_id to table name
    const positions = await sbSelect('positions', '*');
    const tables = await sbSelect('tables_travail', '*');

    // Create mapping: table_id -> table_name
    const tableMap = {};
    tables.forEach(t => tableMap[t.id] = t.nom);

    // Create mapping: position_id -> table_name
    historyPositionToTable = {};
    positions.forEach(p => {
      if (p.table_id && tableMap[p.table_id]) {
        historyPositionToTable[p.id] = tableMap[p.table_id];
      }
    });

    // Load history data
    allHistoryData = await sbSelect('historique', '*&order=debut_statut.desc&limit=200');

    // Populate status filter
    const statusFilter = document.getElementById('history-filter-status');
    if (statusFilter.options.length === 1) { // Only has default option
      statusFilter.innerHTML += STATUTS.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    // Add event listeners
    document.getElementById('history-filter-piece').addEventListener('input', afficherHistory);
    document.getElementById('history-filter-status').addEventListener('change', afficherHistory);

    afficherHistory();
  } catch (e) {
    console.error('Erreur chargement history:', e);
    document.getElementById('history-table-body').innerHTML =
      '<tr><td colspan="6" style="padding:1rem;text-align:center;color:#c33;">Erreur de chargement</td></tr>';
  }
}

function afficherHistory() {
  const filterPiece = document.getElementById('history-filter-piece').value.trim().toLowerCase();
  const filterStatus = document.getElementById('history-filter-status').value;

  const filtered = allHistoryData.filter(h => {
    if (filterPiece && !h.no_piece.toLowerCase().includes(filterPiece)) return false;
    if (filterStatus && h.nouveau_statut !== filterStatus) return false;
    return true;
  });

  const tbody = document.getElementById('history-table-body');

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:1rem;text-align:center;color:#888;">Aucun résultat</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(h => {
    // Only show position if status is DC74 or DC75
    const showPosition = (h.nouveau_statut === 'DC74' || h.nouveau_statut === 'DC75');
    const positionText = showPosition && h.code_position ? h.code_position : '—';

    // Only show table name if status is DC74 or DC75
    const tableName = (h.nouveau_statut === 'DC74' || h.nouveau_statut === 'DC75') && h.position_id && historyPositionToTable[h.position_id]
      ? historyPositionToTable[h.position_id]
      : '—';

    const startDate = h.debut_statut ? new Date(h.debut_statut).toLocaleString('fr-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(',', '') : '—';

    const endDate = h.fin_statut ? new Date(h.fin_statut).toLocaleString('fr-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(',', '') : '<span style="color:#999;font-style:italic;">En cours</span>';

    // Badge styling
    let badgeClass = '';
    if (h.nouveau_statut === 'DC74' || h.nouveau_statut === 'DC75') badgeClass = 'production';
    else if (h.nouveau_statut === 'Inventaire - Prêt') badgeClass = 'pret';
    else if (h.nouveau_statut === 'Inventaire - À entretenir') badgeClass = 'entretien';
    else if (h.nouveau_statut === 'Chez Huot') badgeClass = 'huot';
    else if (h.nouveau_statut === 'Remisée - Rebutée') badgeClass = 'rebutee';

    return `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:0.5rem;"><strong>${h.no_piece || '—'}</strong></td>
        <td style="padding:0.5rem;"><strong>${tableName}</strong></td>
        <td style="padding:0.5rem;">${positionText}</td>
        <td style="padding:0.5rem;"><span class="badge ${badgeClass}" style="font-size:0.75rem;">${h.nouveau_statut || '—'}</span></td>
        <td style="padding:0.5rem;font-size:0.8rem;white-space:nowrap;">${startDate}</td>
        <td style="padding:0.5rem;font-size:0.8rem;white-space:nowrap;">${endDate}</td>
      </tr>
    `;
  }).join('');
}

// Config Tab
async function chargerConfigTab() {
  // Load operator name
  const operatorName = localStorage.getItem('lat_operateur') || '';
  document.getElementById('config-operator-name').value = operatorName;

  // Load statistics
  try {
    const pieces = await sbSelect('pieces', '*');
    const productionCount = pieces.filter(p => p.statut === 'DC74' || p.statut === 'DC75').length;
    const entretienCount = pieces.filter(p => p.statut === 'Inventaire - À entretenir').length;

    document.getElementById('config-stat-total').textContent = pieces.length;
    document.getElementById('config-stat-production').textContent = productionCount;
    document.getElementById('config-stat-entretien').textContent = entretienCount;
  } catch (e) {
    console.error('Erreur chargement stats:', e);
  }
}

function saveOperatorName() {
  const name = document.getElementById('config-operator-name').value.trim();
  if (name) {
    localStorage.setItem('lat_operateur', name);
    showToast('✓ Nom sauvegardé', 'success');
  } else {
    showToast('⚠ Veuillez entrer un nom', 'warning');
  }
}

function showStatutDetails(statut) {
  // Switch to Pieces tab and filter by status
  switchTab('pieces');

  // Wait for tab to load, then filter
  setTimeout(() => {
    // Clear the search filter
    const filterInput = document.getElementById('pieces-filter');
    if (filterInput) {
      filterInput.value = '';
    }

    // Reload pieces and scroll to the relevant section
    chargerPiecesParStatut().then(() => {
      // Wait a bit more for rendering
      setTimeout(() => {
        // Scroll to the section - include some offset to show the title
        let sectionClass = '';
        if (statut === 'DC74' || statut === 'DC75') sectionClass = 'production';
        else if (statut === 'Inventaire - Prêt') sectionClass = 'pret';
        else if (statut === 'Inventaire - À entretenir') sectionClass = 'entretien';
        else if (statut === 'Chez Huot') sectionClass = 'huot';
        else if (statut === 'Remisée - Rebutée') sectionClass = 'rebutee';

        if (sectionClass) {
          const sectionHeader = document.querySelector(`.section-header.${sectionClass}`);
          if (sectionHeader) {
            console.log(`[SCROLL] Scrolling to ${statut} section`);

            // Get the position of the element
            const rect = sectionHeader.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

            // Calculate position with offset to show title at top with some space
            const targetPosition = rect.top + scrollTop - 80; // 80px offset from top

            // Scroll to position
            window.scrollTo({
              top: targetPosition,
              behavior: 'smooth'
            });

            // Highlight the section briefly (faster animation)
            sectionHeader.style.transition = 'background-color 0.25s';
            const originalBg = sectionHeader.style.backgroundColor;
            sectionHeader.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            setTimeout(() => {
              sectionHeader.style.backgroundColor = originalBg;
            }, 600);
          } else {
            console.log(`[SCROLL] Section header not found for ${sectionClass}`);
          }
        }
      }, 200);
    });
  }, 100);
}

function clearCache() {
  if (confirm('Voulez-vous vraiment vider le cache et recharger l\'application ?')) {
    localStorage.clear();
    window.location.reload(true);
  }
}

async function fixDataInconsistencies() {
  if (!confirm('Cette opération va corriger les incohérences dans les données:\n\n' +
    '1. Pièces "DC74" ou "DC75" sans position → "Inventaire - À entretenir"\n' +
    '2. Pièces avec position mais pas "DC74" ou "DC75" → Retirer la position\n' +
    '3. Positions avec plusieurs pièces → Garder la plus récente seulement\n\n' +
    'Continuer ?')) {
    return;
  }

  showToast('🔧 Réparation en cours...', 'info');

  try {
    let fixedCount = 0;

    // Get all pieces and positions
    const allPieces = await sbSelect('pieces', '*');
    const allPositions = await sbSelect('positions', '*');

    // Problem 3: Check for duplicate pieces at same position
    const positionMap = new Map();
    for (const piece of allPieces) {
      if (piece.position_id) {
        if (!positionMap.has(piece.position_id)) {
          positionMap.set(piece.position_id, []);
        }
        positionMap.get(piece.position_id).push(piece);
      }
    }

    // Fix positions with multiple pieces
    for (const [positionId, pieces] of positionMap.entries()) {
      if (pieces.length > 1) {
        console.log(`FIXING: Position ${positionId} has ${pieces.length} pieces!`);

        // Sort by updated_at or created_at to keep the most recent
        pieces.sort((a, b) => {
          const dateA = new Date(a.updated_at || a.created_at);
          const dateB = new Date(b.updated_at || b.created_at);
          return dateB - dateA; // Most recent first
        });

        // Keep the first (most recent), remove others
        const toKeep = pieces[0];
        const toRemove = pieces.slice(1);

        console.log(`Keeping ${toKeep.no_piece}, removing ${toRemove.length} others`);

        for (const piece of toRemove) {
          await sbUpdate('pieces', piece.id, {
            statut: 'Inventaire - À entretenir',
            position_id: null
          });

          await enregistrerHistorique({
            piece,
            ancienStatut: piece.statut,
            nouveauStatut: 'Inventaire - À entretenir',
            typeAction: 'modification_statut',
            position: null,
            notes: `Correction: Position occupée par ${toKeep.no_piece}`
          });

          fixedCount++;
        }
      }
    }

    // Problem 1: "DC74" or "DC75" but no position_id
    for (const piece of allPieces) {
      if ((piece.statut === 'DC74' || piece.statut === 'DC75') && !piece.position_id) {
        await sbUpdate('pieces', piece.id, { statut: 'Inventaire - À entretenir' });

        await enregistrerHistorique({
          piece,
          ancienStatut: piece.statut,
          nouveauStatut: 'Inventaire - À entretenir',
          typeAction: 'modification_statut',
          position: null,
          notes: `Correction: ${piece.statut} sans position`
        });

        fixedCount++;
        console.log(`Fixed ${piece.no_piece}: ${piece.statut} without position`);
      }
    }

    // Problem 2: Has position_id but not "DC74" or "DC75"
    for (const piece of allPieces) {
      if (piece.position_id && piece.statut !== 'DC74' && piece.statut !== 'DC75') {
        await sbUpdate('pieces', piece.id, { position_id: null });

        await enregistrerHistorique({
          piece,
          ancienStatut: piece.statut,
          nouveauStatut: piece.statut,
          typeAction: 'modification_statut',
          position: null,
          notes: `Correction: Position retirée (statut: ${piece.statut})`
        });

        fixedCount++;
        console.log(`Fixed ${piece.no_piece}: Has position but status is ${piece.statut}`);
      }
    }

    if (fixedCount > 0) {
      showToast(`✓ ${fixedCount} pièce(s) corrigée(s)`, 'success');

      // Refresh all data
      await chargerStatsDashboard();
      await chargerPiecesParStatut();
      await chargerHistoryTab();
      await updatePositionSlots();
    } else {
      showToast('✓ Aucune incohérence détectée', 'success');
    }

  } catch (e) {
    console.error('Erreur lors de la réparation:', e);
    showToast('❌ Erreur lors de la réparation', 'error');
  }
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await init();
    // Update APEX positions after init
    setTimeout(updateAPEXPositions, 500);
  });
} else {
  init().then(() => {
    setTimeout(updateAPEXPositions, 500);
  });
}
