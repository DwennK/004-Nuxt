# Import Shopify

L’outil `/tools/shopify-import` est réservé aux administrateurs. Shopify reste
en lecture seule : aucune capture de paiement, modification de commande ou
mutation de stock n’est envoyée à Shopify. Le bouton d’import enregistre les
données dans le POS uniquement. L’ancienne page WooCommerce redirige ici.

## Connexion

API Admin GraphQL épinglée à `2026-07`. Configurer côté serveur, en local dans
`.env` et en production dans les secrets/variables du Worker :

```dotenv
SHOPIFY_SHOP_DOMAIN=boutique.myshopify.com
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
```

L’application doit être installée sur cette boutique. Le mode client credentials
nécessite que l’application et la boutique appartiennent à la même organisation
Shopify. Le serveur met le jeton en cache en mémoire et le renouvelle une minute
avant expiration ; un redémarrage du Worker obtient simplement un nouveau jeton.

Pour une application existante disposant d’un jeton Admin durable, utiliser
`SHOPIFY_ADMIN_ACCESS_TOKEN` à la place du Client ID/secret, jamais les deux modes
ensemble. Les secrets restent privés ; les réponses de configuration n’exposent
que le nom et le domaine de la boutique et l’accès à l’historique.

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
