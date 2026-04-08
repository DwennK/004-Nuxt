import type { CatalogItemInput } from '~~/shared/types/pos'

type RepairIssueKey
  = | 'screen'
    | 'battery'
    | 'chassis'
    | 'back_glass'
    | 'rear_camera'
    | 'front_camera'
    | 'camera_lens'
    | 'charge_port'
    | 'earpiece'

type SourceIssueLabel
  = | 'Ecran'
    | 'Batterie'
    | 'Chassis'
    | 'Face arrière'
    | 'Face Arrière'
    | 'Caméra Arrière'
    | 'Caméra Avant'
    | 'Caméra arrière'
    | 'Lentille Caméra'
    | 'Port de charge'
    | 'Haut Parleur Oreille'

type RepairMatrixEntry = {
  model: string
  prices: Partial<Record<SourceIssueLabel, number>>
}

type IssueDefinition = {
  issueKey: RepairIssueKey
  issueLabel: string
  aliases: string[]
}

const issueDefinitions: Record<SourceIssueLabel, IssueDefinition> = {
  'Ecran': {
    issueKey: 'screen',
    issueLabel: 'Remplacement écran',
    aliases: ['ecran', 'screen', 'display', 'vitre', 'lcd', 'oled']
  },
  'Batterie': {
    issueKey: 'battery',
    issueLabel: 'Remplacement batterie',
    aliases: ['batterie', 'battery', 'autonomie']
  },
  'Chassis': {
    issueKey: 'chassis',
    issueLabel: 'Châssis / cadre',
    aliases: ['chassis', 'cadre', 'frame']
  },
  'Face arrière': {
    issueKey: 'back_glass',
    issueLabel: 'Face arrière',
    aliases: ['face arriere', 'arriere', 'dos', 'back glass']
  },
  'Face Arrière': {
    issueKey: 'back_glass',
    issueLabel: 'Face arrière',
    aliases: ['face arriere', 'arriere', 'dos', 'back glass']
  },
  'Caméra Arrière': {
    issueKey: 'rear_camera',
    issueLabel: 'Caméra arrière',
    aliases: ['camera arriere', 'camera', 'objectif arriere']
  },
  'Caméra Avant': {
    issueKey: 'front_camera',
    issueLabel: 'Caméra avant',
    aliases: ['camera avant', 'selfie', 'facetime']
  },
  'Caméra arrière': {
    issueKey: 'rear_camera',
    issueLabel: 'Caméra arrière',
    aliases: ['camera arriere', 'camera', 'objectif arriere']
  },
  'Lentille Caméra': {
    issueKey: 'camera_lens',
    issueLabel: 'Lentille caméra',
    aliases: ['lentille', 'vitre camera', 'camera lens']
  },
  'Port de charge': {
    issueKey: 'charge_port',
    issueLabel: 'Port de charge',
    aliases: ['port charge', 'charge', 'connecteur charge', 'usb', 'dock']
  },
  'Haut Parleur Oreille': {
    issueKey: 'earpiece',
    issueLabel: 'Haut-parleur oreille',
    aliases: ['haut parleur oreille', 'oreille', 'ecouteur', 'earpiece']
  }
}

