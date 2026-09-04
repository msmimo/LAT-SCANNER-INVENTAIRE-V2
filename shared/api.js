// Configuration et helpers partages — LAT SCANNER INVENTAIRE V2
// New Architecture: 18 Tables (A-R), Each with 5 Positions, Moulds & Seats
const SUPABASE_URL = 'https://oopxhatozrtputqvylsn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vcHhoYXRvenJ0cHV0cXZ5bHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3OTE3OTksImV4cCI6MjEwMzM2Nzc5OX0.uf-9JRqgd6NkgoRHGBYA5y2H1_gPMXyQ1rzkbZBv3ps';

// New Status System (6 statuses)
const STATUTS = [
  'Mise en production',       // Installed on table
  'Chez Huot',               // At external maintenance facility
  'Inventaire - À entretenir', // In inventory, needs maintenance
  'Remisé',                  // Removed/Idle (not in maintenance, not on table)
  'Rebuté',                  // Scrapped (manually set)
  'Prêt'                     // Ready (auto: table has pieces + no maintenance needed)
];

// Maintenance Types
const TYPES_ENTRETIEN = [
  "Entretien général (sablage, test d'huile, test d'eau)",
  "Huile - changement de gasket",
  "Huile - débouchage des trous",
  "Eau - changement de gasket",
  "Eau - débouchage des trous",
  "Eau - nettoyage du filtre de coin",
  "Autre (préciser)"
];

// Condition Types
const CONDITIONS = [
  'new',      // Neuf
  'excellent', // Excellent
  'good',     // Bon
  'fair',     // Acceptable
  'poor',     // Mauvais
  'damaged'   // Endommagé
];

// 18 Tables (A-R)
const TABLE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];

function nomOperateur() {
  let nom = localStorage.getItem('lat_operateur');
  if (!nom) {
    nom = prompt('Nom de l\'opérateur :') || 'Inconnu';
    localStorage.setItem('lat_operateur', nom);
  }
  return nom;
}

function maintenant() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'America/Toronto' });
}

async function sbFetch(path, options = {}) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {})
    },
    cache: 'no-store'
  });
  if (!res.ok) {
    const texte = await res.text();
    throw new Error('Erreur Supabase (' + res.status + ') : ' + texte);
  }
  const texte = await res.text();
  return texte ? JSON.parse(texte) : null;
}

async function sbSelect(table, query = '*') {
  return sbFetch(table + '?select=' + query);
}

async function sbInsert(table, ligne) {
  const resultat = await sbFetch(table, { method: 'POST', body: JSON.stringify(ligne) });
  return resultat[0];
}

async function sbUpdate(table, id, changements) {
  return sbFetch(table + '?id=eq.' + id, { method: 'PATCH', body: JSON.stringify(changements) });
}

async function sbDelete(table, id) {
  return sbFetch(table + '?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' });
}

// Consigne une ligne d'historique et cloture la ligne precedente de la meme piece (fin_statut).
async function enregistrerHistorique({ piece, ancienStatut, nouveauStatut, typeAction, position, notes }) {
  const operateur = nomOperateur();
  const maintenant_ = maintenant();

  const dernieres = await sbSelect(
    'historique',
    `*&piece_id=eq.${piece.id}&fin_statut=is.null&order=debut_statut.desc&limit=1`
  );
  if (dernieres && dernieres.length) {
    await sbFetch('historique?id=eq.' + dernieres[0].id, {
      method: 'PATCH',
      body: JSON.stringify({ fin_statut: maintenant_ })
    });
  }

  return sbInsert('historique', {
    piece_id: piece.id,
    no_piece: piece.no_piece,
    ancien_statut: ancienStatut,
    nouveau_statut: nouveauStatut,
    type_action: typeAction,
    position_id: position ? position.id : null,
    code_position: position ? position.code_position : null,
    debut_statut: maintenant_,
    notes: notes || null
  });
}

async function enregistrerAudit({ typeEntite, entiteId, action, avant, apres, raison }) {
  return sbInsert('audit', {
    type_entite: typeEntite,
    entite_id: entiteId,
    action,
    effectue_par: nomOperateur(),
    avant: avant || null,
    apres: apres || null,
    raison: raison || null
  });
}

// Déclencher une notification email (insertion dans pending_notification)
async function triggerEmailNotification(notes = '') {
  try {
    await sbInsert('pending_notification', {
      notes: notes || 'Changement de statut détecté'
    });
  } catch (e) {
    console.error('Erreur déclenchement email:', e);
  }
}

// ============================================
// NEW V2 HELPER FUNCTIONS
// ============================================

// Get all tables with positions
async function getTables() {
  return sbSelect('tables', '*&order=ordre_affichage');
}

// Get positions for a specific table
async function getPositionsForTable(tableId) {
  return sbSelect('table_positions', `*&table_id=eq.${tableId}&order=position_number`);
}

// Get all moulds
async function getAllMoulds() {
  return sbSelect('moulds', '*&order=table_nom,no_moule');
}

// Get moulds for a specific table
async function getMouldsByTable(tableNom) {
  return sbSelect('moulds', `*&table_nom=eq.${tableNom}&order=no_moule`);
}

// Get moulds by status
async function getMouldsByStatut(statut) {
  return sbSelect('moulds', `*&statut=eq.${encodeURIComponent(statut)}&order=table_nom,no_moule`);
}

// Get all seats
async function getAllSeats() {
  return sbSelect('seats', '*&order=table_nom,no_seat');
}

