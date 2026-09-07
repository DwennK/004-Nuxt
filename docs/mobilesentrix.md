# MobileSentrix

## Catalogue de réparations : Europe

La recherche utilise l’API `https://www.mobilesentrix.com`, dont les identifiants
actuels fonctionnent. Elle contient aussi des pièces EU / Global. L’API `.eu`
refuse actuellement ces clés (`401 consumer_key_rejected`) ; aucun appel ne lui
transmet automatiquement les identifiants américains.

Pour une correspondance certaine, le script consulte aussi la fiche publique
`.eu` et exige un objet structuré `Product` portant exactement le même SKU.
Si cette preuve existe, le lien enregistré pointe vers `.eu` et l’identifiant
produit est laissé vide : les identifiants numériques diffèrent entre boutiques.
Sinon le lien `.com` est conservé avec une note « présence sur .eu non confirmée ».
La présence d’une fiche ne prouve ni le stock européen ni la livraison.
Aucun secret ne doit figurer dans un rapport ou dans Git.

Le catalogue conserve son SKU interne unique. La colonne nullable
`catalog_items.mobilesentrix_json` contient une association fournisseur : état,
SKU (chaîne de caractères), identifiant produit de la boutique liée, URL `.com` ou `.eu`, note, provenance
`manual` / `api` et date de vérification API. Une même référence fournisseur peut
servir à plusieurs réparations. Les requêtes catalogue qui omettent
`mobileSentrix` conservent l'association ; une suppression explicite garde un
marqueur manuel `unlinked` pour éviter une réattribution automatique. Une édition
manuelle ne peut pas se présenter comme une vérification API.

L'état `matched` exige un SKU. `variant_required`, `not_found` et `unlinked`
n'enregistrent pas de SKU, d'identifiant ou de lien vers une variante précise.
La liste affiche un résumé ; le formulaire permet de modifier la référence ou
de l'effacer, et la recherche catalogue accepte le SKU fournisseur.

### Règles de rapprochement

- Écrans iPhone : XO7 Soft, hors 3.0. Écrans Samsung : Service Pack,
  avec choix explicite du cadre et de la couleur.
- Batteries iPhone : AmpSentrix Plus standard, sans Extended ni cellule seule.
- Batteries Samsung : AmpSentrix Pro, puis Service Pack si aucune Pro compatible
  n'existe. Une rupture de stock ne déclenche pas de changement de gamme.
- Faces arrière/châssis iPhone : Used OEM Pull Grade A, preuve de compatibilité
  Europe requise. Pas de choix automatique de couleur.
- Faces arrière/ports Samsung : Service Pack uniquement.
- Ports et petites pièces iPhone : Premium, puis Aftermarket Plus ; compatibilité
  Europe à confirmer pour les ports.
- Autres petites pièces Samsung : Service Pack, puis Premium, Aftermarket Plus,
  puis Aftermarket explicitement identifié. Toute ambiguïté reste à examiner.

Les modèles doivent correspondre exactement, y compris Pro/Max/FE/5G et toutes
les générations d'une réparation groupée. Les variantes USA et accessoires
identifiés sont exclus. Le rapprochement reste volontairement conservateur :
une nouvelle nomenclature fournisseur peut nécessiter une règle supplémentaire.

### Simulation puis application

```bash
node scripts/mobilesentrix/catalog.mjs --help
node scripts/mobilesentrix/catalog.mjs --url file:/absolute/path/pos.db
node scripts/mobilesentrix/catalog.mjs --url file:/absolute/path/pos.db \
  --apply --report /absolute/path/report.json
```

Pour la base distante, utiliser les mêmes paramètres de cible que les scripts
DB : `--environment production --confirm-target <hostname>` et
`--allow-production-read` en simulation, ou `--allow-production-write` pour
l'application. Appliquer d'abord la migration additive via le
[processus de migration et restauration](database-migrations.md).

La simulation écrit un rapport JSON et un tableau Markdown privé dans
`.data/mobilesentrix/` (ignoré par Git), avec une entrée par réparation, les
candidats et leurs différences. Les résultats sont paginés et les fiches
détaillées relues. Une erreur API ou une pagination incomplète donne `blocked`,
jamais `not_found`. Une erreur d'authentification interrompt les appels suivants.

L'application relance la recherche fournisseur, sauvegarde le catalogue, puis écrit
dans une transaction uniquement les associations vérifiées et les états
résolus. Les cas bloqués et les choix manuels restent inchangés. Les empreintes
du rapport détectent les modifications concurrentes ; un conflit annule la
transaction. Les états ambigus ne reçoivent jamais de SKU. Une relecture vérifie
les écritures et une relance identique ne modifie pas les dates. Les prix, TVA,
SKU internes, stocks, tickets et documents ne sont pas modifiés.

Le catalogue audité le 7 septembre 2026 comprend 361 réparations, dont
121 écrans/batteries. Ce nombre désigne des réparations, pas des SKU distincts.
Le premier essai limité à l’API Europe était entièrement bloqué par OAuth ;
il ne permettait pas de conclure à l’absence des pièces sur `.com`.

