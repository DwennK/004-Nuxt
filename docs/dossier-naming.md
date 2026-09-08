# Dossiers clients et références DOS-

Le nom métier est **Dossier client** ; l'interface utilise **Dossiers clients** pour
la rubrique et **Dossier** dans les actions. Les identifiants techniques `ticket`,
les tables, les API et les routes `/tickets/{id}` restent inchangés. Les QR déjà
imprimés continuent donc à ouvrir le même dossier.

Les nouveaux numéros sont `DOS-N`. Le script ci-dessous convertit aussi les anciens
`TIC-N`, sans changer N, les identifiants, les relations ou les notes. La recherche
des dossiers et des documents liés accepte les deux préfixes. Les anciens papiers,
messages envoyés et fichiers archivés ne sont pas réécrits.

## Conversion

Simulation locale (aucune écriture par défaut) :

```sh
node scripts/db/rename-ticket-numbers.mjs --url file:/chemin/base-test.sqlite --environment test
node scripts/db/rename-ticket-numbers.mjs --url file:/chemin/base-test.sqlite --environment test --apply
```

Le rapport recense les correspondances, les formats invalides, les collisions et
l'évolution du compteur. Seuls les formats canoniques `TIC-N` et `DOS-N`, avec N
entier strictement positif dans la plage sûre JavaScript, sont acceptés.
Une anomalie bloque toute application. La relecture, la conversion et le compteur
partagent une transaction d'écriture. Un second passage ne modifie aucun numéro.
Le compteur conserve la plus grande valeur entre son état précédent et les numéros
existants ; le générateur tient également compte des deux préfixes.

## Mise en production, après autorisation

1. Identifier la cible dans `DB_REMOTE_TARGETS`, effectuer une sauvegarde et en
   vérifier la restauration. Préparer le Worker et conserver la référence du précédent.
2. Exécuter la simulation avec `--environment production`, `--confirm-target HOST`
   et `--allow-production-read`. Examiner les changements et résoudre les anomalies.
3. Suspendre les écritures de tous les postes et intégrations pendant la bascule.
   Appliquer avec `--apply --allow-production-write --backup-reference REFERENCE`
   et les mêmes paramètres de cible. La sauvegarde doit précéder cette commande.
4. Déployer le Worker préparé avant de reprendre les écritures, recharger les postes,
   puis relire les références. Rejouer la simulation et `db:verify` ; vérifier
   l'absence de `TIC-` dans les références, le compteur et les relations existantes.
5. Vérifier une création contrôlée en `DOS-`, les recherches avec les deux préfixes,
   un ancien QR et une impression. Surveiller les erreurs de création et de recherche.

En cas d'échec, conserver la suspension des écritures. La conversion SQL est
atomique ; si elle a été validée mais que la livraison échoue, privilégier une
correction du Worker. Un retour complet exige la restauration de la sauvegarde
et du Worker correspondant avant reprise, sans écraser des écritures intervenues
après la bascule.

## SMS et historique

Les anciens modèles SMS standards inchangés sont actualisés à la lecture et
enregistrés au nouveau format lors d'une sauvegarde des réglages. Un modèle dont
l'identifiant, le titre ou le corps a été personnalisé est conservé.
`{{dossier_number}}` est proposé ; `{{ticket_number}}` reste interprété.
Seuls les titres connus des événements automatiques sont adaptés à l'affichage :
les notes des employés et les communications archivées restent intactes.
