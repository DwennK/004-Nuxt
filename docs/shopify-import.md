# Import Shopify

L’outil `/tools/shopify-import` est réservé aux administrateurs. Shopify reste
en lecture seule pour l’import et la synchronisation des paiements. Ces actions
enregistrent les données dans le POS uniquement. La case « Appareil récupéré /
livré » permet séparément de créer ou d’annuler les traitements Shopify. L’ancienne page WooCommerce redirige ici.

## Connexion

API Admin GraphQL épinglée à `2026-07`. Configurer côté serveur, en local dans
`.env` et en production dans les secrets/variables du Worker :

```dotenv
NUXT_SHOPIFY_SHOP_DOMAIN=boutique.myshopify.com
NUXT_SHOPIFY_CLIENT_ID=
NUXT_SHOPIFY_CLIENT_SECRET=
```

L’application doit être installée sur cette boutique. Le mode client credentials
nécessite que l’application et la boutique appartiennent à la même organisation
Shopify. Le serveur met le jeton en cache en mémoire et le renouvelle une minute
avant expiration ; un redémarrage du Worker obtient simplement un nouveau jeton.

Pour une application existante disposant d’un jeton Admin durable, utiliser
`NUXT_SHOPIFY_ADMIN_ACCESS_TOKEN` à la place du Client ID/secret, jamais les deux modes
ensemble. Les secrets restent privés ; les réponses de configuration n’exposent
que le nom et le domaine de la boutique et l’accès à l’historique.

Le préfixe `NUXT_` est obligatoire en local comme sur Cloudflare. Les anciennes
variables `SHOPIFY_*` doivent être renommées. Les valeurs par défaut restent
vides dans `nuxt.config.ts` pour ne pas intégrer les identifiants au build.
Chaque route transmet la requête à `useRuntimeConfig(event)` : les bindings du
Worker sont ainsi lus après leur mise à disposition par Cloudflare.
Pour l’aperçu local Worker, charger explicitement ces bindings avec
`npm run preview -- --local --env-file ../.env` ; le script lance Wrangler depuis
`.output`, qui ne charge pas automatiquement le `.env` de la racine.

### Configuration ShopyPhone

La boutique cible est `80jmu7-uv.myshopify.com`. Les identifiants de l’application
Admin du projet ShopyPhone peuvent être réutilisés pour cette boutique :

| Projet ShopyPhone | POS / Cloudflare | Stockage en production |
| --- | --- | --- |
| `SHOPIFY_STORE` | `NUXT_SHOPIFY_SHOP_DOMAIN` | Variable |
| `SHOPIFY_CLIENT_ID` | `NUXT_SHOPIFY_CLIENT_ID` | Variable ou secret |
| `SHOPIFY_CLIENT_SECRET` | `NUXT_SHOPIFY_CLIENT_SECRET` | Secret |

Laisser `NUXT_SHOPIFY_ADMIN_ACCESS_TOKEN` vide avec ce mode. Le `.env` local reste
ignoré par Git ; ses valeurs ne sont pas transférées par un commit ou un déploiement.
En production, renseigner les trois bindings sur le Worker POS `nuxt`
(`pos.microwest.ch`), dans **Settings > Variables and Secrets**. Le secret client
doit être de type **Secret**, jamais une valeur dans `wrangler.json`.

La vérification du 2 septembre 2026 a confirmé l’accès aux commandes, coordonnées,
lignes et transactions. `read_all_orders` n’était pas accordé ; l’historique reste
limité aux 60 derniers jours tant que cette autorisation n’est pas ajoutée.

Autoriser `read_orders` et les coordonnées clients protégées nécessaires aux
factures (nom, adresse, e-mail, téléphone). `read_all_orders` est nécessaire
au-delà de 60 jours. Sans ce scope, un résultat introuvable peut correspondre à
une ancienne commande inaccessible. L’interface indique cette limite.

