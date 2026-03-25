# 004-Nuxt

[![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](https://nuxt.com/)
[![Nuxt UI](https://img.shields.io/badge/Nuxt_UI-v4-00DC82?logo=nuxt&logoColor=white)](https://ui.nuxt.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-typed_SQL-C5F74F?logo=drizzle&logoColor=111111)](https://orm.drizzle.team/)
[![Turso](https://img.shields.io/badge/Turso-libSQL-4FF8D2?logo=turso&logoColor=111111)](https://turso.tech/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)

Dashboard Nuxt 4 orienté gestion smartphone, avec interface admin construite sur Nuxt UI, base de données Turso/libSQL, accès données via Drizzle ORM, et déploiement Cloudflare Workers via Nitro.

## Aperçu

Le projet couvre actuellement plusieurs briques métier :

- gestion des clients
- gestion du stock smartphone
- gestion des demandes de réservation smartphone
- import / export CSV des demandes de réservation
- dashboard Nuxt UI avec table, filtres, modales et actions CRUD

## Stack

- `Nuxt 4`
- `Vue 3`
- `@nuxt/ui`
- `Turso` avec `@libsql/client`
- `Drizzle ORM` + `drizzle-kit`
- `Tailwind CSS`
- `Zod`
- `Cloudflare Workers` via `Nitro`

## Base de données

Le projet utilise maintenant `Drizzle ORM` comme couche d'accès aux données.

Fichiers clés :

- schéma Drizzle : [`server/db/schema.ts`](./server/db/schema.ts)
- config Drizzle Kit : [`drizzle.config.ts`](./drizzle.config.ts)
- connexion Turso / Drizzle : [`server/utils/turso.ts`](./server/utils/turso.ts)

Tables principales :

- `customers`
- `smartphone_stocks`
- `smartphone_reservation_requests`

Note importante :

- les modules métiers utilisent Drizzle pour les requêtes CRUD
- les fonctions `ensure*Table()` existantes gardent encore une logique de bootstrap / compatibilité pour les bases déjà présentes
- `db:push` est disponible pour synchroniser le schéma défini par Drizzle

## Installation

Installer les dépendances :

```bash
npm install
```

Créer le fichier d'environnement local :

```bash
cp .env.example .env
```

## Variables d’environnement

Définies dans [`/.env.example`](./.env.example) :

```bash
NUXT_PUBLIC_SITE_URL=
TURSO_URL=
TURSO_TOKEN=
```

- `NUXT_PUBLIC_SITE_URL` : URL publique du site
- `TURSO_URL` : URL de la base Turso
- `TURSO_TOKEN` : token d'authentification Turso

## Développement

Lancer le serveur de dev Nuxt :

```bash
npm run dev
```

Contrôles qualité :

```bash
npm run lint
npm run typecheck
```

## Drizzle

Pousser le schéma Drizzle vers Turso :

```bash
npm run db:push
```

Lancer Drizzle Studio :

```bash
npm run db:studio
```

## Cloudflare Workers

Le projet utilise le preset Nitro `cloudflare_module` configuré dans [`nuxt.config.ts`](./nuxt.config.ts).

Build production :

```bash
npm run build
```

Prévisualisation locale du worker :

```bash
npm run preview
```

Déploiement :

```bash
npm run deploy
```

Génération des types Cloudflare :

```bash
npm run cf-typegen
```

## Structure utile

```text
app/
  components/
  layouts/
  pages/
server/
  api/
  db/
  utils/
drizzle.config.ts
nuxt.config.ts
```

## Notes

- ne pas déployer avec `wrangler deploy` à la racine du repo
- le script de déploiement passe bien par `.output`
- si tu fais évoluer le modèle de données, mets à jour le schéma Drizzle avant de pousser les changements
