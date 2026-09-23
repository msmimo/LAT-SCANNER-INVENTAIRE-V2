import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 
const RECIPIENTS = [
  "mengyun.liu@riotinto.com"
];
 
serve(async () => {
  const notifRes = await fetch(
    `${SUPABASE_URL}/rest/v1/pending_notification?sent_snapshot=eq.false&order=triggered_at.asc`,
    { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }
  );
  const notifications = await notifRes.json();
  if (!notifications.length) return new Response(JSON.stringify({ message: "No pending notifications" }), { headers: { "Content-Type": "application/json" } });
 
  const oldest = new Date(notifications[0].triggered_at);
  const diffMinutes = (new Date().getTime() - oldest.getTime()) / 60000;
  if (diffMinutes < 2) return new Response(JSON.stringify({ message: "Waiting for 30 min window" }), { headers: { "Content-Type": "application/json" } });
 
  const [res1, res2] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/APEX1?select=*&order=date.desc`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }),
    fetch(`${SUPABASE_URL}/rest/v1/APEX2?select=*&order=date.desc`, { headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` } }),
  ]);
  const apex1 = await res1.json();
  const apex2 = await res2.json();
 
  function buildSnapshot(data: any[]) {
    // data arrive trié par date décroissante -> la 1re occurrence = la plus récente
    const latestAtPos: Record<string, any> = {};   // dernière pièce scannée à chaque position
    const latestForPart: Record<string, any> = {}; // dernière position où chaque pièce a été scannée
    data.forEach((r: any) => {
      if (r.position && !latestAtPos[r.position]) latestAtPos[r.position] = r;
      if (r["no.pièce"] != null && !latestForPart[r["no.pièce"]]) latestForPart[r["no.pièce"]] = r;
    });
    return Object.keys(latestAtPos).sort().map(pos => {
      const r = latestAtPos[pos];
      const part = r["no.pièce"];
      // On n'affiche la pièce que si sa DERNIÈRE lecture est bien à CETTE position ;
      // sinon la pièce a été déplacée ailleurs -> la position est maintenant vide.
      const stillHere = part != null && latestForPart[part] && latestForPart[part].position === pos;
      return `<tr>
        <td style="padding:8px;border:1px solid #ddd"><strong>${pos}</strong></td>
        <td style="padding:8px;border:1px solid #ddd">${stillHere ? part : ""}</td>
        <td style="padding:8px;border:1px solid #ddd">${stillHere ? (r.date || "") : ""}</td>
      </tr>`;
    }).join("") || '<tr><td colspan="3" style="padding:8px;text-align:center">Aucun enregistrement</td></tr>';
  }

  const html = `
    <h1 style="color:#c87d10">📷 Instantané actuel</h1>
    <h2 style="color:#5a4fb0">APEX 1 — Positions actuelles</h2>
    <table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px">
      <tr style="background:#f0f0f0">
        <th style="padding:8px;border:1px solid #ddd">Position</th>
        <th style="padding:8px;border:1px solid #ddd">No. pièce</th>
        <th style="padding:8px;border:1px solid #ddd">Date</th>
      </tr>
      ${buildSnapshot(apex1)}
    </table>
    <h2 style="color:#5a4fb0">APEX 2 — Positions actuelles</h2>
    <table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
      <tr style="background:#f0f0f0">
        <th style="padding:8px;border:1px solid #ddd">Position</th>
        <th style="padding:8px;border:1px solid #ddd">No. pièce</th>
        <th style="padding:8px;border:1px solid #ddd">Date</th>
      </tr>
      ${buildSnapshot(apex2)}
    </table>`;
 
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "APEX Report <rapport@rtacoulee.com>",
      to: RECIPIENTS,
      subject: `Instantané APEX — ${new Date().toLocaleDateString("fr-CA")}`,
      html,
    }),
  });
 
  await fetch(`${SUPABASE_URL}/rest/v1/pending_notification?sent_snapshot=eq.false`, {
    method: "PATCH",
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ sent_snapshot: true }),
  });
 
  return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
});