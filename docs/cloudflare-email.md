# Mails du POS — Cloudflare Email Sending

## Périmètre et état de livraison

Le code remplace le transport Resend par le binding natif `EMAIL` du Worker
Nuxt. L’activation distante est une étape distincte : **ne pas déployer avant
la baseline réelle, la restauration de sauvegarde testée et la migration SQL**.
`drizzle/README.md` constate que cette baseline n’est pas encore dans le dépôt.

Contrôle distant en lecture seule du 2 septembre 2026 : `pos.microwest.ch`
correspond bien au Worker `nuxt` du compte connecté, Email Sending est déjà
activé pour `microwest.ch`, et les MX entrants restent chez Infomaniak. Le
Worker actif n’a pas de binding `EMAIL` ni de variables `NUXT_MAIL_*` ; ses
valeurs mail compilées sont vides. Les variables d’expéditeur/réponse sont donc
déclarées explicitement dans la configuration de cette migration. Le statut
Workers Paid et le quota effectif restent à confirmer dans le tableau de bord
(lecture des abonnements refusée à la session CLI). Aucune activation distante,
migration, révocation de clé ou modification DNS n’a été effectuée.

L’historique commence vide. Les anciens mails, clés et compte Resend restent
intacts ; l’application ne les appelle plus. `/inbox` reste réservé aux
administrateurs et l’envoi conserve la capacité `financial:record`.
Aucune réception, aucun pixel, suivi de clic, statut de lecture ou purge.

## Fonctionnement

- `server/utils/email/transport.ts` prépare le constructeur structuré officiel,
  avec texte exact, destinataire, sujet, réponse et PDF existant en base64.
  La borne MIME conservatrice inclut encodage, repliement et en-têtes dans les
  5 Mio ; certains messages proches de la limite sont donc refusés en amont.
- `sent_emails` réserve la tentative avant l’appel externe. Une panne DB empêche
  l’envoi. La clé unique et l’empreinte auteur/document/contenu interdisent un
  deuxième envoi pour la même tentative. Aucune transaction ne couvre l’appel.
- Le formulaire conserve la tentative en `sessionStorage`, par utilisateur et
  document, jusqu’au succès ou à une nouvelle tentative explicitement préparée
  après un échec certain. Recharger cet onglet conserve la clé et le texte.
  Fermer l’onglet, effacer son stockage ou changer d’appareil ne les conserve
  pas : vérifier l’historique avant tout nouvel envoi dans ces situations.
- `Envoyé` signifie accepté par Cloudflare, pas distribué. `Distribué` exige un
  événement réel. Un délai réseau, une réponse sans identifiant ou une panne de
  journal après acceptation donne `À vérifier`. Une réservation abandonnée passe
  visuellement à cet état après deux minutes. Aucun renvoi automatique.
- Les événements `delivered`, `deferred`, `bounced`, `rejected`, `failed` sont
  persistés dans `sent_email_events`, même avant le retour de `send()`. Leur ID
  est unique ; dates, expéditeur et destinataire contrôlent la réconciliation.
  Un état terminal ne régresse pas sous un événement tardif.
- Le hook `cloudflare:queue` acquitte après la transaction seulement. Une erreur
  provoque une reprise à 60 secondes, jusqu’à 10 reprises puis la file d’échec.
- Le journal conserve nom, type et taille du PDF, pas son contenu. Il n’ajoute
  ni stockage de fichiers ni téléchargement. Texte et métadonnées restent
  consultables après redémarrage, indépendamment des aperçus Cloudflare.

## Préparation distante — après validation de la cible

1. Vérifier avec `wrangler whoami` le compte réellement lié à
   `pos.microwest.ch`, le Worker `nuxt`, l’offre Workers Paid, l’accès à Email
   Sending et le quota quotidien effectif du domaine. Ne pas déduire le quota
   du seul montant de l’abonnement.
2. Comparer les variables de production `NUXT_MAIL_FROM` / `NUXT_MAIL_REPLY_TO`
   et les valeurs compilées `MAIL_FROM` / `MAIL_REPLY_TO` avec
   `info@microwest.ch`. Si elles diffèrent, arrêter et confirmer l’identité
   avant de changer le binding ou le domaine.
   Wrangler déclare explicitement les deux variables `NUXT_MAIL_*` pour que
   Nuxt les lise à l’exécution, indépendamment de l’environnement de build.
3. Activer **Email Sending** pour `microwest.ch`, vérifier les enregistrements
   d’authentification sortante demandés. Conserver les MX entrants existants et
   ne pas activer Email Routing. Toute collision DNS doit être examinée avant
   écriture, notamment SPF et sous-domaine de retour.
4. Créer les queues `pos-email-events` et `pos-email-events-dlq` sur ce compte.
   Après validation de compte, les commandes prévues sont :

   ```bash
   npx wrangler queues create pos-email-events-dlq
   npx wrangler queues create pos-email-events
   ```

5. Dans les abonnements aux événements Cloudflare, sélectionner la source
   **Email Sending**, la zone et le domaine `microwest.ch`, les cinq types
   `cf.email.sending.message.{delivered,deferred,bounced,rejected,failed}`,
   destination `pos-email-events`. Ne pas abonner d’autres domaines à cette
   queue. Le consommateur est le Worker Nuxt, aucun webhook ni second Worker.
6. Le binding `EMAIL` est limité à `allowed_sender_addresses` dans
   `wrangler.json`. `remote: false` protège les essais locaux et ne désactive
   pas le service dans le Worker déployé. Ne pas activer d’envois distants lors
   de tests locaux. Conserver les anciens secrets pour un retour arrière
   manuel ; aucune révocation n’est incluse ici.

