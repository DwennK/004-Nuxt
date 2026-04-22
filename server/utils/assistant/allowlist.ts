type AllowedTable = {
  description: string
  columns: Record<string, string>
  joins: string[]
}

export const assistantTableAllowlist = {
  customers: {
    description: 'Clients, identités de base et localisation légère pour le suivi commercial.',
    columns: {
      id: 'Identifiant client.',
      first_name: 'Prénom du client.',
      last_name: 'Nom du client.',
      company_name: 'Société du client si applicable.',
      city: 'Ville du client.',
      postal_code: 'Code postal du client.',
      created_at: 'Date de création.',
      updated_at: 'Date de dernière mise à jour.'
    },
    joins: [
      'customers.id = tickets.customer_id',
      'customers.id = documents.customer_id',
      'customers.id = payments.customer_id'
    ]
  },
  catalog_items: {
    description: 'Catalogue produits, réparations et services.',
    columns: {
      id: 'Identifiant article.',
      name: 'Nom commercial.',
      sku: 'SKU commercial.',
      type: 'Type produit|repair|service.',
      category: 'Catégorie métier.',
      brand: 'Marque.',
      model: 'Modèle.',
      service_kind: 'Nature du service.',
      keywords_json: 'Mots-clés internes sérialisés.',
      default_price: 'Prix TTC en centimes.',
      vat_rate: 'TVA en pourcentage.',
      is_active: 'Disponibilité active.'
    },
    joins: [
      'catalog_items.id = document_lines.catalog_item_id',
      'catalog_items.id = ticket_lines.catalog_item_id'
    ]
  },
  tickets: {
    description: 'Tickets opérationnels de réparation et support.',
    columns: {
      id: 'Identifiant ticket.',
      ticket_number: 'Numéro ticket.',
      customer_id: 'Client lié.',
      type: 'repair ou support.',
      status: 'Statut opérationnel.',
      brand: 'Marque de l’appareil.',
      model: 'Modèle de l’appareil.',
      opened_at: 'Date ouverture.',
      closed_at: 'Date fermeture.',
      created_at: 'Création.',
      updated_at: 'Mise à jour.'
    },
    joins: [
      'tickets.customer_id = customers.id',
      'tickets.id = ticket_events.ticket_id',
      'tickets.id = ticket_lines.ticket_id',
      'tickets.id = documents.ticket_id'
    ]
  },
  ticket_events: {
    description: 'Journal métier des événements de tickets.',
    columns: {
      id: 'Identifiant événement.',
      ticket_id: 'Ticket lié.',
      kind: 'Type d’événement.',
      label: 'Libellé métier.',
      note: 'Note événement si non sensible.',
      metadata_json: 'Métadonnées JSON sérialisées.',
      occurred_at: 'Date métier.',
      created_at: 'Date de création.'
    },
    joins: [
      'ticket_events.ticket_id = tickets.id'
    ]
  },
  documents: {
    description: 'Documents commerciaux: devis, commandes et factures.',
    columns: {
      id: 'Identifiant document.',
      document_number: 'Numéro document.',
      type: 'Type commercial.',
      status: 'Statut commercial.',
      customer_id: 'Client lié.',
      ticket_id: 'Ticket lié si présent.',
      issued_at: 'Date d’émission.',
      subtotal: 'Sous-total HT en centimes.',
      tax_amount: 'Montant TVA en centimes.',
      total: 'Total TTC en centimes.',
      created_at: 'Création.',
      updated_at: 'Mise à jour.'
    },
    joins: [
      'documents.customer_id = customers.id',
      'documents.ticket_id = tickets.id',
      'documents.id = document_lines.document_id',
      'documents.id = payments.document_id'
    ]
  },
  document_lines: {
    description: 'Lignes de documents commerciaux.',
    columns: {
      id: 'Identifiant ligne.',
      document_id: 'Document parent.',
      catalog_item_id: 'Article lié.',
      label: 'Libellé de ligne.',
      quantity: 'Quantité entière.',
      unit_price: 'Prix unitaire TTC en centimes.',
      vat_rate: 'TVA en pourcentage.',
      line_total: 'Montant ligne en centimes.',
      category_hint: 'Indice de catégorie.'
    },
    joins: [
      'document_lines.document_id = documents.id',
      'document_lines.catalog_item_id = catalog_items.id'
    ]
  },
  ticket_lines: {
    description: 'Lignes estimées ou facturables rattachées aux tickets.',
    columns: {
      id: 'Identifiant ligne.',
      ticket_id: 'Ticket parent.',
      catalog_item_id: 'Article lié.',
      label: 'Libellé de ligne.',
      quantity: 'Quantité entière.',
      unit_price: 'Prix unitaire TTC en centimes.',
      vat_rate: 'TVA en pourcentage.',
      line_total: 'Montant ligne en centimes.',
      category_hint: 'Indice de catégorie.'
    },
    joins: [
      'ticket_lines.ticket_id = tickets.id',
      'ticket_lines.catalog_item_id = catalog_items.id'
    ]
  },
  payments: {
    description: 'Paiements et états d’encaissement.',
    columns: {
      id: 'Identifiant paiement.',
      customer_id: 'Client lié si présent.',
      document_id: 'Document payé.',
      method: 'cash|card_twint|bank_transfer|stripe.',
      status: 'Statut du paiement: pending (en attente) | paid (encaissé) | refunded (remboursé) | cancelled (annulé).',
      amount: 'Montant en centimes.',
      paid_at: 'Date du paiement.',
      created_at: 'Création.',
      updated_at: 'Mise à jour.'
    },
    joins: [
      'payments.document_id = documents.id',
      'payments.customer_id = customers.id'
    ]
  },
  smartphone_stocks: {
    description: 'Stock smartphone et état vendu/non vendu.',
    columns: {
      id: 'Identifiant stock.',
      model: 'Modèle.',
      sku: 'SKU si présent.',
      capacity: 'Capacité.',
      stocked_at: 'Date d’entrée en stock.',
      sold: 'Indique si vendu.'
    },
    joins: []
  },
  employees: {
    description: 'Employés et statut d’activité.',
    columns: {
      id: 'Identifiant employé.',
      first_name: 'Prénom.',
      last_name: 'Nom.',
      color: 'Couleur d’affichage.',
      vacation_days_per_year: 'Quota annuel.',
      is_active: 'Actif ou non.',
      created_at: 'Création.',
      updated_at: 'Mise à jour.'
    },
    joins: [
      'employees.id = vacation_entries.employee_id'
    ]
  },
  vacation_entries: {
    description: 'Demandes et suivis de vacances.',
    columns: {
      id: 'Identifiant demande.',
      employee_id: 'Employé lié.',
      start_date: 'Début.',
      end_date: 'Fin.',
      type: 'full_day|half_day_am|half_day_pm.',
      status: 'pending|approved|rejected.',
      business_days: 'Nombre de jours ouvrés.',
      created_at: 'Création.',
      updated_at: 'Mise à jour.'
    },
    joins: [
      'vacation_entries.employee_id = employees.id'
    ]
  },
  smartphone_reservation_requests: {
    description: 'Demandes de réservation smartphone agrégées.',
    columns: {
      id: 'Identifiant demande.',
      model: 'Modèle demandé.',
      storage: 'Capacité demandée.',
      requested_at: 'Date de demande.',
      status: 'pending|contacted|sold.'
    },
    joins: []
  }
} satisfies Record<string, AllowedTable>

