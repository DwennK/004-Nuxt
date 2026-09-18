# Sauvegardes Turso vers Dropbox

L’onglet **Paramètres → Sauvegardes** est réservé aux administrateurs. Il permet
de connecter un compte Dropbox, de lancer une sauvegarde et d’activer le cron
quotidien du Worker existant. Aucun navigateur ni ordinateur ne doit rester
allumé pour le cron. Pour une sauvegarde manuelle, garder la page ouverte.

## Mise en service

1. Appliquer la migration `20260918133216_dropbox_backups` selon
   `docs/database-migrations.md` (autorisation et sauvegarde préalables pour la
   production). Elle ajoute uniquement deux tables et trois index.
2. Créer une application Dropbox **Scoped access / App folder**, avec uniquement
   `account_info.read` et `files.content.write`. Enregistrer l’URL exacte
   `https://<domaine-du-pos>/api/settings/backups/dropbox/callback` dans les
   redirect URIs de l’application Dropbox.
3. Configurer les secrets serveur `NUXT_DROPBOX_APP_KEY`,
   `NUXT_DROPBOX_APP_SECRET`, `NUXT_DROPBOX_REDIRECT_URI` et
   `NUXT_BACKUP_ENCRYPTION_KEY` sur le Worker. La clé de chiffrement doit contenir
   32 octets aléatoires encodés en base64 (`openssl rand -base64 32`). Conserver
   une copie de cette clé hors de Turso. Ne jamais la versionner.
4. Déployer le Worker et vérifier dans Cloudflare le cron `0 2 * * *`.
   Il s’exécute à 02:00 UTC, donc 03:00 CET / 04:00 CEST. Le cron n’effectue aucun
   export tant que le compte n’est pas connecté et l’option quotidienne activée.
5. Depuis le POS, cliquer **Connecter Dropbox**, puis **Sauvegarder maintenant**.
   Vérifier le fichier dans le dossier de l’application, tester sa restauration
   sur une base isolée, puis activer la sauvegarde quotidienne.

Les comptes Dropbox sont reliés par OAuth avec un refresh token chiffré en
AES-GCM dans Turso. Les secrets de l’application et la clé de chiffrement restent
dans les secrets Cloudflare. Une reconnexion désactive le cron fonctionnel :
l’administrateur choisit explicitement de le réactiver pour le nouveau compte.
Déconnecter le compte efface le jeton local et arrête les sauvegardes ; cela ne
supprime aucun fichier Dropbox. L’autorisation peut aussi être révoquée depuis
les applications connectées dans Dropbox.

## Export natif Turso et garanties

Les nouvelles sauvegardes sont des fichiers SQLite binaires **`.db`**. Les anciens
exports `.sql` restent conservés dans Dropbox et visibles dans l’historique.
Aucune migration ni nouvelle variable secrète n’est nécessaire pour ce changement.

