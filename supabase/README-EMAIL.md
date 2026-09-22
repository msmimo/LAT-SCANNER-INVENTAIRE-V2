# Envoi des rapports courriel (Resend)

Pourquoi le courriel ne partait pas : l'app web V2 insère bien une ligne dans
`pending_notification` à chaque action (voir `shared/api.js` →
`triggerEmailNotification`), mais **aucune fonction ne consommait cette file**
dans le nouveau projet Supabase V2. Les anciennes Edge Functions pointaient vers
l'ancien projet V1 (tables `APEX1`/`APEX2`). Cette fonction `send-report` comble
le trou.

## Ce qui est envoyé
L'historique complet des moules et sièges — **une ligne par changement** :
`Type | No pièce | Table | Position | Statut | Début | Fin`.
Un moule installé → réparé → réinstallé apparaît donc sur 3 lignes, chacune avec
sa date de début et de fin (« en cours » si pas encore terminée).

## Quand
« À chaque changement, avec temporisation ». Un job pg_cron appelle la fonction
toutes les 5 min ; elle n'envoie que si la plus ancienne notification non
envoyée a ≥ 5 min (regroupe les modifs rapides en un seul courriel), puis marque
les notifications comme envoyées.

## Déploiement (une seule fois)

1. **Modifier les destinataires** en haut de
   `supabase/functions/send-report/index.ts` :
   ```ts
   const TO = ["votre.adresse@rtacoulee.com"];   // séparées par une virgule
   const FROM = "Inventaire LAT <rapport@rtacoulee.com>"; // domaine vérifié Resend
   ```

2. **Installer la CLI Supabase** puis se connecter au projet V2 :
   ```bash
   supabase login
   supabase link --project-ref oopxhatozrtputqvylsn
   ```

3. **Déclarer la clé Resend** (secret côté serveur, jamais dans le code) :
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
   ```

4. **Déployer** (sans vérification JWT pour que pg_cron puisse l'appeler) :
   ```bash
   supabase functions deploy send-report --no-verify-jwt
   ```

5. **Planifier le cron** : ouvrir le SQL Editor du projet et exécuter
   `supabase/schedule-send-report.sql`.

## Tester tout de suite
Insérez une notification puis forcez un appel :
```bash
# insère une notif de test dans la file (via l'app ou en SQL)
curl -X POST "https://oopxhatozrtputqvylsn.supabase.co/functions/v1/send-report"
```
Le premier appel peut répondre `sent:false` (temporisation) ; réessayez après
5 min, ou mettez `DEBOUNCE_MINUTES = 0` temporairement pour un test immédiat.

## Réglages
- `DEBOUNCE_MINUTES` (dans `index.ts`) : délai de regroupement. `0` = envoi
  immédiat à chaque appel du cron.
- Fréquence du cron : modifiable dans `schedule-send-report.sql` (`*/5 * * * *`).
