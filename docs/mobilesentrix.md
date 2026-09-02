# MobileSentrix

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
