# Turso : avant / après, 10 ouvertures de chaque page

Rapport du 11 septembre 2026 — mesures locales réalisées avant déploiement.

**Sur le même jeu de test, les 32 pages ouvertes chacune 10 fois passent de 7 811 042 270 à 2 333 170 lignes lues : une baisse de 99,97 %.**

Les lectures SQL ont été mesurées avec le compteur natif libSQL `rows_read`. Les totaux par page sont une simulation construite à partir de ces mesures et des appels du programme. **Ce ne sont pas des relevés de consommation de ta base Turso en production.**

Le jeu local contient **9 852 documents, 14 365 lignes de document, 9 851 paiements, 180 clients, 45 téléphones et 45 réservations**. Les autres modules sont peu remplis : 3 articles de catalogue, 1 dossier, 1 employé, 1 absence, 1 utilisateur et aucun e-mail. Le gain des modules peu remplis ne prédit donc pas leur coût avec un historique important.

Chaque visite correspond à un rechargement complet de la page avec une session administrateur déjà connectée, puis un départ avant 15 secondes. Les lectures de contrôle utilisateur sont incluses ; les fiches incluent aussi leur présence et sa libération. Les recherches, changements de filtre, exports, créations, encaissements et renouvellements de présence sont des actions supplémentaires. La date est fixée au 11 septembre 2026, avec les paramètres initiaux de chaque écran.

Voici le total des **lignes lues pour 10 visites**, et non pour une seule ouverture :

| Page | Avant | Après | Baisse |
| --- | ---: | ---: | ---: |
| Accueil / comptoir | 98 850 | 450 | 99,54 % |
| Documents — liste complète | 1 957 298 700 | 1 876 640 | 99,90 % |
| Fiche facture | 3 980 | 2 190 | 44,97 % |
| Impression document | 190 | 190 | 0 % |
| Nouveau document | 3 650 | 1 860 | 49,04 % |
| Dossiers — liste | 110 | 110 | 0 % |
| Fiche dossier | 320 | 300 | 6,25 % |
| Modifier un dossier | 3 960 | 2 170 | 45,20 % |
| Impression dossier | 190 | 190 | 0 % |
| Nouveau dossier | 3 650 | 1 860 | 49,04 % |
| Clients — liste | 3 650 | 560 | 84,66 % |
| Fiche client avec historiques | 27 296 900 | 15 110 | 99,94 % |
| Nouveau client | 10 | 10 | 0 % |
| Catalogue — onglet Articles | 170 | 150 | 11,76 % |
| Vente rapide — ouverture | 3 650 | 560 | 84,66 % |
| Paiements — mois courant | 4 850 | 4 850 | 0 % |
| Rapports — écran initial | 3 882 615 890 | 320 440 | 99,99 % |
| Fin de journée | 1 943 702 290 | 104 860 | 99,99 % |
| Stock téléphones | 470 | 130 | 72,34 % |
| Réservations téléphones | 470 | 280 | 40,43 % |
| Vacances | 110 | 50 | 54,55 % |
| Mails envoyés — liste vide | 30 | 30 | 0 % |
| Paramètres utilisateurs | 40 | 40 | 0 % |
| Paramètres entreprise | 30 | 30 | 0 % |
| Modèles SMS | 30 | 30 | 0 % |
| Paramètres interface | 10 | 10 | 0 % |
| Assistant — sans question | 10 | 10 | 0 % |
| Liste des jeux | 10 | 10 | 0 % |
| Un jeu | 10 | 10 | 0 % |
| Outil MobileSentrix — ouverture | 20 | 20 | 0 % |
| Import Shopify — non configuré | 20 | 20 | 0 % |
| Connexion — visite anonyme | 0 | 0 | — |
| **Total : 320 visites** | **7 811 042 270** | **2 333 170** | **99,97 %** |

La fiche facture utilise le document 9852 : total 108,10 CHF, acompte 30 CHF et solde 78,10 CHF. La fiche client utilise le client 1 et ses historiques. Les listes restent sur leur première page. Les paiements couvrent le 1 au 11 septembre. Le stock affiche tous les statuts et les réservations affichent les 15 demandes en attente. Le nouveau document est ouvert sans dossier prérempli. La connexion est mesurée sans soumission du formulaire.

L’accueil `/` redirige vers `/comptoir` : il est compté une seule fois. Les 5 routes de redirection et les 2 composants de structure ne sont pas des écrans supplémentaires. Les redirections vers les paramètres et les imports reprennent le coût de leur destination ; les éventuels rechargements intermédiaires ne sont pas mesurés. L’ouverture directe d’un article via une redirection peut ajouter sa lecture de détail.

Certaines utilisations méritent une comparaison séparée. Les cinq premières lignes ci-dessous sont 10 ouvertures avec le filtre indiqué. Les quatre suivantes sont 10 actions depuis une page déjà ouverte. La dernière comprend 10 ouvertures de Rapports avec consultation du classement. Ces variantes ne sont pas ajoutées au total précédent.

| Variante | Avant | Après |
| --- | ---: | ---: |
| Documents — devis (aucun dans ce jeu) | 30 | 100 |
| Documents — commandes | 689 700 | 370 |
| Documents — factures | 1 957 101 160 | 1 872 900 |
| Documents — à encaisser | 1 943 996 430 | 1 479 820 |
| Paiements — toutes dates | 297 050 | 297 050 |
| Recherche globale « QA » | 2 959 230 | 198 990 |
| Suggestions clients « Atelier » | 3 840 | 2 040 |
| Suggestions articles « Coque » | 80 | 50 |
| Export CSV des 45 réservations | 460 | 460 |
| Rapports + ouverture du classement Clients/Articles | 3 882 615 890 | 447 320 |

