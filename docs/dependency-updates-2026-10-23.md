# Mises à jour des dépendances — 23 octobre 2026

Le registre npm signale 22 dépendances directes avec une version plus récente.
Ce lot applique les 19 mises à jour mineures ou correctives, sans migration de
schéma ni modification du comportement métier. Les trois versions majeures
restent à examiner séparément.

## Nouveautés utiles pour le POS

- **Scanner de codes-barres** : `barcode-detector` 3.2.3 et `zxing-wasm` 3.1.6
  réduisent les allocations mémoire et corrigent des fuites de ressources.
  L'éditeur annonce une latence réduite d'environ 40 à 48 % dans ses scénarios
  720p/1080p sur Chromium 156 et Apple M3 Pro. Ce chiffre est un benchmark amont,
  pas une mesure sur les appareils du magasin. Le décodeur et le WASM servi
  localement restent alignés grâce à l'override et au script de copie existants.
  Sources : [barcode-detector](https://github.com/Sec-ant/barcode-detector/releases/tag/v3.2.3),
  [zxing-wasm](https://github.com/Sec-ant/zxing-wasm/releases/tag/v3.1.6).
- **Nuxt 4.6.2 et Vue 3.5.44** : correctifs de navigation, de paramètres des
  routes serveur, de transitions et d'hydratation. Ce sont surtout des gains de
  fiabilité, sans nouvelle interface à activer.
  Sources : [Nuxt](https://github.com/nuxt/nuxt/releases/tag/v4.6.2),
  [Vue](https://github.com/vuejs/core/blob/v3.5.44/CHANGELOG.md).
- **Authentification** : `nuxt-auth-utils` 0.5.32 rejette les retours OAuth sans
  état de connexion enregistré. Le correctif concerne les fournisseurs OAuth ;
  il ne change pas notre formulaire de connexion par mot de passe.
  Source : [notes de version](https://github.com/atinux/nuxt-auth-utils/releases/tag/v0.5.32).
- **Validation des sauvegardes SQLite** : `sql.js` 1.15 embarque SQLite 3.54.0,
  corrige la gestion de grosses requêtes et la libération de ressources ; 1.15.1
  corrige certains noms de colonnes et fonctions SQL. Les nouveaux builds WASM
  monofichiers existent, mais l'application conserve son module WASM statique
  compatible Workers. Cela ne met pas à jour le moteur distant Turso.
  Sources : [1.15.0](https://github.com/sql-js/sql.js/releases/tag/v1.15.0),
  [1.15.1](https://github.com/sql-js/sql.js/releases/tag/v1.15.1).
- **Métadonnées** : Unhead 3.4.3 améliore notamment les directives robots, les
  cartes Twitter et le nettoyage des ressources Vue.
  Source : [notes de version](https://github.com/unjs/unhead/releases/tag/v3.4.3).

## Versions appliquées

| Dépendance | Avant | Après |
| --- | --- | --- |
| `@iconify-json/lucide` | 1.2.141 | 1.2.147 |
| `@iconify-json/simple-icons` | 1.2.99 | 1.2.100 |
| `@unhead/vue` | 3.4.2 | 3.4.3 |
| `vue` | 3.5.43 | 3.5.44 |
| `@vue/server-renderer` | 3.5.43 | 3.5.44 |
| `nuxt` | 4.6.1 | 4.6.2 |
| `nuxt-auth-utils` | 0.5.31 | 0.5.32 |
| `barcode-detector` | 3.2.2 | 3.2.3 |
| `zxing-wasm` | 3.1.5 | 3.1.6 |
| `sql.js` | 1.14.2 | 1.15.1 |
| `markdown-it` | 15.0.2 | 15.0.3 |
| `zod` | 4.6.5 | 4.6.7 |
| `dotenv` | 18.0.6 | 18.0.8 |
| `@cloudflare/workers-types` | 5.20261008.1 | 5.20261022.1 |
| `wrangler` | 4.148.0 | 4.151.3 |
| `eslint` | 10.12.0 | 10.13.0 |
| `playwright` | 1.64.0 | 1.64.1 |
| `vitest` | 5.0.3 | 5.0.5 |
| `vue-tsc` | 3.3.12 | 3.3.13 |

Nuxt UI 4.12.0, Tailwind, Drizzle et les autres dépendances directes ne présentent
pas de version stable plus récente dans cet inventaire.

## Migrations laissées à examiner ensemble

Ces versions n'ont pas été installées dans ce lot : elles sont différées par
analyse de compatibilité, et non présentées comme des échecs de tests.

| Dépendance | Installée → disponible | Motif et prochaine vérification |
| --- | --- | --- |
| `@tanstack/table-core` | 8.21.3 → 9.3.1 | Nuxt UI 4.12.0 dépend encore de `@tanstack/vue-table` 8.21.3. Coordonner la migration des tableaux UI, du tri et de la pagination avec les usages directs du serveur et des pages smartphone/vacances. |
| `h3` | 1.15.11 → 2.0.8 | Nitro 2.13.4 utilise H3 1.15.11. La v2 change les objets requête/réponse, le routage et plusieurs utilitaires. Migrer avec une version compatible de Nitro, puis vérifier authentification, middleware et routes API sur Workers. |
| `typescript` | 6.0.3 → 7.0.2 | Migration majeure du compilateur vers une implémentation native. `vue-tsc` 3.3.13 charge encore `typescript/lib/tsc` et l'intégration Volar. Vérifier la chaîne Nuxt/Vue/Volar dans un lot distinct avant de changer le compilateur. |

Références : [migration H3](https://h3.dev/migration),
[TypeScript 7](https://github.com/microsoft/TypeScript/releases/tag/v7.0.2).

Hors dépendances directes, pnpm propose aussi **12.10.1 → 12.15.0**.
La version du gestionnaire reste inchangée : elle est explicitement vérifiée
dans la CI et doit être mise à jour avec cette assertion dans un lot outillage.
La version 12.15 ajoute notamment la répartition de configuration entre fichiers
et un contrôle de cohérence du nom des paquets dans les métadonnées du registre.
Source : [pnpm 12.15](https://github.com/pnpm/pnpm/releases/tag/v12.15.0).

## Vérifications

- Localement : `pnpm run lint`, `pnpm run typecheck`, 659 tests unitaires,
  9 tests de sécurité, `security:regression` et build Cloudflare réussis.
- Les deux dépassements de délai PDF du premier lancement simultané disparaissent
  à la relance de la suite unitaire complète, sans modification des tests.
- Sous Windows, la suite d'intégration rencontre des erreurs `EBUSY` / `EPERM`
  en supprimant ses bases SQLite temporaires. La suite de numérotation reproduit
  les mêmes dix erreurs avec les anciennes dépendances. Aucun contournement de
  ces tests n'est ajouté à l'application.
- Le job Linux **Quality** réussit avec les nouvelles dépendances : installation
  figée, lint, types, 659 tests unitaires, 316 tests d'intégration, 9 tests de
  sécurité et build. **Browser smoke** réussit aussi : 1 test passé, 4 scénarios
  opt-in ignorés car leur serveur de données isolé n'est pas configuré en CI.
  [Exécution CI de validation](https://github.com/DwennK/004-Nuxt/actions/runs/39954872039).
- Le build généré démarre avec Wrangler/Workers localement. La page de connexion
  est vérifiée dans Playwright à 1440 px et 390 px, sans erreur JavaScript ni
  débordement mobile. Les clés de test Turnstile et le mot de passe de session
  sont fournis seulement au serveur local. Une API protégée renvoie bien 401.
- Le WASM du scanner servi par le Worker est identique au fichier de `zxing-wasm`
  3.1.6 (946 860 octets). La vitesse réelle avec la caméra du magasin reste à mesurer.