La connexion vérifie le domaine réellement retourné par Shopify et les scopes.
Une erreur d’accès aux données personnelles interrompt l’import : aucune réponse
GraphQL partielle n’est utilisée. Une configuration absente affiche « Shopify non
connecté » sans appeler Shopify ni charger la base des commandes.

## Comportement

- Liste par pages de 20 commandes `status:open test:false`, recherche exacte par
  nom (avec ou sans `#`, y compris les préfixes personnalisés), ID numérique ou GID.
  La recherche manuelle inclut les commandes archivées accessibles.
- Tous les articles et frais de livraison sont paginés avant import. Un changement
  de commande entre les pages bloque la lecture pour éviter un mélange de versions.
- Facture en CHF avec numéro POS, date de commande et référence Shopify. Le client
  est retrouvé par e-mail insensible à la casse ; plusieurs correspondances
  bloquent l’import. Un client existant n’est pas écrasé.
- Chaque nouvel import classe ses lignes dans « Ecommerce », y compris les frais
  de livraison et la ligne de référence à montant nul. Les rapports quotidiens et
  généraux les regroupent dans cette catégorie selon leurs règles habituelles de
  règlement. Les factures déjà importées ne sont pas reclassées par un réimport
  ni par l’actualisation des paiements.
- Les remises allouées sont déduites des lignes ; leurs libellés conservent le
  produit, la variante, le SKU et les attributs publics. Les articles gratuits sont
  conservés. Une division inexacte du TTC par la quantité produit deux lignes avec
  des prix unitaires différant d’un centime. La TVA et le TTC doivent se réconcilier
  exactement avec Shopify ; aucune TVA forfaitaire ni correction arbitraire.
- Seules les transactions `SUCCESS` de type `SALE` ou `CAPTURE` positives créent
  des paiements `shopify`. Les autorisations et tentatives échouées sont ignorées.
  Le montant est brut, avant commission ; la date est `processedAt`, à défaut
  `createdAt`. Les rapports les comptabilisent à cette date historique.
- Les remboursements, commandes annulées/de test, cartes cadeaux/crédit boutique,
  devises étrangères, droits de douane, pourboires, frais supplémentaires et données
  non réconciliables sont bloqués explicitement. Aucun avoir automatique.

## Actualisation et traçabilité

Facture, client éventuel, lignes, paiements et reçus sont créés dans une seule
transaction SQL. La contrainte unique existante `(source, external_id)` protège
les réessais. Un import répété renvoie la facture existante ; l’actualisation des
paiements est une action séparée, disponible dans la liste et sur la facture.

`document_imports` utilise deux nouvelles sources sans changement physique de
table : `shopify_order` et `shopify_payment`. `external_id` contient le domaine et
le GID. Pour ces sources, `external_number` contient un reçu JSON versionné : nom
et empreinte commerciale pour la commande ; ID du paiement local, montant, date,
prestataire et note pour la transaction. Le détail du document expose une
provenance décodée, sans secret. Les anciens reçus WooCommerce restent intacts.

L’actualisation compare la facture et la commande à l’empreinte initiale, puis
vérifie chaque paiement existant. Elle ajoute seulement les transactions absentes
et actualise le statut de facture. Toute modification/ajout/suppression locale de
paiement, divergence commerciale, remboursement ou dépassement du solde impose un
rapprochement manuel. Elle ne réécrit pas les lignes ni les paiements historiques.

API administrateur : `GET connection`, `GET orders?after=`, `GET search?orderRef=`,
`POST import { orderRef }`, `POST payments { documentId }`, sous `/api/tools/shopify`.

## Validation et mise en service

Les tests Shopify utilisent des réponses simulées et des bases SQLite temporaires.
Exécuter les tests unitaires/intégration, lint, typecheck et build ; contrôler
l’interface sur ordinateur et mobile, puis le Worker en aperçu local.