Le cas des devis vides augmente de 30 à 100 lectures pour 10 visites : le nouveau calcul a un petit coût de démarrage. Les paiements et les impressions étaient déjà peu coûteux dans ces scénarios et restent inchangés. Un export complet conserve la lecture de toutes les lignes exportées.

Les classements de Rapports restent disponibles et sont chargés au clic. Même en les consultant, le coût passe de 3 882 615 890 à 447 320 lectures pour 10 parcours. Le gain ne dépend donc pas uniquement du chargement différé. Les compteurs des trois onglets du catalogue restent présents dès son ouverture.

La cause principale était le recalcul des paiements et des soldes, répété pour de nombreux documents dans les résumés et rapports. Les calculs partagés et les index évitent ces parcours répétés. Les listes de suggestions utilisent maintenant des requêtes adaptées ; les téléphones sont paginés côté serveur ; les vacances regroupent leurs lectures. Les règles de facturation, les acomptes, les paiements, les totaux et les exports ont été conservés.

Ton extrait Turso montrait déjà **628 millions de lectures en 22 exécutions** pour le seul résumé des documents. C’est une observation de production distincte de ce benchmark : les données, paramètres et regroupements du tableau Turso ne permettent pas de convertir directement ce chiffre en coût exact de 10 pages. Les anciennes requêtes coûteuses n’ont pas été relancées en production pour établir ce rapport.

Le forfait Free public annonce **500 millions de lignes lues et 10 millions de lignes écrites par mois**, avec 5 Go de stockage. [Tarifs officiels Turso, vérifiés le 11 septembre 2026](https://turso.tech/pricing).

À titre de scénario arithmétique, refaire exactement ces 320 visites chaque jour pendant 31 jours, sur ce même jeu inchangé, représenterait **72 328 270 lectures après correction**, soit environ **14,5 %** des 500 millions. Cela exclut les variantes, les durées de consultation prolongées, les écritures, les imports et l’activité d’autres bases : ce n’est pas une prévision mensuelle ni une garantie de rester sous le plafond.

Les résultats « après » supposent **le nouveau code et les 11 nouveaux index**. Au moment de la mesure, le code et les index n’étaient pas encore appliqués en production. La construction des index consomme elle-même des lectures et écritures, à compter séparément. La consommation déjà enregistrée ne sera pas effacée par les correctifs. La confirmation du forfait suffisant demandera un relevé d’usage réel après déploiement, avec le nombre de postes et le trafic habituels.

La comparaison utilise le code avant au commit `324527a4515d72609a121b3f9c2b44f4887fded1`, puis un instantané du code corrigé local. Deux copies des mêmes données sont utilisées ; les 11 nouveaux index sont retirés uniquement de la copie avant. Les SQL et paramètres proviennent des fonctions serveur réelles. Les lectures métier sans mutation ont été exécutées une fois puis multipliées par 10 ; les cycles de présence ont réellement été exécutés 10 fois avec libération entre les visites. Il ne s’agit pas de 320 visites automatisées dans un navigateur.

Le coût de l’authentification est une lecture mesurée par vérification utilisateur, ajoutée selon le nombre d’appels de chaque page : un contrôle au rechargement complet, puis un contrôle par API. Une navigation interne sans rechargement complet peut éviter le premier. Une page de dossier laissée ouverte renouvelle sa présence toutes les 15 secondes : ce coût dépend de la durée et du nombre de postes, et n’entre pas dans les visites brèves ci-dessus. Les rafraîchissements déclenchés par un retour au premier plan ou une reconnexion réseau ne sont pas inclus.

Le compteur est `LIBSQL_STMTSTATUS_ROWS_READ`, lu via `sqlite3_stmt_status(..., 1025, ...)`, celui utilisé par libSQL Server. Il compte le travail de lecture du moteur, y compris certains parcours intermédiaires ; il ne correspond ni au nombre de résultats affichés ni au nombre d’instructions SQL. [Source officielle du compteur côté serveur](https://github.com/tursodatabase/libsql/blob/d6c75af6353bb1c34985399608e37cd272a35aa1/libsql-server/src/connection/program.rs#L264).

Le banc utilise SQLite 3.47.0 / libSQL 0.2.3, source `d6c75af6353bb1c34985399608e37cd272a35aa1`, avec les mêmes options pour avant et après. Le module natif du projet indique SQLite 3.45.1 et la version serveur Turso n’a pas été vérifiée. Les versions, données, index et statistiques de planification peuvent modifier les plans et donc les compteurs. Aucune instruction mesurée n’a atteint la saturation du compteur.

Les 16 comparaisons de réponses financières sont conformes. Pour le résumé des rapports, les seuls champs neutralisés dans la comparaison sont les classements maintenant servis séparément ; leur propre réponse a aussi été comparée. Le nombre de lignes retournées par chaque SQL capturé correspond à celui de son rejeu dans le moteur de mesure. Le compteur a passé 20 vérifications ciblées. La validation des correctifs comprend également 586 tests, le lint, le contrôle des types, le build Cloudflare et des vérifications navigateur sur ordinateur et mobile.

Les chiffres Mails concernent une boîte vide : une boîte remplie charge aussi le premier message. Shopify est non configuré dans le jeu de test : ses lectures d’annotations de commandes ne sont pas incluses. Les recherches fournisseur, les prompts de l’assistant et les mutations métier sont hors de ce scénario d’ouverture. Les requêtes contenant une recherche partielle, les totaux exacts et les pages éloignées peuvent encore parcourir beaucoup de données.

Le [CSV complet](query-reads-comparison.csv) contient les 32 lignes et leur total. Les traces SQL, compteurs, scripts et métadonnées du banc sont archivés localement hors du dépôt. La [note technique des correctifs](query-performance.md) décrit le périmètre et la migration.
