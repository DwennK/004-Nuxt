# SAV dans les dossiers

Un **SAV** est un document opérationnel lié au dossier existant, numéroté `SAV-…`.
Depuis « Documents liés », « Créer un SAV » reste disponible après clôture du dossier.
Il reprend le client et l’appareil ; la réparation concernée et le motif du retour sont obligatoires.
La référence commerciale d’origine est facultative et doit appartenir au même dossier/client.
Plusieurs SAV peuvent être créés pour le même dossier. Le dossier initial garde son statut.

Prise en charge : à déterminer, sous garantie, geste commercial ou payant.
Suivi : reçu, en diagnostic, en intervention, prêt, remis au client ou annulé.
La remise exige une prise en charge décidée et les travaux renseignés ; sa date est enregistrée côté serveur.
Le diagnostic et les travaux/pièces figurent sur le document A4 et le PDF joint aux e-mails.
Le SAV ne contient aucune ligne financière et ne peut recevoir aucun paiement.

Les opérateurs peuvent créer et suivre le SAV. La route de suivi dédiée ne permet de
modifier que les informations opérationnelles, avec la même réservation transactionnelle
que le dossier. Les droits de modification des documents commerciaux restent inchangés.

## Facturation payante

Depuis un SAV payant, créer un devis, une commande ou une facture.
Les documents partagent `documents.sav_id`, qui référence le SAV dans le même dossier.
Les contrôles de création de chaque étape et les acomptes sont limités à cette opération.
`NULL` continue à désigner la réparation initiale. L’encaissement, les listes et les
rapports utilisent cette même séparation. Le résumé commercial du dossier représente
la réparation initiale ; le détail du SAV présente les liens de sa facturation.
Un SAV avec des documents commerciaux ne peut changer de prise en charge ni être annulé.
Les références du dossier, du client et du SAV sont immuables sur ces documents.

Le menu Documents propose un filtre SAV. La liste des dossiers affiche « SAV en cours »
pour les dossiers ayant au moins un retour non remis/non annulé.

## Livraison

Appliquer la migration additive `20260917101011_sav_documents` avant le déploiement du code.
Elle ajoute `sav_id` (référence restrictive), `sav_details` (données JSON) et l’index du lien.
Les documents existants conservent `NULL` pour ces colonnes ; aucun paiement ni montant
n’est modifié. Suivre `docs/database-migrations.md` pour une cible distante.
Le push Git ne réalise ni la migration distante ni le déploiement.

Les tests d’intégration appliquent le SQL de migration sur une base jetable et couvrent
les retours multiples, le rejeu idempotent, les dossiers clôturés, les prises en charge,
les liens invalides, les soldes/acompte séparés et la conservation de la facture initiale.