Après ajout des vrais accès : vérifier le nom/domaine affiché, lire une commande
connue, contrôler TTC/TVA/encaissements puis importer une commande choisie. Répéter
l’import et l’actualisation : aucun doublon ne doit apparaître. Cette preuve réelle
reste distincte des tests locaux. Les anciens secrets WooCommerce peuvent ensuite
être retirés de la configuration du Worker ; aucune facture historique à supprimer.

## Documentation officielle

- [Commandes et filtres](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders)
- [Authentification client credentials](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant)
- [Transactions](https://shopify.dev/docs/api/admin-graphql/latest/objects/OrderTransaction)
- [Articles et remises](https://shopify.dev/docs/api/admin-graphql/latest/objects/LineItem)
- [Données clients protégées](https://shopify.dev/docs/apps/launch/protected-customer-data)

## Récupération / livraison

Une case « Appareil récupéré / livré » figure sous la barre supérieure des
documents et dossiers. Les documents liés au même dossier partagent son état.
Sans commande Shopify importée dans ce périmètre, la case reste un suivi local.
Avec une commande liée, Shopify est normalement la source de vérité, relue à l’ouverture,
à l’actualisation et après chaque mutation. Plusieurs commandes liées au même
dossier sont refusées pour éviter une action ambiguë.

Cocher traite tous les articles restants, regroupés par emplacement, avec
[`fulfillmentCreate`](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/fulfillmentCreate).
Décocher demande confirmation puis annule les traitements actifs de la commande
avec [`fulfillmentCancel`](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/fulfillmentCancel),
y compris ceux créés directement dans Shopify. Aucune notification client
n’est demandée. Les paiements et le statut métier du dossier restent indépendants.
Les droits Shopify doivent inclure `write_merchant_managed_fulfillment_orders`
pour les emplacements du marchand, et les droits de lecture des commandes. Les
services externes restent soumis aux actions que Shopify autorise.

Un état partiel s’affiche avec une case intermédiaire ; on peut terminer le
traitement ou annuler les traitements existants. Les réponses incomplètes, les
commandes annulées, les blocages Shopify et les erreurs de mutation ne sont
jamais présentés comme des réussites. La vérification finale exige une commande
`FULFILLED` après cochage et aucun traitement actif après annulation. Une commande
avec plus de 100 ordres de traitement, 250 traitements historiques ou 10 mutations
nécessaires doit être gérée directement dans Shopify.

Exception pour le retrait natif en magasin : si tous les lots restants sont
`PICK_UP`, ouverts ou en cours, avec un emplacement, sans blocage ni traitement
actif et sans action `CREATE_FULFILLMENT`, cocher ou décocher enregistre la remise
uniquement dans le POS. La mention « POS uniquement · Retrait Shopify non confirmé »
reste visible après rechargement. Aucun appel de mutation ni notification Shopify
n’est effectué dans ce cas. Le marqueur `local_only` conserve cette origine même
si les actions Shopify changent ensuite. Dès que Shopify confirme `FULFILLED`,
son état reprend la priorité et décocher annule à nouveau ses traitements.
Les commandes mixtes, partielles, annulées, bloquées ou les erreurs réseau ne
bénéficient pas de ce secours local.

Les opérateurs disposant de `financial:record` peuvent utiliser cette action.
Les routes PATCH exigent aussi la réservation du dossier. La table additive
`dossier_handovers` garde le suivi local et un verrou de synchronisation partagé
entre instances Worker (expiration de récupération : 10 minutes). Aucune requête
réseau ne reste dans une transaction SQLite. Si une réponse Shopify est perdue
ou une opération multi-emplacements échoue partiellement, l’état est relu avant
toute nouvelle tentative ; une annulation distante déjà effectuée n’est jamais
présentée comme annulée par un rollback SQLite.

Appliquer les migrations `20260923152440_dossier_handover` puis
`20260925120449_handover_local_pickup` avant le nouveau Worker,
selon le runbook base de données. La vérification des autorisations peut rester
en lecture seule ; les tests automatisés utilisent une boutique simulée et des
bases SQLite jetables.
