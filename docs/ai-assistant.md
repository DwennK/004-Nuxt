# Assistant IA interne

## Vue d’ensemble

- Route UI: `/assistant`
- Endpoint Nitro: `POST /api/assistant/chat`
- Orchestration serveur: `server/utils/assistant/`
- Accès DB: Turso + Drizzle existants via `server/utils/turso.ts`

Le flux est strictement serveur:

1. le client envoie les 32 derniers messages utiles (100 000 caractères au total) et des extraits bornés des recherches récentes
2. MiniMax peut répondre directement, demander une précision ou préparer une recherche
3. chaque recherche passe par le validateur SQL puis s’exécute en lecture seule
4. le modèle reçoit les résultats et peut compléter, vérifier ou corriger sa recherche, dans une limite de quatre étapes par question
5. une réponse finale s’appuie sur toutes les recherches exécutées, affichées séparément sous le message

Les explications, conseils et demandes de rédaction ne nécessitent plus de requête SQL. Les salutations sont libres. Les erreurs de requête sont renvoyées au planificateur pour correction, sans exposer les erreurs internes de la base. Une recherche répétée n’est pas exécutée à nouveau. Si les vérifications restent incomplètes, la réponse l’indique explicitement.

Le contexte reçu du navigateur est non fiable et sert seulement à comprendre les suivis : les faits doivent être revérifiés en base. Les extraits contiennent au plus quatre recherches par message récent, trois lignes par recherche et des valeurs texte limitées à 300 caractères. Le fil visible n’est pas effacé quand le contexte envoyé est réduit.

Les bornes du jour, de la veille, de la semaine et du mois (courants et précédents) sont calculées en `Europe/Zurich`, avec prise en compte des changements d’heure. Les prompts distinguent `rowCount` du nombre total de documents, exigent `COUNT` pour compter et séparent facturation et encaissement.

Les réponses sont affichées en Markdown (gras, listes, tableaux, code) ; les messages utilisateur restent en texte brut. Le HTML brut est échappé, les URL dangereuses sont rejetées et les images distantes ne sont pas chargées. Les tableaux larges défilent horizontalement à l’intérieur du message.

## Tables et colonnes exposées

La source de vérité est `server/utils/assistant/allowlist.ts`.

Tables exposées en v1:

- `customers`
- `catalog_items`
- `tickets`
- `ticket_events`
- `documents`
- `document_lines`
- `ticket_lines`
- `payments`
- `smartphone_stocks`
- `employees`
- `vacation_entries`
- `smartphone_reservation_requests`

Tables explicitement exclues:

- `company_settings`
- tables SQLite internes et migrations
- toute future table d’auth, session, secret, token, ou méta non ajoutée explicitement

Colonnes sensibles exclues même sur tables autorisées:

- notes libres client: `notes`
- détails sensibles ticket/appareil: `serial_number`, `imei`, `access_code`, `sim_code`, `internal_notes`
- champs libres paiement: `reference`, `notes`
- identifiants device stock: `imei`
- coordonnées employé: `email`
- notes vacances
- données personnelles réservation: `name`, `phone`, `notes`
- configuration bancaire et branding de `company_settings`

Les coordonnées clients (`phone`, `email`, `address_line_1`, `address_line_2`) et la description de panne (`tickets.issue_description`) sont désormais consultables par les collaborateurs authentifiés, comme les écrans POS correspondants. Ces champs peuvent être transmis à MiniMax lors d’une recherche. Les codes appareil/SIM, notes internes, secrets, comptes et sessions restent exclus. Les coordonnées employé/réservation restent hors allowlist.

## Garde-fous SQL

Le validateur est dans `server/utils/assistant/sql.ts`.

Règles appliquées:

- une seule instruction autorisée
- `SELECT` ou `WITH ... SELECT` uniquement
- rejet des commentaires SQL
- rejet de `SELECT *`
- rejet des mots-clés d’écriture, DDL, admin et transaction
- rejet des tables hors allowlist
- rejet des colonnes sensibles connues
- cap d’exécution via wrapper lecture seule
- délai max cible: 3 secondes
- résultat tronqué à 50 lignes visibles

Chaque tentative est loggée côté serveur avec:

- `requestId`
- métadonnées structurelles de la requête (jamais le SQL ni ses valeurs littérales)
- statut accepté/rejeté
- durée
- nombre de lignes
- raison de rejet si applicable

Les résultats eux-mêmes ne sont pas loggés.

## Configuration

Variables serveur requises:

- `MINIMAX_API_KEY`

Variables optionnelles:

- `MINIMAX_MODEL`
- `MINIMAX_BASE_URL`

Le modèle par défaut est `MiniMax-M3`, l’identifiant officiel de [MiniMax M3](https://www.minimax.io/models/text/m3). Un `MINIMAX_MODEL` ou `NUXT_MINIMAX_MODEL` explicite remplace ce défaut ; mettre également cette variable à jour lors d’un changement de modèle.

Sur Cloudflare, ces valeurs sont lues dans les bindings du Worker à chaque requête. Les variantes préfixées `NUXT_MINIMAX_*` sont également prises en charge et prioritaires. En local, elles sont lues dans l’environnement chargé depuis `.env`. La clé n’est pas intégrée au build.

Une configuration manquante ou une panne MiniMax produit une erreur `service_unavailable`, distincte des refus SQL. Le message affiché ne contient ni réponse brute du fournisseur ni secret.

Par défaut, l’assistant utilise `https://api.minimax.io/v1`. Selon le compte MiniMax, `https://api.minimaxi.com/v1` peut exister aussi, mais certaines clés ne sont valides que sur l’un des deux environnements.

Variables Turso inchangées:

- `TURSO_URL`
- `TURSO_TOKEN`

## Risques et limites

- le timeout est implémenté côté application via `Promise.race`; selon le client DB, une requête lente peut continuer côté base après retour d’erreur
- la validation SQL est volontairement stricte et peut refuser certaines requêtes pourtant inoffensives
- la détection de colonnes sensibles repose sur une stratégie conservatrice par motifs; elle ne remplace pas une vraie couche de permissions métier
- aucun stockage persistant de conversation ; la session authentifiée est requise, et le SQL de debug est réservé aux administrateurs en production

## Étendre l’allowlist en sécurité

1. ajouter la table ou colonne dans `allowlist.ts`
2. vérifier qu’aucune donnée sensible n’est exposée par défaut
3. documenter le nouvel accès dans ce fichier
4. tester au minimum un cas heureux et un cas refusé
5. relire les logs produits pour confirmer la visibilité attendue