## Base de données et ordre de bascule

Suivre intégralement [le runbook](./database-migrations.md), notamment
`DB_REMOTE_TARGETS`, confirmation du hostname, token adapté, inventaire réel,
dump, clone et restauration testée. La **première baseline de production exige
une autorisation séparée**. Ne pas déclarer une cible de production comme test.

`docs/sql/cloudflare-email-additive.sql` est un candidat de revue et une fixture
SQLite pour les tests, **pas une migration de production approuvée**. Il ne doit
pas être appliqué directement à Turso. Après adoption de la vraie baseline :

1. Générer la migration Drizzle nommée depuis le schéma complet ; isoler les
   deux nouvelles tables et leurs index des travaux Shopify/rapports.
2. Examiner SQL et snapshot, répéter l’application sur clone restauré et
   constater zéro migration restante au deuxième passage.
3. Consigner version Worker précédente et référence de restauration ; appliquer
   uniquement les ajouts revus via `migrate-safe.mjs` avec les confirmations.
4. Vérifier schéma et intégrité **avant** de déployer le nouveau Worker.
5. Tester la nouvelle version puis promouvoir ; pas de `db:push` distant,
   création de tables au démarrage ou bascule automatique vers Resend.

Un rollback est une décision opérateur explicite vers la version conservée.
Les nouvelles tables restent en place. Attention : l’ancien Worker peut encore
utiliser Resend ; décider explicitement de son usage, ne pas relancer une
tentative Cloudflare incertaine. La queue peut être suspendue le temps du
diagnostic, sans supprimer ses messages ; restaurer ensuite le consommateur.

## Vérification et exploitation

```bash
npm run cf-typegen
npm run lint
npm run typecheck
npm run test
npm run security:regression
npm run build
```

Contrôler `.output/server/wrangler.json` : binding restreint `EMAIL`, consommateur et
file d’échec. Pour `npm run preview`, utiliser uniquement une base jetable et
les valeurs locales, jamais les credentials de production. Le simulateur mail
ne prouve ni la réception Internet ni les événements réels.

Avant bascule complète, obtenir une **adresse de test explicitement choisie**
et envoyer un document d’essai. Vérifier le PDF reçu, `Reply-To`, le texte, le
journal `/inbox` puis `sent_email_events` et le passage réel à `Distribué`.
Ne pas choisir un destinataire vérifié d’Email Routing : ces livraisons ne
publient pas d’événement Email Sending. Vérifier desktop 1440×900 et mobile.

Surveiller la profondeur et l’âge de la queue, la file d’échec et les erreurs
structurées `email-events`. Après correction, rejouer la file d’échec vers la
queue source avec les outils Cloudflare, sans changer les IDs d’événements.
Ils sont dédupliqués. Ne jamais acquitter/supprimer avant persistance.

Un message `À vérifier` n’autorise pas un renvoi. Pour
`ACCEPTED_JOURNAL_UPDATE_FAILED`, les logs conservent seulement ID local et ID
Cloudflare : comparer aux événements et aux logs d’envoi pour une
réconciliation manuelle autorisée. Si l’identifiant Cloudflare n’a jamais été
reçu, rechercher l’envoi côté Cloudflare avec destinataire et date, puis faire
confirmer la réception si nécessaire. Aucun rapprochement heuristique ni
renvoi automatique ne risque de produire un doublon.

## Vérifications locales de cette migration

- Lint, typecheck, 166 tests unitaires, 59 tests d’intégration, 9 tests de
  sécurité et régressions de sécurité réussis (dont 36 tests ciblés mail).
- Schéma complet vérifié sur une base libSQL jetable : intégrité, clés
  étrangères et invariants valides. Le candidat SQL est comparé au schéma
  Drizzle dans les tests ; ceci n’établit **pas** la baseline de production.
- Build Nitro Cloudflare et aperçu Wrangler : binding `EMAIL` restreint,
  variables `NUXT_MAIL_*`, consommateur et file d’échec présents.
- Envoi simulé depuis le formulaire : PDF A4, texte et `Reply-To` vérifiés
  dans le simulateur. Injection d’un événement dans le Worker compilé :
  acquittement explicite après persistance et statut `delivered` relu en DB.
- Consultation après redémarrage, affichage desktop 1440×900 et mobile
  390×844, formulaire normal et résultat incertain contrôlés. Dates en heure
  suisse côté serveur et navigateur ; aucun avertissement d’hydratation sur
  les deux vues finales de l’historique.
- Panne d’écriture après acceptation simulée, rechargement de la page, puis
  plusieurs vérifications : même ID local, `replayed: true`, état `unknown`,
  champs verrouillés, aucun nouvel appel au simulateur d’envoi.
- Permissions vérifiées par HTTP dans le Worker : anonyme 401, opérateur 403
  sur historique/détail mais 200 sur sa vérification d’envoi ; administrateur
  200 sur historique et détail.
- Restent non validés : baseline et restauration de production, migration
  versionnée définitive, offre/quota réels, configuration des queues et de
  l’abonnement distant, réception d’un mail réel et événement réel associé.

## Références officielles

- [Constructeur et erreurs du binding Workers](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/)
- [Événements de livraison](https://developers.cloudflare.com/email-service/platform/event-subscriptions/)
- [Limites Email Sending](https://developers.cloudflare.com/email-service/platform/limits/)
- [Configuration des bindings](https://developers.cloudflare.com/email-service/configuration/send-bindings/)
