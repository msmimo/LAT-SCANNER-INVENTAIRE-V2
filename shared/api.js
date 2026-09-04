// Configuration et helpers partages — LAT SCANNER INVENTAIRE
// A remplir avec le projet Supabase dedie a cet outil (independant de APEX1/APEX2).
const SUPABASE_URL = 'https://oopxhatozrtputqvylsn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vcHhoYXRvenJ0cHV0cXZ5bHNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3OTE3OTksImV4cCI6MjEwMzM2Nzc5OX0.uf-9JRqgd6NkgoRHGBYA5y2H1_gPMXyQ1rzkbZBv3ps';

const STATUTS = [
  'Inventaire - Prêt',
  'DC74',
  'DC75',
  'Chez Huot',
  'Remisée - Rebutée',
  'Inventaire - À entretenir'
];

const TYPES_ENTRETIEN = [
  "Entretien général (sablage, test d'huile, test d'eau)",
  "Huile - changement de gasket",
  "Huile - débouchage des trous",
  "Eau - changement de gasket",
  "Eau - débouchage des trous",
  "Eau - nettoyage du filtre de coin",
  "Autre (préciser)"
];

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