L’option `--cache-dir .data/mobilesentrix/com-cache` réutilise pendant une heure
les réponses API des simulations (fichiers privés). `--fresh` force une nouvelle
lecture. L’application ignore toujours les lectures du cache. Les recherches
par modèle sont exhaustives ; les titres filtrent les types et gammes avant
lecture détaillée. Les fiches sont chargées par groupes de trois. Les variantes
restent documentées avec leurs SKU, liens, couleurs et motifs dans le rapport.

L’outil `/tools/mobilesentrix` appelle MobileSentrix depuis les routes serveur du
POS. Le header `ms-token`, confirmé par le support MobileSentrix, permet
d’autoriser les appels REST à travers leur protection Cloudflare. Il complète
l’authentification OAuth existante.

## Configuration locale

Conserver les identifiants `MOBILESENTRIX_CONSUMER_*` et les deux tokens
`MOBILESENTRIX_ACCESS_TOKEN` / `MOBILESENTRIX_ACCESS_TOKEN_SECRET`, puis ajouter
dans le fichier `.env` ignoré par Git :

```dotenv
MOBILESENTRIX_REST_AUTH_HEADER_NAME=ms-token
MOBILESENTRIX_REST_AUTH_HEADER_VALUE=<valeur privée fournie par MobileSentrix>
```

La valeur doit tenir sur une seule ligne, sans espaces ni retours à la ligne
issus d’un e-mail ou d’une capture. Redémarrer Nuxt après modification de `.env`.
Ne jamais enregistrer la valeur réelle dans `.env.example`, Git ou la documentation.

`server/utils/mobilesentrix.ts` ajoute ce header à chaque appel REST : recherche
(`/api/rest/searchproduct`), produits et appareils (`/api/rest/products`),
catégories (`/api/rest/categories`). `Authorization` reste réservé à OAuth.
Les deux paramètres doivent être renseignés ensemble ; les laisser tous deux
vides désactive le header supplémentaire. Le flux OAuth navigateur ne reçoit
pas ce secret.

Les vignettes renvoyées par l’API sont hébergées sur
`https://static.mobilesentrix.com`. Le mapping serveur et la directive CSP
`img-src` autorisent ce domaine HTTPS ainsi que `www.mobilesentrix.com`.
Les liens vers les fiches restent limités au domaine de la boutique configurée.
Le navigateur charge les images publiques directement, sans recevoir le
header `ms-token` ni les identifiants OAuth.

## Production Cloudflare

Le site `https://pos.microwest.ch` utilise le Worker `nuxt`, déclaré dans
`wrangler.json`. Modifier `.env` ou pousser Git ne met pas à jour ses secrets.

Configurer ces deux secrets sur le Worker :

- `MOBILESENTRIX_REST_AUTH_HEADER_NAME` : `ms-token`
- `MOBILESENTRIX_REST_AUTH_HEADER_VALUE` : valeur privée fournie par MobileSentrix

Depuis la racine du dépôt, vérifier le compte avec `npx wrangler whoami`, puis
utiliser les invites sécurisées :

```bash
npx wrangler secret put MOBILESENTRIX_REST_AUTH_HEADER_NAME --name nuxt
npx wrangler secret put MOBILESENTRIX_REST_AUTH_HEADER_VALUE --name nuxt
npx wrangler secret list --name nuxt
```

Pour appliquer les deux valeurs ensemble, `wrangler secret bulk --name nuxt`
accepte un objet JSON sur l’entrée standard. Lui transmettre uniquement ces
deux clés, sans journaliser les valeurs ni exporter tout le fichier `.env`.
La modification des secrets déploie une nouvelle version du Worker existant ;
elle ne publie pas les modifications locales du code.

Le serveur accepte aussi les noms préfixés `NUXT_`. Éviter de définir des copies
contradictoires : la configuration runtime Nuxt est prioritaire sur les valeurs
de repli. Garder ces paramètres privés, jamais sous `runtimeConfig.public` ni
sous un nom `NUXT_PUBLIC_*`.

Référence : [secrets Cloudflare Workers](https://developers.cloudflare.com/workers/configuration/secrets/).

## Vérification depuis le site live

1. Se connecter au POS et ouvrir `/tools/mobilesentrix`.
2. Vérifier que le compte est prêt et que le header REST est configuré.
   `/api/tools/mobilesentrix/status` expose seulement `hasRestAuthHeader`, jamais
   la valeur du secret.
3. Rechercher `iphone lcd`, puis charger les appareils et les catégories.
4. Vérifier les résultats et les réponses JSON des routes POS, sans page HTML
   Cloudflare ni erreur `403` / `Just a moment`.

Un statut « configuré » prouve seulement la présence des paramètres. Seul un
appel réel avec des résultats confirme leur fonctionnement. Une erreur JSON
OAuth ou de droits API après ajout du header doit être distinguée du blocage
Cloudflare. Ne jamais partager les headers d’authentification dans les captures
ou les journaux de diagnostic.
