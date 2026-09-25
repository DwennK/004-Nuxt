# Recherche du modèle par IMEI

Le formulaire du stock recherche le modèle après saisie ou scan d'un IMEI valide
(15 chiffres, clé de Luhn), avec un délai de 450 ms. Le serveur utilise uniquement
son TAC, les huit premiers chiffres, dans une copie persistante de la base
[MoazEb/tac-database](https://github.com/MoazEb/tac-database).
Aucun IMEI ni TAC recherché n'est transmis à GitHub. Aucun compte fournisseur ni
clé HiCellTek n'est nécessaire. La capacité reste manuelle.

Un champ modèle vide est rempli automatiquement. Une saisie manuelle ou un
modèle existant est préservé ; le bouton « Utiliser … » permet d'accepter la
suggestion. Les réponses arrivant après un changement d'IMEI ou la fermeture du
formulaire sont ignorées. Une absence de résultat ou une panne permet toujours
la saisie manuelle. Les fiches de stock déjà enregistrées ne sont jamais
réécrites par une mise à jour de la base TAC.

## Données et synchronisation

- Source : `tac_full.csv`, branche `main`. Le SHA du dernier commit concernant
  ce fichier est consulté via l'API publique GitHub ; le CSV est téléchargé à ce
  SHA immuable uniquement lorsqu'il change.
- Colonnes attendues : `Brand,TAC,SPECS`. Le modèle est le premier élément de
  `SPECS`, ou le deuxième si le premier est seulement la marque. Les libellés
  iPhone sont harmonisés. Les codes doivent contenir exactement huit chiffres
  (zéros initiaux préservés), sans compléter les anciens codes incomplets.
- Les valeurs vides, N/A, codes de test et modèles inutilisables sont ignorés.
  Deux modèles ou marques contradictoires pour un TAC excluent ce TAC.
- Tables : `tac_blocks` contient les dictionnaires JSON par préfixe de trois
  chiffres et version ; `tac_sync_state` contient la version active/précédente,
  le commit, les dates, compteurs, verrou et dernier code d'erreur.
- Cron Cloudflare : `0 3 * * *`, tous les jours à **03:00 UTC** (05:00 en été,
  04:00 en hiver à Zurich), indépendant de la sauvegarde de 02:00 UTC. La
  synchronisation fonctionne sans ordinateur ni application ouverte.
- Verrou persistant de 15 minutes, budget d'import de 10 minutes. Chaque import
  possède un identifiant distinct ; les écritures et l'activation vérifient
  encore le propriétaire du verrou. Une exécution interrompue est récupérable
  après expiration. Le téléchargement est limité à 24 Mio / 60 secondes.
- Une nouvelle version est entièrement préparée avant activation atomique.
  La précédente est conservée ; les anciens imports et imports incomplets sont
  nettoyés sous verrou. La recherche lit version et bloc dans une seule requête,
  sans cache qui pourrait servir une ancienne version après synchronisation.
- Protection contre un fichier tronqué/remplacé : au moins 100 000
  correspondances, pas de diminution de plus de 10 % par rapport à la version
  active, pas plus de 10 % de lignes invalides/conflits, blocs de 1 Mio maximum.
  Un changement légitime dépassant ces seuils nécessite une revue de l'importeur.
  Une erreur laisse la dernière version valide disponible et sera retentée le
  lendemain ; sans premier import, la recherche répond `unavailable`.

## API

- `POST /api/smartphone-stocks/imei-lookup`, utilisateur actif requis,
  corps `{ "imei": "…" }` : `{status:"found",model:"…"}`, `{status:"not_found"}`
  ou `{status:"unavailable"}`. IMEI invalide : HTTP 400. Réponse `no-store`.
- `GET /api/settings/tac-database`, administration requise : disponibilité du
  schéma/des données, import en cours, commit, dates, compteurs et erreur
  expurgée (`lastError`). Ne retourne ni verrou ni contenu des blocs.
- `POST /api/settings/tac-database/sync`, administration et `Origin` identique
  requis, sans corps : `{status:"updated"}`, `{status:"unchanged"}` ou
  `{status:"running"}`. Appel synchrone ; attendre sa réponse. Erreur : HTTP 503
  avec un code stable, sans données SQL ni réponse amont.

## Mise en service (séparée du développement)

1. Vérifier puis appliquer la migration
   `drizzle/20260925095028_tac_database/migration.sql` avec le flux versionné de
   [database-migrations.md](database-migrations.md), la cible confirmée et une
   sauvegarde de récupération. Ne pas utiliser `db:push` en production.
2. Déployer le Worker avec les deux crons générés. Les identifiants Turso
   existants suffisent ; aucun nouveau service de stockage n'est nécessaire.
3. Depuis une session administrateur du POS, effectuer le premier import :

   ```js
   await fetch('/api/settings/tac-database/sync', { method: 'POST' }).then(r => r.json())
   await fetch('/api/settings/tac-database').then(r => r.json())
   ```

   Vérifier `available: true`, `entryCount`, `sourceCommit` et `lastError: null`.
   Le prochain cron peut aussi effectuer ce premier import. Une nouvelle
   tentative identique doit répondre `unchanged` sans retélécharger le CSV.
4. Tester un IMEI connu dans le formulaire. Contrôler ensuite l'exécution
   planifiée dans les journaux Cloudflare, scope `tac-sync`. Les erreurs GitHub,
   `unexpected_entry_count`, `invalid_csv`, `lease_lost` ou `interrupted`
   apparaissent dans l'état administrateur. Une source communautaire peut
   rester incomplète ou incorrecte : la correction manuelle reste disponible.

## Attribution

Source publiée sous licence MIT, Copyright (c) 2026 Moaz Ebrahem.
Le texte de licence est conservé dans
[licenses/tac-database-MIT.txt](licenses/tac-database-MIT.txt).

## Validation

Les tests couvrent l'extraction des quatre modèles du stock, les TAC avec zéro
initial, les entrées invalides et conflictuelles, l'authentification des routes,
les imports inchangés/modifiés, les écritures interrompues et la perte de verrou.
La migration s'exécute dans une base locale dédiée aux tests.

Le fichier réel vérifié le 25 septembre 2026 comporte 255 002 lignes, dont
246 495 correspondances retenues, 8 481 lignes inutilisables et 12 TAC exclus
pour conflit. Les doublons identiques sont fusionnés. Les 99 blocs occupent
7 058 243 octets de JSON. Ces chiffres décrivent cet instant, pas une garantie
de couverture exhaustive.

Vérification locale du Worker compilé : import réel réussi à partir du commit
`b45b70dc3a9a685537fd4870e7711c1b2257f18a`, second cron `unchanged`, puis recherche
authentifiée et remplissage réel des quatre modèles. Le transport libSQL était
relié à une base SQLite de test isolée. Routes anonymes : 401 ; état/import pour
un opérateur : 403 ; recherche pour un opérateur : 200 ; import administrateur
avec une origine étrangère : 403. Formulaire vérifié à 1440×1000 et 390×844.

Pour une répétition sous Wrangler, utiliser un fichier d'environnement de test
qui définit **à la fois** `TURSO_URL`/`TURSO_TOKEN` et
`NUXT_TURSO_URL`/`NUXT_TURSO_TOKEN` vers la même cible isolée : les alias Nuxt
évitent de réutiliser les valeurs incorporées au build. Fournir également un
mot de passe de session local et les clés Turnstile de test. Avec la route
personnalisée du projet, utiliser `--local-upstream 127.0.0.1:8787
--upstream-protocol http` afin de tester le contrôle d'origine sur l'hôte local.
Le déclencheur local est `/cdn-cgi/local/scheduled?cron=0%203%20*%20*%20*`.
Aucune migration, import TAC ou livraison en production n'est inclus dans ces
vérifications locales.
