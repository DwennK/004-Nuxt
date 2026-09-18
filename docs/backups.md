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

## Format et garanties

- Export SQL du schéma et des données, dans **une transaction de lecture**.
  Les entiers 64 bits, BLOBs, textes contenant NUL, rowids, séquences
  AUTOINCREMENT, index, vues et triggers sont conservés. Les tables virtuelles
  ne sont pas supportées : leur présence fait échouer l’export explicitement.
- Les triggers sont restaurés après les données. Les valeurs sont sérialisées
  par SQLite, sans conversion numérique JavaScript.
- Envoi progressif par sessions Dropbox, avec blocs de 4 Mio. Aucun fichier
  n’est publié avant la fin réussie de l’export. Contrôle de la taille et du
  `content_hash` Dropbox (SHA-256 par bloc puis SHA-256 des empreintes concaténées).
- Un verrou persistant empêche les exécutions simultanées. Les exécutions cron
  sont dédupliquées par date UTC ; un échec peut être relancé manuellement.
  Un verrou abandonné expire après 15 minutes et devient un échec visible.
- Budget d’export : 10 minutes / 256 Mio SQL. Une erreur réseau, un timeout de
  transaction Turso ou un dépassement n’est jamais marqué comme un succès.
  Pour une base dépassant ces limites, prévoir un job dédié/Workflow.
- Les copies ne sont jamais écrasées ni supprimées automatiquement. Surveiller
  l’espace Dropbox. Le POS affiche les 20 derniers essais et le dernier succès.
- Un succès certifie le transfert et son intégrité, pas une restauration réelle.
  Les erreurs sont visibles dans le POS et les échecs cron dans Cloudflare ;
  cette version n’envoie pas de notification externe.

L’export comprend toutes les données et les comptes du POS, ainsi que les jetons
Dropbox **chiffrés**. Les secrets Cloudflare et les fichiers externes à Turso ne
sont pas inclus. Le fichier SQL lui-même n’est pas chiffré par l’application.

## Restauration isolée

Télécharger le `.sql`, puis utiliser un fichier SQLite **neuf** :

```sh
sqlite3 restauration.db < sauvegarde.sql
sqlite3 restauration.db 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

Contrôler les nombres de lignes et les données métier avant tout remplacement
de production. Désactiver `backup_settings.daily_enabled` et effacer
`refresh_token_encrypted` dans une copie de développement pour éviter qu’une
copie restaurée réutilise le compte Dropbox de production. Aucune restauration
destructive n’est exposée dans le POS.

Références : [OAuth Dropbox](https://developers.dropbox.com/oauth-guide),
[content hash Dropbox](https://www.dropbox.com/developers/reference/content-hash),
[cron Cloudflare](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
