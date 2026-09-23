import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 
const RECIPIENTS = [
  "mengyun.liu@riotinto.com",

];

// Échappe une valeur pour le format CSV (RFC 4180) : entoure de guillemets
// et double les guillemets internes.
function csvCell(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

// Construit le CSV de l'historique complet (mêmes données que les tableaux
// HTML), avec une colonne « APEX » pour distinguer les deux tables.
function buildHistoryCsv(apex1: any[], apex2: any[]): string {
  const header = ["APEX", "Position", "No. pièce", "Date"];
  const line = (label: string) => (r: any) =>
    [label, r.position ?? "", r["no.pièce"] ?? "", r.date ?? ""]
      .map(csvCell)
      .join(",");
  const rows = [
    ...apex1.map(line("APEX 1")),
    ...apex2.map(line("APEX 2")),
  ];
  // BOM UTF-8 pour qu'Excel affiche correctement les accents.
  return "﻿" + [header.map(csvCell).join(","), ...rows].join("\r\n");
}

// Encode une chaîne UTF-8 en base64 (pour la pièce jointe Resend).
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

serve(async () => {
  const notifRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pending_notification?sent_history=eq.false&order=triggered_at.asc`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const notifications = await notifRes.json();
  if (!notifications.length) return new Response(JSON.stringify({ message: "No pending notifications" }), { headers: { "Content-Type": "application/json" } });
 
  const oldest = new Date(notifications[0].triggered_at);
  const diffMinutes = (new Date().getTime() - oldest.getTime()) / 60000;
  if (diffMinutes < 30) return new Response(JSON.stringify({ message: "Waiting for 30 min window" }), { headers: { "Content-Type": "application/json" } });
 
  const [res1, res2] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/APEX1?select=*&order=date.desc`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }),
    fetch(`${SUPABASE_URL}/rest/v1/APEX2?select=*&order=date.desc`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }),
  ]);
  const apex1 = await res1.json();
  const apex2 = await res2.json();
 
  const rows1 = apex1.map((r: any) =>
    `<tr>
      <td style="padding:8px;border:1px solid #ddd">${r.position || ""}</td>
      <td style="padding:8px;border:1px solid #ddd">${r["no.pièce"] || ""}</td>
      <td style="padding:8px;border:1px solid #ddd">${r.date || ""}</td>
    </tr>`
  ).join("") || '<tr><td colspan="3" style="padding:8px;text-align:center">Aucun enregistrement</td></tr>';
 
  const rows2 = apex2.map((r: any) =>
    `<tr>
      <td style="padding:8px;border:1px solid #ddd">${r.position || ""}</td>
      <td style="padding:8px;border:1px solid #ddd">${r["no.pièce"] || ""}</td>
      <td style="padding:8px;border:1px solid #ddd">${r.date || ""}</td>
    </tr>`
  ).join("") || '<tr><td colspan="3" style="padding:8px;text-align:center">Aucun enregistrement</td></tr>';
 
  const html = `
    <h1 style="color:#c87d10">📜 Historique complet</h1>
    <h2 style="color:#c87d10">APEX 1</h2>
    <table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:30px">
      <tr style="background:#f0f0f0">
        <th style="padding:8px;border:1px solid #ddd">Position</th>
        <th style="padding:8px;border:1px solid #ddd">No. pièce</th>
        <th style="padding:8px;border:1px solid #ddd">Date</th>
      </tr>
      ${rows1}
    </table>
    <h2 style="color:#c87d10">APEX 2</h2>
    <table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
      <tr style="background:#f0f0f0">
        <th style="padding:8px;border:1px solid #ddd">Position</th>
        <th style="padding:8px;border:1px solid #ddd">No. pièce</th>
        <th style="padding:8px;border:1px solid #ddd">Date</th>
      </tr>
      ${rows2}
    </table>`;
 
  const csv = buildHistoryCsv(apex1, apex2);
  const stamp = new Date().toISOString().slice(0, 10);

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "APEX Report <rapport@rtacoulee.com>",
      to: RECIPIENTS,
      subject: `Historique APEX — ${new Date().toLocaleDateString("fr-CA")}`,
      html,
      attachments: [
        { filename: `historique-apex-${stamp}.csv`, content: toBase64(csv) },
      ],
    }),
  });
 
  await fetch(`${SUPABASE_URL}/rest/v1/pending_notification?sent_history=eq.false`, {
    method: "PATCH",
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ sent_history: true }),
  });
 
  return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
});