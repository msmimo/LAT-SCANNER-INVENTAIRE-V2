// ============================================================================
// Edge Function : send-report
// ----------------------------------------------------------------------------
// Envoie par courriel (via Resend) l'historique complet des moules et sièges.
// Chaque changement d'une pièce (installation, réparation, remise, etc.) est
// une ligne distincte de la table `historique`, avec date de début et de fin.
// Ex.: un moule installé -> réparé -> réinstallé = 3 lignes.
//
// Déclenchement : « à chaque changement, avec temporisation » (debounce).
//   - L'app web insère une ligne dans `pending_notification` à chaque action.
//   - Un job pg_cron appelle cette fonction toutes les 5 min.
//   - On n'envoie que s'il existe des notifications non envoyées ET que la plus
//     ancienne date d'au moins DEBOUNCE_MINUTES (regroupe les modifs rapides).
//
// Déploiement :
//   supabase functions deploy send-report --no-verify-jwt
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxx
// Puis planifier le cron (voir supabase/schedule-send-report.sql).
// ============================================================================

// ⬇⬇⬇  À MODIFIER PAR L'UTILISATEUR  ⬇⬇⬇ ------------------------------------
// Destinataire(s) du rapport. Séparez plusieurs adresses par une virgule.
const TO: string[] = ["destinataire@rtacoulee.com"];
// Adresse d'expédition. Doit appartenir à un domaine vérifié dans Resend.
const FROM = "Inventaire LAT <rapport@rtacoulee.com>";
// Objet du courriel.
const SUBJECT = "Rapport d'inventaire — Moules & Sièges";
// ⬆⬆⬆  FIN DE LA ZONE À MODIFIER  ⬆⬆⬆ ---------------------------------------

// Temporisation (minutes) : on attend que la plus ancienne notif non envoyée
// ait au moins cet âge avant d'envoyer, pour regrouper plusieurs actions.
const DEBOUNCE_MINUTES = 5;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// La clé service_role est injectée automatiquement dans les Edge Functions.
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

// --- Helpers Supabase REST -------------------------------------------------
async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

// Formate une date ISO en heure locale de Toronto (ou « — » si absente).
function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("sv-SE", {
      timeZone: "America/Toronto",
    });
  } catch {
    return iso;
  }
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface HistRow {
  type_piece: string;
  no_piece: string;
  table_nom: string | null;
  position_number: number | null;
  nouveau_statut: string;
  debut_statut: string;
  fin_statut: string | null;
}

// Construit le corps HTML du rapport à partir des lignes d'historique.
function buildHtml(rows: HistRow[]): string {
  const enCours = rows.filter((r) => !r.fin_statut).length;
  const trs = rows
    .map((r) => {
      const enCoursBadge = r.fin_statut
        ? esc(fmt(r.fin_statut))
        : '<span style="color:#0a7d29;font-weight:600">en cours</span>';
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(
          r.type_piece === "moule" ? "Moule" : "Siège",
        )}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600">${esc(
          r.no_piece,
        )}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(
          r.table_nom,
        )}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${esc(
          r.position_number ?? "—",
        )}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(
          r.nouveau_statut,
        )}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap">${esc(
          fmt(r.debut_statut),
        )}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap">${enCoursBadge}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#222;margin:0;padding:20px">
    <h2 style="margin:0 0 4px">Rapport d'inventaire — Moules &amp; Sièges</h2>
    <p style="color:#666;margin:0 0 16px">
      Généré le ${esc(fmt(new Date().toISOString()))} (heure de Toronto) —
      ${rows.length} ligne(s) d'historique, dont ${enCours} statut(s) en cours.
    </p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead>
        <tr style="background:#f4f4f4;text-align:left">
          <th style="padding:8px 10px;border-bottom:2px solid #ddd">Type</th>
          <th style="padding:8px 10px;border-bottom:2px solid #ddd">No pièce</th>
          <th style="padding:8px 10px;border-bottom:2px solid #ddd">Table</th>
          <th style="padding:8px 10px;border-bottom:2px solid #ddd;text-align:center">Position</th>
          <th style="padding:8px 10px;border-bottom:2px solid #ddd">Statut</th>
          <th style="padding:8px 10px;border-bottom:2px solid #ddd">Début</th>
          <th style="padding:8px 10px;border-bottom:2px solid #ddd">Fin</th>
        </tr>
      </thead>
      <tbody>${trs || '<tr><td colspan="7" style="padding:12px">Aucune donnée.</td></tr>'}</tbody>
    </table>
  </body></html>`;
}

// Échappe une valeur pour le format CSV (RFC 4180) : on entoure de guillemets
// et on double les guillemets internes.
function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

// Construit le contenu CSV du rapport (mêmes colonnes que le tableau HTML).
function buildCsv(rows: HistRow[]): string {
  const header = [
    "Type",
    "No piece",
    "Table",
    "Position",
    "Statut",
    "Debut",
    "Fin",
  ];
  const lines = rows.map((r) =>
    [
      r.type_piece === "moule" ? "Moule" : "Siège",
      r.no_piece,
      r.table_nom ?? "",
      r.position_number ?? "",
      r.nouveau_statut,
      fmt(r.debut_statut),
      r.fin_statut ? fmt(r.fin_statut) : "en cours",
    ]
      .map(csvCell)
      .join(",")
  );
  // BOM UTF-8 pour qu'Excel affiche correctement les accents.
  return "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");
}

// Encode une chaîne UTF-8 en base64 (pour la pièce jointe Resend).
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function sendEmail(html: string, csv: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: TO,
      subject: SUBJECT,
      html,
      attachments: [
        {
          filename: `rapport-inventaire-${stamp}.csv`,
          content: toBase64(csv),
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

Deno.serve(async () => {
  try {
    // 1. Notifications non envoyées (les plus anciennes d'abord).
    const pending: { id: string; triggered_at: string }[] = await sb(
      "pending_notification?sent=eq.false&select=id,triggered_at&order=triggered_at.asc",
    );

    if (!pending || pending.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: false, reason: "aucune notification en attente" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Temporisation : attendre que la plus ancienne notif ait vieilli.
    const oldest = new Date(pending[0].triggered_at).getTime();
    const ageMin = (Date.now() - oldest) / 60000;
    if (ageMin < DEBOUNCE_MINUTES) {
      return new Response(
        JSON.stringify({
          ok: true,
          sent: false,
          reason: `temporisation (plus ancienne notif: ${ageMin.toFixed(1)} min < ${DEBOUNCE_MINUTES} min)`,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Historique complet : une ligne par changement, ordonné par pièce.
    const rows: HistRow[] = await sb(
      "historique?select=type_piece,no_piece,table_nom,position_number,nouveau_statut,debut_statut,fin_statut&order=type_piece.asc,no_piece.asc,debut_statut.asc",
    );

    // 4. Envoi (corps HTML + pièce jointe CSV avec les mêmes données).
    await sendEmail(buildHtml(rows || []), buildCsv(rows || []));

    // 5. Marquer toutes les notifications en attente comme envoyées.
    const ids = pending.map((p) => p.id);
    await sb(`pending_notification?id=in.(${ids.join(",")})`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ sent: true, sent_snapshot: true, sent_history: true }),
    });

    return new Response(
      JSON.stringify({ ok: true, sent: true, notifications: ids.length, lignes: (rows || []).length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
