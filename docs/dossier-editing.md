# Réservation des dossiers et rappels de saisie

Un dossier correspond à un ticket et à tous ses documents, ou à un document autonome.
La consultation reste possible sur plusieurs postes. Une réservation distingue les
onglets, même lorsque le compte et le poste sont identiques. Le nom du poste est un
identifiant local au navigateur, conservé dans `localStorage` (`pos:station`).

Les formulaires réservent à leur ouverture ; les actions rapides réservent avant
l’écriture. La présence et le renouvellement sont regroupés toutes les 15 secondes
par dossier affiché dans un onglet, soit environ quatre requêtes applicatives par
minute. Le serveur expire une réservation après 90 secondes sans renouvellement.
Le nettoyage des présences expirées est limité à 50 lignes par requête.

La reprise de main nécessite une confirmation. Elle charge la version enregistrée
et invalide le jeton précédent. Le contrôle en transaction protège immédiatement
les données ; le bandeau de l’ancien poste suit au prochain contrôle de présence,
normalement sous 15 secondes. Une veille ou un onglet suspendu peut retarder le
bandeau et le son, mais ne permet pas un enregistrement avec un ancien jeton.

## Contrat HTTP

- `POST /api/dossiers/session` : `target: { kind: ticket|document|payment, id }`,
  `tabId` UUID, `station`, `action: observe|acquire|takeover|release`,
  `intent: edit|operate`, `dirty`, et le `token` détenu si disponible.
- `takeover` exige `expectedGeneration`, obtenu lors de la dernière observation.
  Deux demandes fondées sur la même génération ne peuvent pas toutes deux gagner.
- `standalone: true`, réservé aux administrateurs pour un document, réserve sa
  destination autonome avant un détachement. Le serveur contrôle également la source.
- Réponse : clé et révision du dossier, génération de réservation, propriétaire,
  autres présences et expiration. Le jeton secret n’est rendu qu’à son détenteur
  ou au gagnant d’une acquisition/reprise ; il est lié au compte et à l’onglet.
- Les GET de détail de ticket, document et paiement ajoutent
  `dossier: { key, revision }`. Leur contenu est encadré par deux lectures de la
  révision, avec au maximum trois tentatives pour éviter une version incohérente.
- Les écritures sur un dossier existant exigent `X-Dossier-Tab` et
  `X-Dossier-Proofs`, tableau JSON de `{ key, revision, token }` (64 maximum).
  La vérification et l’incrément de révision ont lieu dans la transaction métier.
- Une preuve manquante retourne 428 ; une preuve périmée, une reprise concurrente
  ou une révision dépassée retourne 409 avec un code `DOSSIER_*`. Aucun élément
  commercial ni incrément de révision n’est conservé si la transaction échoue.
- Les réponses d’écriture réussies exposent `X-Dossier-Revisions`. Le client
  `useDossierFetch()` transmet les preuves et accepte ces révisions. Utiliser ce
  client pour toute nouvelle action qui modifie un dossier existant.

Les paiements, statuts, notes, suppressions, créations commerciales liées et la
synchronisation manuelle des paiements Shopify sont contrôlés, quelle que soit
leur page d’origine. Les droits existants continuent à être vérifiés séparément.
Les traces de consultation/envoi (QR SMS et journal des e-mails) restent des
événements d’audit ; elles ne modifient pas l’écriture commerciale du dossier.

La suppression d’un ticket réserve aussi les destinations autonomes de ses
documents : le détachement effectué par la base est contrôlé dans la même
transaction et incrémente leurs révisions pour invalider toute ancienne preuve.

Les opérations financières conservent leurs clés d’idempotence. Après une réponse
perdue, « Vérifier la tentative » renvoie uniquement la tentative conservée avec
sa clé et sa preuve initiales, sur action explicite. Un résultat déjà enregistré
est rejoué sans deuxième paiement ; sinon les contrôles habituels s’appliquent.

## Saisies non enregistrées

Le bandeau apparaît dès une différence dans le formulaire, y compris pour les
lignes, les paiements et le panier de vente rapide. Le rappel intervient après cinq minutes sans modification, puis toutes
les cinq minutes. La coupure sonore dure jusqu’à l’enregistrement ou à l’abandon.
Une erreur de sauvegarde conserve les saisies et le rappel.

L’audio est activé lors d’une interaction, avec un bouton de test si le navigateur
le bloque. Aucune sonnerie n’est garantie sur un poste en veille ou sans son.
Les saisies restent uniquement dans la page : elles peuvent être copiées avant
rechargement, mais ne sont ni transférées entre postes ni récupérables après une
fermeture du navigateur. Les confirmations de départ restent actives.

## Vérification locale et livraison

Les tests SQLite utilisent des fichiers temporaires et appliquent le SQL de la
migration `20260907224739_dossier_edit_sessions`. Ils couvrent les conflits de
révision, droits, reprises, expirations, rattachements, transactions annulées et
rejeux financiers. Le minuteur possède des tests avec une horloge contrôlée.

Le test navigateur `tests/e2e/dossiers.spec.ts` est désactivé par défaut. Il exige
`POS_DOSSIER_E2E_URL=http://127.0.0.1:PORT`, un serveur isolé utilisant une base
jetable et le compte documenté dans `docs/dev-login.md`. La base doit contenir un
ticket `1` avec une ligne et une facture `1` liée à ce ticket avec une ligne.
Ce test modifie ces données. Il vérifie deux onglets, la reprise, la conservation
du brouillon, l’enregistrement, les contrôles HTTP, le rappel et les vues
1440 × 900 / 390 × 844. Il utilise le Chromium fourni par Playwright. Il crée aussi
des factures jetables et un compte de collègue temporaire (supprimé à la fin)
pour vérifier les comptes distincts, la coupure réseau et le paiement dont la
réponse est perdue.

La répétition locale de migration utilise une copie jetable représentant les
trois migrations précédentes : `db:migrate -- --apply`, puis `db:verify` et un
second plan `db:migrate` doivent réussir avec zéro migration restante. Cette
répétition ne prouve pas l'état du registre de migration distant.

La migration est additive et versionnée. Avant livraison, suivre
`docs/database-migrations.md`, vérifier la sauvegarde et appliquer la migration
autorisée avant le Worker. Les anciennes pages doivent être rechargées : leurs
écritures sans preuve seront refusées après le déploiement. Ne pas retirer ce
contrôle pour assurer une compatibilité avec les anciens onglets.

Surveiller les réponses `DOSSIER_*` et les erreurs de renouvellement après
livraison. Un retour au précédent Worker réintroduirait les écritures sans
réservation ; garder les tables et privilégier une correction du nouveau Worker.
La migration distante et le déploiement nécessitent une autorisation distincte.
