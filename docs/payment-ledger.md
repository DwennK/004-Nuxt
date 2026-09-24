# Encaissements, remboursements et annulations

Les montants sont des **centimes entiers signés**. Un encaissement conserve son
montant positif ; chaque remboursement est un nouveau mouvement négatif dans
`payments`, lié par `original_payment_id`. Les deux ont `status = 'paid'` : ce
statut signifie que le mouvement a été effectué. `kind` distingue `receipt` et
`refund`.

## Utilisation

Depuis les paiements du document courant, **Rembourser** permet de saisir le
montant total ou partiel, le moyen réellement utilisé, la date et le motif.
Cette action enregistre de l'argent déjà rendu au client ; elle ne déclenche
aucun remboursement auprès de Stripe, Shopify, TWINT ou d'une banque.

Deux effets sont explicites :

- **Rembourser et réduire le montant dû** : disponible sur la facture courante.
  Un ajustement TTC est enregistré séparément dans `document_credits`. Le total
  initial et les lignes de la facture sont conservés. Le cache
  `documents.credited_total` est actualisé par un trigger dans la transaction.
- **Corriger uniquement le règlement** : aucune réduction commerciale. Le
  montant rendu redevient dû. C'est aussi le mode disponible sur un devis ou
  une commande ; une réduction commerciale se traite depuis la facture.

**Annuler une saisie** sert uniquement à corriger un encaissement qui n'a pas eu
lieu. Elle conserve la ligne, la date d'annulation et le motif, avec le statut
`cancelled`. Elle retire la saisie des totaux à sa date d'origine et n'invente
aucune sortie de caisse. Si de l'argent a réellement été encaissé puis rendu,
il faut un remboursement.

Les remboursements et les encaissements auxquels ils se rapportent ne sont plus
modifiables ou supprimables. Un encaissement effectué ne peut plus être supprimé
par l'API : son annulation nécessite le parcours avec motif. Les corrections
ordinaires d'un encaissement sans remboursement restent disponibles.

## SQL : mouvements d'argent

La vue `payment_movements` filtre les mouvements effectivement enregistrés
(`status = 'paid'`) et conserve leur signe. Une annulation ou un paiement en
attente n'y figure pas. Un remboursement ne change jamais le statut du paiement
initial en `refunded`.

```sql
SELECT
  COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS received_cents,
  COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) AS refunded_cents,
  COALESCE(SUM(amount), 0) AS net_cents
FROM payment_movements
WHERE paid_at >= :start_utc AND paid_at < :end_utc;
```

`:start_utc` et `:end_utc` sont les bornes UTC de la période commerciale en
Europe/Zurich. Pour une journée, calculer chaque borne dans ce fuseau, y compris
lors des changements d'heure ; ne pas supposer qu'une journée dure 24 heures.

```sql
SELECT method, SUM(amount) AS net_cents,
       SUM(CASE WHEN kind = 'receipt' THEN 1 ELSE 0 END) AS receipts,
       SUM(CASE WHEN kind = 'refund' THEN 1 ELSE 0 END) AS refunds
FROM payment_movements
WHERE paid_at >= :start_utc AND paid_at < :end_utc
GROUP BY method;
```

Un encaissement espèces de 39 CHF suivi d'un remboursement espèces de 39 CHF
donne `3900 + (-3900) = 0`. Un remboursement par carte laisse `+3900` en espèces
et `-3900` en carte. Un remboursement demain ne réécrit pas la caisse d'aujourd'hui.
`COUNT(*)` compte les mouvements, pas seulement les encaissements.

Ne pas sommer les mouvements après une jointure directe avec les lignes du
document : cela multiplierait les paiements par le nombre de lignes. Agréger
chaque ensemble avant de le joindre.

## Solde commercial

Le net encaissé n'est pas la valeur commerciale d'une facture. Pour une facture :
`montant après réduction = total - credited_total`. Le restant dû déduit ensuite
le net encaissé, avec reprise des acomptes des étapes précédentes. Réutiliser
`settlementCtes()` / `getDocumentSettlement()` pour cette reprise ; une simple
jointure sur l'identifiant de la facture oublie les acomptes de devis et commande.

Les classements et répartitions par catégorie présentent la valeur actuelle des
factures soldées ayant un mouvement sur la période. Ils ne constituent pas un
journal de caisse ni un chiffre d'affaires fiscal par date d'émission. Une
réduction globale est répartie proportionnellement entre les lignes, avec
arrondi cumulatif pour conserver les centimes. Les quantités d'origine restent
inchangées ; ce parcours ne gère pas un retour de stock.

Les ajustements TTC ne constituent pas un nouveau type de document « avoir » et
ne réécrivent pas les bases TVA de la facture d'origine. Un export comptable doit
traiter ces ajustements séparément, plutôt que sommer les factures d'origine
comme si aucune réduction n'avait eu lieu.

## Garanties et migration

La migration `20260924131419_payment_refund_ledger` est additive. Les paiements
existants deviennent des `receipt` ; aucun ancien statut n'est requalifié et aucun
remboursement historique n'est inventé (date, mode et réalité du flux inconnus).
Les anciens `refunded` restent exclus du journal comme avant.

La création du remboursement, de l'ajustement éventuel, du solde et de la preuve
d'idempotence est atomique et protégée par la réservation du dossier. Les
montants négatifs ne passent pas par les anciennes routes de saisie positive.
Les triggers vérifient les signes, le rattachement au paiement d'origine et le
plafond cumulé, même pour une écriture SQL directe. Les ajustements sont immuables.
Les routes exigent `financial:adjust`, un motif et une clé d'idempotence.

Déployer l'application après la migration additive. Ne pas utiliser le parcours
sur les anciennes versions de l'application. Conserver la sauvegarde vérifiée
et ne pas appliquer de migration descendante destructive.