export const assistantBlockedTables = new Set([
  'company_settings',
  '__drizzle_migrations',
  'sqlite_schema',
  'sqlite_master',
  'sqlite_temp_master'
])

export const assistantBlockedColumns = new Set([
  'phone',
  'email',
  'notes',
  'serial_number',
  'imei',
  'access_code',
  'sim_code',
  'issue_description',
  'internal_notes',
  'iban',
  'bank_name',
  'vat_number',
  'logo_data_url',
  'footer_notes',
  'address',
  'country_code',
  'website',
  'payment_terms'
])

export const assistantAllowedTables = new Set(Object.keys(assistantTableAllowlist))
export const assistantAllowedColumnsByTable = Object.fromEntries(
  Object.entries(assistantTableAllowlist).map(([tableName, table]) => {
    return [tableName, new Set(Object.keys(table.columns))]
  })
) as Record<string, Set<string>>

export function buildAssistantSchemaContext() {
  const tableBlocks = Object.entries(assistantTableAllowlist).map(([tableName, table]) => {
    const columns = Object.entries(table.columns)
      .map(([column, description]) => `  - ${column}: ${description}`)
      .join('\n')

    const joins = table.joins.length
      ? table.joins.map(join => `  - ${join}`).join('\n')
      : '  - Aucun join recommandé.'

    return [
      `Table ${tableName}: ${table.description}`,
      'Colonnes autorisées:',
      columns,
      'Joins recommandés:',
      joins
    ].join('\n')
  })

  return [
    'Base SQLite/Turso interne. Tous les montants monétaires sont stockés en centimes entiers.',
    'Utiliser uniquement les tables et colonnes autorisées ci-dessous.',
    'Toujours qualifier les colonnes avec un alias ou le nom de table.',
    'Ne jamais utiliser SELECT *.',
    'Ne jamais utiliser les colonnes bloquées suivantes: '
    + [...assistantBlockedColumns].sort().join(', ') + '.',
    '',
    ...tableBlocks
  ].join('\n')
}