Le Worker utilise la méthode de `turso db export` : `GET /info`, puis
`GET /export/{generation}` et `GET /sync/{generation}/{start}/{end}` avec le jeton
de la base. La référence est le [client officiel Turso, révision
b538e422](https://github.com/tursodatabase/turso-cli/blob/b538e422cf012043c49468d55b73aec09ea598be/internal/turso/tursoServer.go).
La [documentation CLI](https://docs.turso.tech/cli/db/export) prévient qu’un
snapshot seul peut être ancien : le journal WAL doit également être récupéré.

- L’export conserve les pages SQLite natives, les métadonnées, les index et les
  données. Il ne reconstruit pas les tables depuis du SQL.
- Les pages du WAL sont fusionnées selon les transactions **commitées** et la
  taille finale de la base. Une transaction incomplète est ignorée. Le résultat
  est autonome : aucun fichier `.db-wal` ou `.db-shm` n’est requis.
- Le protocole natif pris en charge est libSQL/SQLite à pages de 4096 octets,
  celui de cette base. Un autre moteur ou format est refusé explicitement.
- Une erreur HTTP, une page manquante ou un journal tronqué ne sont jamais
  assimilés à un export terminé. Un changement de génération est retenté.
- **Avant tout envoi**, SQLite (WASM, empaqueté dans le Worker) exécute
  `PRAGMA integrity_check` et `PRAGMA foreign_key_check`. La présence du nouvel
  identifiant de sauvegarde dans `backup_runs` prouve que l’export contient une
  transaction créée au démarrage du job. Un snapshot ancien est retenté au plus
  trois fois, puis déclaré en échec.
- Les tentatives manuelles et le cron suivent exactement ce même parcours.
- Transfert Dropbox par blocs de 4 Mio ; publication seulement après la fin
  complète, avec vérification de taille et de `content_hash`.
- Un verrou persistant empêche les exécutions simultanées ; déduplication du cron
  par date UTC et expiration des verrous abandonnés après 15 minutes.
- Budget : 10 minutes, fichier SQLite de **16 Mio** maximum et journal téléchargé
  de 256 Mio maximum. Cette limite mémoire laisse la place à la validation SQLite
  dans le Worker de 128 Mio. La base actuelle fait environ 9,6 Mio. Au-delà,
  prévoir un job avec stockage temporaire et davantage de mémoire ; l’export
  échoue explicitement, sans publier un fichier partiel.
- Aucune suppression automatique. Le POS affiche les 20 derniers essais et le
  dernier succès. Les erreurs restent visibles dans le POS et dans Cloudflare
  pour le cron ; aucune notification externe n’est envoyée.

Le fichier comprend toutes les données et comptes du POS, ainsi que le jeton
Dropbox **chiffré**. Il peut également contenir les espaces libres du fichier
SQLite natif. Les secrets Cloudflare et les fichiers externes à Turso ne sont
pas inclus. Le fichier `.db` n’est pas lui-même chiffré par l’application.

## Alerte persistante dans le POS

Pour les administrateurs, un échec non suivi d’une sauvegarde réussie affiche une
pastille rouge sur **Paramètres** et sur l’onglet **Sauvegardes**. La page affiche
la date, la cause connue et une indication de résolution. Lire la page ou
recharger le navigateur ne masque pas l’alerte ; une nouvelle tentative en cours
ne la masque pas non plus. Un succès ultérieur la retire des deux menus.

L’état est partagé entre ces surfaces et vérifié toutes les 60 secondes lorsque
le POS est visible, au retour sur la fenêtre, et toutes les 10 secondes sur la
page des sauvegardes lorsque le suivi est actif. Une requête de statut en échec
signale que l’état ne peut pas être confirmé, sans effacer le dernier échec connu.
Les tâches interrompues depuis plus de 15 minutes sont signalées via l’état
`interrupted` existant. Aucun acquittement, nouvelle table ou secret n’est ajouté.

Cette alerte concerne les échecs et interruptions enregistrés ainsi que
l’impossibilité de lire leur état. Elle n’est pas une notification système ou un
email et ne détecte pas un cron qui ne se serait jamais déclenché.

## Restauration isolée

Télécharger le `.db` dans un dossier isolé puis le vérifier directement :

```sh
sqlite3 sauvegarde.db 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

Aucune importation SQL n’est nécessaire. Travailler sur une copie du fichier
pour toute restauration de production. Contrôler les nombres de lignes et les
données métier avant un remplacement. Dans une copie de développement,
désactiver `backup_settings.daily_enabled` et effacer `refresh_token_encrypted`
pour éviter qu’elle réutilise le Dropbox de production. Aucune restauration
destructive n’est exposée dans le POS.

Pour les anciens `.sql`, créer d’abord une base SQLite **neuve** :

```sh
sqlite3 restauration.db < sauvegarde.sql
```

Références : [format SQLite et checkpoint WAL](https://sqlite.org/fileformat.html#wal_format),
[OAuth Dropbox](https://developers.dropbox.com/oauth-guide),
[content hash Dropbox](https://www.dropbox.com/developers/reference/content-hash),
[cron Cloudflare](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