const iphoneRepairMatrix: RepairMatrixEntry[] = [
  { model: '16 Pro Max', prices: { 'Ecran': 39900, 'Batterie': 16900, 'Face arrière': 21900, 'Port de charge': 19900 } },
  { model: '16 Pro', prices: { 'Ecran': 35900, 'Batterie': 16900, 'Face arrière': 21900, 'Port de charge': 19900 } },
  { model: '16 Plus', prices: { 'Ecran': 23900, 'Batterie': 16900, 'Face arrière': 21900, 'Port de charge': 19900 } },
  { model: '16E', prices: { 'Batterie': 16900, 'Face arrière': 16900, 'Port de charge': 19900 } },
  { model: '16', prices: { 'Ecran': 22900, 'Batterie': 16900, 'Face arrière': 16900, 'Port de charge': 19900 } },
  { model: '15 Pro Max', prices: { 'Ecran': 25900, 'Batterie': 15900, 'Chassis': 25900, 'Face arrière': 16900, 'Caméra Arrière': 19900, 'Caméra Avant': 19900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '15 Pro', prices: { 'Ecran': 22900, 'Batterie': 15900, 'Chassis': 25900, 'Face arrière': 16900, 'Caméra Arrière': 19900, 'Caméra Avant': 19900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '15 Plus', prices: { 'Ecran': 22900, 'Batterie': 15900, 'Chassis': 25900, 'Face arrière': 16900, 'Caméra Arrière': 19900, 'Caméra Avant': 19900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '15', prices: { 'Ecran': 17900, 'Batterie': 15900, 'Chassis': 25900, 'Face arrière': 16900, 'Caméra Arrière': 19900, 'Caméra Avant': 16900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '14 Pro Max', prices: { 'Ecran': 21900, 'Batterie': 15900, 'Chassis': 29900, 'Caméra Arrière': 19900, 'Caméra Avant': 19900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '14 Pro', prices: { 'Ecran': 19900, 'Batterie': 15900, 'Chassis': 29900, 'Caméra Arrière': 19900, 'Caméra Avant': 19900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '14 Plus', prices: { 'Ecran': 15900, 'Batterie': 15900, 'Chassis': 25900, 'Face arrière': 17900, 'Caméra Arrière': 19900, 'Caméra Avant': 19900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '14', prices: { 'Ecran': 13900, 'Batterie': 15900, 'Chassis': 25900, 'Face arrière': 17900, 'Caméra Arrière': 14900, 'Caméra Avant': 14900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '13 Pro Max', prices: { 'Ecran': 16900, 'Batterie': 14900, 'Chassis': 19900, 'Caméra Arrière': 19900, 'Caméra Avant': 19900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '13 Mini', prices: { 'Ecran': 15900, 'Batterie': 14900, 'Chassis': 19900, 'Caméra Arrière': 19900, 'Caméra Avant': 19900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '13 Pro', prices: { 'Ecran': 15900, 'Batterie': 14900, 'Chassis': 19900, 'Caméra Arrière': 19900, 'Caméra Avant': 19900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '13', prices: { 'Ecran': 14900, 'Batterie': 14900, 'Chassis': 19900, 'Caméra Arrière': 14900, 'Caméra Avant': 14900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '12 Pro Max', prices: { 'Ecran': 16900, 'Batterie': 13900, 'Chassis': 19900, 'Caméra Arrière': 19900, 'Caméra Avant': 19900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '12 Pro', prices: { 'Ecran': 16900, 'Batterie': 13900, 'Chassis': 19900, 'Caméra Arrière': 17900, 'Caméra Avant': 17900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '12 Mini', prices: { 'Ecran': 17900, 'Batterie': 13900, 'Chassis': 19900, 'Caméra Arrière': 14900, 'Caméra Avant': 14900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '12', prices: { 'Ecran': 14900, 'Batterie': 13900, 'Chassis': 19900, 'Caméra Arrière': 14900, 'Caméra Avant': 14900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 14900 } },
  { model: '11 Pro Max', prices: { 'Ecran': 15900, 'Batterie': 13900, 'Chassis': 19900, 'Caméra Arrière': 14900, 'Caméra Avant': 14900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 9900 } },
  { model: '11 Pro', prices: { 'Ecran': 14900, 'Batterie': 13900, 'Chassis': 19900, 'Caméra Arrière': 15900, 'Caméra Avant': 14900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 9900 } },
  { model: '11', prices: { 'Ecran': 12900, 'Batterie': 11900, 'Chassis': 19900, 'Caméra Arrière': 14900, 'Caméra Avant': 14900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 9900 } },
  { model: 'XS Max', prices: { 'Ecran': 14900, 'Batterie': 11900, 'Chassis': 19900, 'Caméra Arrière': 14900, 'Caméra Avant': 9900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 9900 } },
  { model: 'XS', prices: { 'Ecran': 13900, 'Batterie': 11900, 'Chassis': 19900, 'Caméra Arrière': 14900, 'Caméra Avant': 9900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 9900 } },
  { model: 'XR', prices: { 'Ecran': 11900, 'Batterie': 11900, 'Chassis': 19900, 'Caméra Arrière': 12900, 'Caméra Avant': 9900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 9900 } },
  { model: 'X', prices: { 'Ecran': 13900, 'Batterie': 11900, 'Chassis': 19900, 'Caméra Arrière': 13900, 'Caméra Avant': 9900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 9900 } },
  { model: 'SE 2020/2022', prices: { 'Ecran': 10900, 'Batterie': 9900, 'Chassis': 19900, 'Caméra Arrière': 8900, 'Caméra Avant': 9900, 'Lentille Caméra': 9900, 'Port de charge': 14900, 'Haut Parleur Oreille': 9900 } },
  { model: '8 Plus', prices: { 'Ecran': 9900, 'Batterie': 8900, 'Chassis': 19900, 'Caméra Arrière': 11900, 'Caméra Avant': 9900, 'Lentille Caméra': 9900, 'Port de charge': 13900, 'Haut Parleur Oreille': 8900 } },
  { model: '8', prices: { 'Ecran': 9900, 'Batterie': 8900, 'Chassis': 19900, 'Caméra Arrière': 8900, 'Caméra Avant': 9900, 'Lentille Caméra': 9900, 'Port de charge': 13900, 'Haut Parleur Oreille': 8900 } },
  { model: '7 Plus', prices: { 'Ecran': 8900, 'Batterie': 8900, 'Caméra Arrière': 10900, 'Caméra Avant': 9900, 'Lentille Caméra': 9900, 'Port de charge': 13900, 'Haut Parleur Oreille': 7900 } },
  { model: '7', prices: { 'Ecran': 8900, 'Batterie': 8900, 'Caméra Arrière': 9900, 'Caméra Avant': 9900, 'Lentille Caméra': 9900, 'Port de charge': 13900, 'Haut Parleur Oreille': 7900 } },
  { model: '6S Plus', prices: { 'Ecran': 8900, 'Batterie': 8900, 'Caméra Arrière': 8900, 'Caméra Avant': 7900, 'Lentille Caméra': 5900, 'Port de charge': 8900, 'Haut Parleur Oreille': 6900 } },
  { model: '6S', prices: { 'Ecran': 8900, 'Batterie': 8900, 'Caméra Arrière': 7900, 'Caméra Avant': 7900, 'Lentille Caméra': 5900, 'Port de charge': 8900, 'Haut Parleur Oreille': 5900 } },
  { model: 'SE 2016', prices: { 'Ecran': 9900, 'Batterie': 7900, 'Caméra Arrière': 7900, 'Caméra Avant': 4900, 'Lentille Caméra': 4900, 'Port de charge': 7900, 'Haut Parleur Oreille': 4900 } }
]

const galaxySRepairMatrix: RepairMatrixEntry[] = [
  { model: 'S24 Ultra 5G', prices: { 'Ecran': 40900, 'Batterie': 13900, 'Face Arrière': 10900, 'Port de charge': 19900, 'Caméra arrière': 19900 } },
  { model: 'S23 Ultra 5G', prices: { 'Ecran': 40900, 'Batterie': 13900, 'Face Arrière': 10900, 'Port de charge': 19900, 'Caméra arrière': 19900 } },
  { model: 'S23 Plus 5G', prices: { 'Ecran': 28900, 'Batterie': 13900, 'Face Arrière': 10900, 'Port de charge': 19900, 'Caméra arrière': 19900 } },
  { model: 'S23 FE 5G', prices: { 'Ecran': 19900, 'Batterie': 13900, 'Face Arrière': 10900, 'Port de charge': 19900, 'Caméra arrière': 19900 } },
  { model: 'S23 5G', prices: { 'Ecran': 32900, 'Batterie': 13900, 'Face Arrière': 10900, 'Port de charge': 19900, 'Caméra arrière': 19900 } },
  { model: 'S22 Ultra 5G', prices: { 'Ecran': 38900, 'Batterie': 13900, 'Face Arrière': 10900, 'Port de charge': 19900 } },
  { model: 'S22 Plus 5G', prices: { 'Ecran': 28900, 'Batterie': 13900, 'Face Arrière': 10900, 'Port de charge': 19900 } },
  { model: 'S22 5G', prices: { 'Ecran': 27900, 'Batterie': 13900, 'Face Arrière': 10900, 'Port de charge': 14900 } },
  { model: 'S21 Ultra 5G', prices: { 'Ecran': 43900, 'Batterie': 13900, 'Face Arrière': 10900, 'Port de charge': 19900 } },
  { model: 'S21 Plus 5G', prices: { 'Ecran': 29900, 'Batterie': 13900, 'Face Arrière': 10900, 'Port de charge': 19900 } },
  { model: 'S21 FE', prices: { 'Ecran': 23900, 'Batterie': 11900, 'Face Arrière': 10900, 'Port de charge': 19900 } },
  { model: 'S21', prices: { 'Ecran': 28900, 'Batterie': 11900, 'Face Arrière': 10900, 'Port de charge': 19900 } },
  { model: 'S20 FE 5G', prices: { 'Ecran': 20900, 'Batterie': 11900, 'Face Arrière': 10900, 'Port de charge': 15900 } },
  { model: 'S20 Ultra 5G', prices: { 'Ecran': 32900, 'Batterie': 11900, 'Face Arrière': 10900 } },
  { model: 'S20 Plus 5G', prices: { 'Ecran': 33900, 'Batterie': 11900, 'Face Arrière': 10900 } },
  { model: 'S20 5G', prices: { 'Ecran': 29900, 'Batterie': 11900, 'Face Arrière': 10900 } },
  { model: 'S10 Plus', prices: { 'Ecran': 32900, 'Batterie': 9900, 'Face Arrière': 10900 } },
  { model: 'S10E', prices: { 'Ecran': 21900, 'Batterie': 9900, 'Face Arrière': 10900 } },
  { model: 'S10 5G', prices: { 'Ecran': 35900, 'Batterie': 9900, 'Face Arrière': 9900 } },
  { model: 'S10 Lite', prices: { 'Ecran': 23900, 'Batterie': 9900, 'Face Arrière': 9900 } },
  { model: 'S10', prices: { 'Ecran': 27900, 'Batterie': 9900, 'Face Arrière': 9900 } },
  { model: 'S9 Plus', prices: { 'Ecran': 28900, 'Batterie': 9900, 'Face Arrière': 9900 } },
  { model: 'S9', prices: { 'Ecran': 27900, 'Batterie': 9900, 'Face Arrière': 9900 } },
  { model: 'S8 Plus', prices: { 'Ecran': 27900, 'Batterie': 9900, 'Face Arrière': 9900 } },
  { model: 'S8', prices: { 'Ecran': 24900, 'Batterie': 9900, 'Face Arrière': 9900 } }
]

function slugifyPart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildKeywords(brand: string, model: string, issueAliases: string[]) {
  const baseKeywords = [`${brand} ${model}`, model]

  if (brand === 'Samsung') {
    const compactModel = model.replace(/^Galaxy\s+/i, '').replace(/\s+5G$/i, '')
    baseKeywords.push(compactModel)
  }

  if (brand === 'Apple') {
    const compactModel = model.replace(/^iPhone\s+/i, '')
    baseKeywords.push(compactModel)
  }

  return Array.from(new Set([
    ...baseKeywords,
    ...baseKeywords.flatMap(baseKeyword => issueAliases.map(alias => `${baseKeyword} ${alias}`))
  ]))
}

function buildServiceSku(brand: string, model: string, issueKey: RepairIssueKey) {
  return `SERV-${slugifyPart(brand)}-${slugifyPart(model)}-${slugifyPart(issueKey)}`.slice(0, 80)
}

function expandMatrix(brand: string, category: string, matrix: RepairMatrixEntry[]) {
  return matrix.flatMap<CatalogItemInput>((entry) => {
    const fullModel = brand === 'Apple' ? `iPhone ${entry.model}` : `Galaxy ${entry.model}`

    return Object.entries(entry.prices).map(([sourceIssueLabel, priceCents]) => {
      const issue = issueDefinitions[sourceIssueLabel as SourceIssueLabel]

      return {
        name: `${issue.issueLabel} ${fullModel}`,
        sku: buildServiceSku(brand, fullModel, issue.issueKey),
        type: 'service',
        category,
        brand,
        model: fullModel,
        serviceKind: issue.issueLabel,
        keywords: buildKeywords(brand, fullModel, issue.aliases),
        defaultPrice: priceCents,
        vatRate: 8.1,
        isActive: true
      }
    })
  })
}

export function buildRepairCatalogSeedItems() {
  return [
    ...expandMatrix('Apple', 'iPhone', iphoneRepairMatrix),
    ...expandMatrix('Samsung', 'Samsung', galaxySRepairMatrix)
  ]
}
