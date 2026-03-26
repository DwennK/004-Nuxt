import { defaultRepairSearches, repairSuggestions } from '../constants/repair-suggestions'
import type { RepairSuggestion } from '../types/pos'

const issueAliasesByKey = {
  screen: ['ecran', 'screen', 'display', 'vitre', 'lcd', 'oled'],
  battery: ['batterie', 'battery', 'autonomie'],
  chassis: ['chassis', 'cadre', 'frame'],
  back_glass: ['face arriere', 'arriere', 'dos', 'back glass'],
  rear_camera: ['camera arriere', 'camera', 'objectif arriere'],
  front_camera: ['camera avant', 'selfie', 'facetime'],
  camera_lens: ['lentille', 'vitre camera', 'camera lens'],
  charge_port: ['port charge', 'charge', 'connecteur charge', 'usb', 'dock'],
  earpiece: ['haut parleur oreille', 'oreille', 'ecouteur', 'earpiece']
} as const

export function normalizeRepairQuery(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+/\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function uniqueByModel(items: RepairSuggestion[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.brand}::${item.model}::${item.issueKey}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function getModelAliases(suggestion: RepairSuggestion) {
  const aliases = [suggestion.model]

  if (suggestion.brand === 'Apple') {
    aliases.push(suggestion.model.replace(/^iPhone\s+/i, ''))
  }

  if (suggestion.brand === 'Samsung') {
    aliases.push(
      suggestion.model.replace(/^Galaxy\s+/i, ''),
      suggestion.model.replace(/^Galaxy\s+/i, '').replace(/\s+5G$/i, '')
    )
  }

  return Array.from(new Set(aliases.map(alias => normalizeRepairQuery(alias)).filter(Boolean)))
}

function getIssueAliases(suggestion: RepairSuggestion) {
  return Array.from(new Set([
    suggestion.issueLabel,
    ...issueAliasesByKey[suggestion.issueKey]
  ].map(alias => normalizeRepairQuery(alias)).filter(Boolean)))
}

function getPhraseScore(normalizedQuery: string, phrases: string[]) {
  let score = 0

  for (const phrase of phrases) {
    if (!phrase || !normalizedQuery.includes(phrase)) {
      continue
    }

    score = Math.max(score, (phrase.split(' ').length * 20) + phrase.length)
  }

  return score
}

export function getRepairSuggestionResult(query: string) {
  const normalizedQuery = normalizeRepairQuery(query)

  if (!normalizedQuery) {
    return {
      bestMatch: null as RepairSuggestion | null,
      detectedModel: null as string | null,
      suggestedMatches: defaultRepairSearches
        .map(search => repairSuggestions.find(item => item.keywords.some(keyword => normalizeRepairQuery(keyword) === search)))
        .filter(Boolean) as RepairSuggestion[]
    }
  }

  const scored = repairSuggestions.map((suggestion) => {
    const modelScore = getPhraseScore(normalizedQuery, getModelAliases(suggestion))
    const issueScore = getPhraseScore(normalizedQuery, getIssueAliases(suggestion))

    return {
      suggestion,
      modelScore,
      issueScore,
      totalScore: modelScore + issueScore
    }
  }).filter(item => item.modelScore > 0)

  if (!scored.length) {
    return {
      bestMatch: null as RepairSuggestion | null,
      detectedModel: null as string | null,
      suggestedMatches: [] as RepairSuggestion[]
    }
  }

  const topModel = [...scored].sort((left, right) => {
    return right.modelScore - left.modelScore || right.totalScore - left.totalScore
  })[0]?.suggestion.model || null

  const modelMatches = uniqueByModel(scored
    .filter(item => item.suggestion.model === topModel)
    .sort((left, right) => right.totalScore - left.totalScore)
    .map(item => item.suggestion))

  const bestMatch = [...scored]
    .filter(item => item.issueScore > 0)
    .sort((left, right) => right.totalScore - left.totalScore)[0]?.suggestion || null

  return {
    bestMatch,
    detectedModel: topModel,
    suggestedMatches: modelMatches.slice(0, 6)
  }
}