// Get seats for a specific table
async function getSeatsByTable(tableNom) {
  return sbSelect('seats', `*&table_nom=eq.${tableNom}&order=no_seat`);
}

// Get seats by status
async function getSeatsByStatut(statut) {
  return sbSelect('seats', `*&statut=eq.${encodeURIComponent(statut)}&order=table_nom,no_seat`);
}

// Install a moule at a position
async function installerMoule(mouleId, positionId) {
  const position = await sbSelect('table_positions', `*&id=eq.${positionId}`);
  if (!position || !position.length) throw new Error('Position introuvable');

  const pos = position[0];
  const table = await sbSelect('tables', `*&id=eq.${pos.table_id}`);
  if (!table || !table.length) throw new Error('Table introuvable');

  // Check if position already has a moule
  const existing = await sbSelect('moulds', `*&position_id=eq.${positionId}`);
  if (existing && existing.length > 0) {
    throw new Error('Cette position a déjà un moule installé');
  }

  // Update moule
  await sbUpdate('moulds', mouleId, {
    statut: 'Mise en production',
    position_id: positionId
  });

  return { success: true, table: table[0], position: pos };
}

// Install a seat at a position
async function installerSeat(seatId, positionId) {
  const position = await sbSelect('table_positions', `*&id=eq.${positionId}`);
  if (!position || !position.length) throw new Error('Position introuvable');

  const pos = position[0];
  const table = await sbSelect('tables', `*&id=eq.${pos.table_id}`);
  if (!table || !table.length) throw new Error('Table introuvable');

  // Check if position already has a seat
  const existing = await sbSelect('seats', `*&position_id=eq.${positionId}`);
  if (existing && existing.length > 0) {
    throw new Error('Cette position a déjà un siège installé');
  }

  // Update seat
  await sbUpdate('seats', seatId, {
    statut: 'Mise en production',
    position_id: positionId
  });

  return { success: true, table: table[0], position: pos };
}

// Remove moule from position (change status to Remisé)
async function retirerMoule(mouleId) {
  await sbUpdate('moulds', mouleId, {
    statut: 'Remisé',
    position_id: null
  });
}

// Remove seat from position (change status to Remisé)
async function retirerSeat(seatId) {
  await sbUpdate('seats', seatId, {
    statut: 'Remisé',
    position_id: null
  });
}

// Change moule status (for Huot, maintenance, etc.)
async function changerStatutMoule(mouleId, nouveauStatut) {
  const updates = { statut: nouveauStatut };

  // If not "Mise en production", clear position
  if (nouveauStatut !== 'Mise en production') {
    updates.position_id = null;
  }

  await sbUpdate('moulds', mouleId, updates);
}

// Change seat status
async function changerStatutSeat(seatId, nouveauStatut) {
  const updates = { statut: nouveauStatut };

  // If not "Mise en production", clear position
  if (nouveauStatut !== 'Mise en production') {
    updates.position_id = null;
  }

  await sbUpdate('seats', seatId, updates);
}

// Get piece by number (searches in both moulds and seats)
async function getPieceByNumber(number) {
  const moulds = await sbSelect('moulds', `*&no_moule=eq.${encodeURIComponent(number)}`);
  if (moulds && moulds.length > 0) {
    return { type: 'moule', piece: moulds[0] };
  }

  const seats = await sbSelect('seats', `*&no_seat=eq.${encodeURIComponent(number)}`);
  if (seats && seats.length > 0) {
    return { type: 'seat', piece: seats[0] };
  }

  return null;
}

// Get position occupancy (what moule and seat are at this position)
async function getPositionOccupancy(positionId) {
  const moulds = await sbSelect('moulds', `*&position_id=eq.${positionId}`);
  const seats = await sbSelect('seats', `*&position_id=eq.${positionId}`);

  return {
    moule: moulds && moulds.length > 0 ? moulds[0] : null,
    seat: seats && seats.length > 0 ? seats[0] : null
  };
}

// Create new moule
async function creerMoule({ no_moule, table_nom, dimension_spec, condition, notes }) {
  return sbInsert('moulds', {
    no_moule,
    table_nom,
    dimension_spec: dimension_spec || '',
    statut: 'Remisé',
    condition: condition || 'good',
    notes: notes || null
  });
}

// Create new seat
async function creerSeat({ no_seat, table_nom, dimension_spec, condition, notes }) {
  return sbInsert('seats', {
    no_seat,
    table_nom,
    dimension_spec: dimension_spec || '',
    statut: 'Remisé',
    condition: condition || 'good',
    notes: notes || null
  });
}

// Create new table
async function creerTable({ nom, dimension_spec, description, ordre_affichage }) {
  const table = await sbInsert('tables', {
    nom,
    dimension_spec: dimension_spec || '',
    description: description || null,
    ordre_affichage: ordre_affichage || 99
  });

  // Create 5 positions for this table
  const tableId = table.id;
  for (let i = 1; i <= 5; i++) {
    await sbInsert('table_positions', {
      table_id: tableId,
      position_number: i
    });
  }

  return table;
}

// Update moule details
async function updateMoule(mouleId, updates) {
  return sbUpdate('moulds', mouleId, updates);
}

// Update seat details
async function updateSeat(seatId, updates) {
  return sbUpdate('seats', seatId, updates);
}

// Delete moule (with confirmation)
async function deleteMoule(mouleId) {
  return sbDelete('moulds', mouleId);
}

// Delete seat (with confirmation)
async function deleteSeat(seatId) {
  return sbDelete('seats', seatId);
}
