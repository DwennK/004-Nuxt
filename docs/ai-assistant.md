# Assistant IA interne

## Vue d’ensemble

- Route UI: `/assistant`
- Endpoint Nitro: `POST /api/assistant/chat`
- Orchestration serveur: `server/utils/assistant/`
- Accès DB: Turso + Drizzle existants via `server/utils/turso.ts`

Le flux est strictement serveur:

1. le client envoie l’historique utile et la question courante
2. OpenAI génère un plan SQL structuré
3. la requête SQL est validée par la couche de garde-fous
4. la requête validée est exécutée en lecture seule sur Turso via Drizzle
5. les résultats sont reformulés en réponse métier concise

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

- coordonnées client: `phone`, `email`, `notes`
- détails sensibles ticket/appareil: `serial_number`, `imei`, `access_code`, `sim_code`, `issue_description`, `internal_notes`
- champs libres paiement: `reference`, `notes`
- identifiants device stock: `imei`
- coordonnées employé: `email`
- notes vacances
- données personnelles réservation: `name`, `phone`, `notes`
- configuration bancaire et branding de `company_settings`

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
- SQL validée ou rejetée
- statut accepté/rejeté
- durée
- nombre de lignes
- raison de rejet si applicable

Les résultats eux-mêmes ne sont pas loggés.

## Configuration

Variables serveur requises:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Variable optionnelle:

- `OPENAI_BASE_URL`

Variables Turso inchangées:

- `TURSO_URL`
- `TURSO_TOKEN`

## Risques et limites

- le timeout est implémenté côté application via `Promise.race`; selon le client DB, une requête lente peut continuer côté base après retour d’erreur
- la validation SQL est volontairement stricte et peut refuser certaines requêtes pourtant inoffensives
- la détection de colonnes sensibles repose sur une stratégie conservatrice par motifs; elle ne remplace pas une vraie couche de permissions métier
- aucun stockage de conversation ni contrôle d’accès dédié n’est ajouté en v1

## Étendre l’allowlist en sécurité

1. ajouter la table ou colonne dans `allowlist.ts`
2. vérifier qu’aucune donnée sensible n’est exposée par défaut
3. documenter le nouvel accès dans ce fichier
4. tester au minimum un cas heureux et un cas refusé
5. relire les logs produits pour confirmer la visibilité attendue
