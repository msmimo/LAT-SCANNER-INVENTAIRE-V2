import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ⚠️ 修改这里的邮箱列表
const RECIPIENTS = [
  "mengyun.liu@riotinto.com",

];

serve(async () => {
  try {
    // 1. Vérifier s'il y a des notifications en attente
    const notifRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pending_notification?sent_snapshot=eq.false&order=triggered_at.asc`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const notifications = await notifRes.json();

    if (!notifications.length) {
      return new Response(
        JSON.stringify({ message: "Aucune notification en attente" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Vérifier si la fenêtre de 2 minutes est écoulée
    const oldest = new Date(notifications[0].triggered_at);
    const diffMinutes = (new Date().getTime() - oldest.getTime()) / 60000;

    if (diffMinutes < 2) {
      return new Response(
        JSON.stringify({
          message: "Attente de la fenêtre de 2 minutes",
          waiting: Math.round(2 - diffMinutes) + " minutes restantes"
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Récupérer toutes les pièces avec leurs informations
    const piecesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/pieces?select=*,position:positions(code_position,table:tables_travail(nom))&order=no_piece.asc`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      }
    );
    const pieces = await piecesRes.json();

    // 4. Pour chaque pièce, récupérer son historique le plus récent
    const piecesWithHistory = await Promise.all(
      pieces.map(async (piece: any) => {
        const histRes = await fetch(
          `${SUPABASE_URL}/rest/v1/historique?piece_id=eq.${piece.id}&order=debut_statut.desc&limit=1`,
          {
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
            }
          }
        );
        const history = await histRes.json();
        return {
          ...piece,
          history: history[0] || null
        };
      })
    );

    // 5. Construire le tableau HTML
    const tableRows = piecesWithHistory.map((p: any) => {
      const tableName = p.position?.table?.nom || "DC74";
      const positionCode = (p.statut === "Mise en production" && p.position?.code_position)
        ? p.position.code_position
        : "—";

      const dateDebut = p.history?.debut_statut
        ? new Date(p.history.debut_statut).toLocaleString('fr-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })
        : "—";

      const dateFin = p.history?.fin_statut
        ? new Date(p.history.fin_statut).toLocaleString('fr-CA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          })
        : "—";

      return `<tr>
        <td style="padding:8px;border:1px solid #ddd">${p.no_piece}</td>
        <td style="padding:8px;border:1px solid #ddd"><strong>${tableName}</strong></td>
        <td style="padding:8px;border:1px solid #ddd">${p.statut}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:center">${positionCode}</td>
        <td style="padding:8px;border:1px solid #ddd">${dateDebut}</td>
        <td style="padding:8px;border:1px solid #ddd">${dateFin}</td>
      </tr>`;
    }).join("");

    const html = `
      <div style="font-family:Arial,sans-serif">
        <h1 style="color:#1a2b45">📋 Rapport d'inventaire - Table DC74</h1>
        <p style="color:#666">Date: ${new Date().toLocaleString('fr-CA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })}</p>

        <table border="1" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin-top:20px">
          <thead>
            <tr style="background:#5a4fb0;color:white">
              <th style="padding:10px;border:1px solid #ddd">No. Pièce</th>
              <th style="padding:10px;border:1px solid #ddd">Table</th>
              <th style="padding:10px;border:1px solid #ddd">Statut</th>
              <th style="padding:10px;border:1px solid #ddd">Position</th>
              <th style="padding:10px;border:1px solid #ddd">Date début</th>
              <th style="padding:10px;border:1px solid #ddd">Date fin</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <p style="color:#999;margin-top:20px;font-size:12px">
          Ce rapport a été généré automatiquement par le système LAT Scanner.
        </p>
      </div>
    `;

    // 6. Envoyer l'email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "LAT pièce inventaire <rapport@rtacoulee.com>",
        to: RECIPIENTS,
        subject: `📊 Rapport d'inventaire LAT - DC74 - ${new Date().toLocaleDateString("fr-CA")}`,
        html
      })
    });

    const emailResult = await emailRes.json();

    if (!emailRes.ok) {
      throw new Error(`Erreur Resend: ${JSON.stringify(emailResult)}`);
    }

    // 7. Marquer toutes les notifications comme envoyées
    await fetch(
      `${SUPABASE_URL}/rest/v1/pending_notification?sent_snapshot=eq.false`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ sent_snapshot: true })
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        emailId: emailResult.id,
        piecesSent: pieces.length
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Erreur:", error);
    return new Response(
      JSON.stringify({
        error: error.message
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});
