import { reactive } from 'vue'
import {
  DOSSIER_HEARTBEAT_MS,
  type DossierProof,
  type DossierSnapshot,
  type DossierStatus,
  type DossierTarget
} from '~~/shared/types/dossier'

export type DossierClientState = {
  target: DossierTarget
  standalone: boolean
  status: DossierStatus | null
  baseline: DossierSnapshot | null
  token: string | null
  dirty: boolean
  dirtySources: Record<string, boolean>
  lost: boolean
  offline: boolean
  pending: boolean
  epoch: number
  active: number
  intent: 'edit' | 'operate'
}

export function createDossierClient(fetcher: typeof globalThis.$fetch) {
  const states = reactive<Record<string, DossierClientState>>({})
  const audio = reactive({ enabled: false })
  const retries = reactive<Record<string, { scopeKeys: string[], failed: boolean, run: () => Promise<unknown> }>>({})
  const tabId = import.meta.client ? crypto.randomUUID() : ''
  let station = 'Poste'
  let audioContext: AudioContext | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  const pending = new Map<string, Promise<DossierStatus>>()

  if (import.meta.client) {
    try {
      station
        = window.localStorage.getItem('pos:station')
          || `Poste ${crypto.randomUUID().slice(0, 6).toUpperCase()}`
      window.localStorage.setItem('pos:station', station)
    } catch {
      station = `Poste ${tabId.slice(0, 6).toUpperCase()}`
    }
  }

  function state(target: DossierTarget, standalone = false) {
    const id = `${target.kind}:${target.id}${standalone ? ':standalone' : ''}`
    return (states[id] ||= {
      target,
      standalone,
      status: null,
      baseline: null,
      token: null,
      dirty: false,
      dirtySources: {},
      lost: false,
      offline: false,
      pending: false,
      epoch: 0,
      active: 0,
      intent: 'operate'
    })
  }

  async function enableSound(test = false) {
    if (!import.meta.client) return
    try {
      audioContext ||= new AudioContext()
      await audioContext.resume()
      audio.enabled = audioContext.state === 'running'
      if (test) beep()
    } catch {
      audio.enabled = false
    }
  }

  function beep() {
    if (!audioContext || audioContext.state !== 'running') {
      audio.enabled = false
      return
    }
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.frequency.value = 740
    gain.gain.setValueAtTime(0.12, audioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.25
    )
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.25)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }
  }

  function capture(value: unknown) {
    if (!value || typeof value !== 'object') return
    const item = value as { dossier?: DossierSnapshot }
    if (item.dossier) {
      for (const current of Object.values(states)) {
        if (
          current.status?.key === item.dossier.key
          || `${current.target.kind}:${current.target.id}` === item.dossier.key
        ) {
          if (!current.dirty && !current.lost) current.baseline = item.dossier
        }
      }
    }
  }

  function snapshot(target: DossierTarget, value: unknown) {
    const current = state(target)
    const dossier = (value as { dossier?: DossierSnapshot } | null)?.dossier
    if (dossier && !current.dirty && !current.lost) current.baseline = dossier
  }

  function apply(current: DossierClientState, result: DossierStatus) {
    const previous = current.status
    if (current.token && current.token !== result.token) current.lost = true
    if (
      current.baseline
      && (current.baseline.key !== result.key
        || current.baseline.revision !== result.revision)
    )
      current.lost = true
    const oldPeers = new Set(
      previous?.peers.map(peer => `${peer.userId}:${peer.tabId}`)
    )
    if (
      result.peers.some(
        peer => !oldPeers.has(`${peer.userId}:${peer.tabId}`)
      )
      || (previous && previous.generation !== result.generation && current.lost)
    )
      beep()
    current.status = result
    current.token = result.token
    // New linked documents have no saved record yet, but must retain the
    // dossier version observed when their form opened.
    current.baseline ||= { key: result.key, revision: result.revision }
    current.offline = false
  }

  async function session(
    current: DossierClientState,
    action: 'observe' | 'acquire' | 'takeover' | 'release' = 'observe'
  ) {
    const id = `${current.target.kind}:${current.target.id}:${current.standalone}`
    // Mutations and takeover must wait for an earlier heartbeat, never reuse it.
    const earlier = pending.get(id)
    if (earlier) {
      if (action === 'observe') return earlier
      await earlier.catch(() => {})
    }
    const request = (async () => {
      current.pending = true
      try {
        // Carry a lease between surfaces of the same dossier in this tab.
        const sibling = Object.values(states).find(
          other =>
            other !== current
            && other.token
            && other.status?.key === (current.status?.key || current.baseline?.key)
        )
        let result = await fetcher<DossierStatus>('/api/dossiers/session', {
          method: 'POST',
          retry: 0,
          body: {
            target: current.target,
            standalone: current.standalone,
            tabId,
            station,
            action,
            intent: current.intent,
            dirty: current.dirty,
            token: current.token || sibling?.token,
            expectedGeneration: current.status?.generation
          }
        })
        if (
          !result.token
          && result.owner?.tabId === tabId
          && action !== 'release'
        ) {
          const ownerState = Object.values(states).find(
            other =>
              other !== current
              && other.token
              && other.status?.key === result.key
          )
          if (ownerState)
            result = await fetcher<DossierStatus>('/api/dossiers/session', {
              method: 'POST',
              retry: 0,
              body: {
                target: current.target,
                standalone: current.standalone,
                tabId,
                station,
                action: 'observe',
                token: ownerState.token,
                dirty: current.dirty
              }
            })
        }
        apply(current, result)
        return result
      } catch (error) {
        current.offline = true
        throw error
      } finally {
        current.pending = false
      }
    })()
    pending.set(id, request)
    try {
      return await request
    } finally {
      if (pending.get(id) === request) pending.delete(id)
    }
  }

  async function prepare(
    targets: Array<DossierTarget & { standalone?: boolean }>
  ) {
    const proofs: DossierProof[] = []
    for (const target of targets) {
      const current = state(target, target.standalone)
      if (current.lost)
        throw new Error(
          'Le dossier a changé. Copiez vos saisies puis rechargez la fiche.'
        )
      const result = await session(current, 'acquire')
      if (!result.token || current.lost)
        throw new Error(
          result.owner && !result.token
            ? `Dossier réservé par ${result.owner.name} · ${result.owner.station}. Ouvrez la fiche pour reprendre la main.`
            : 'Le dossier a changé. Rechargez la fiche.'
        )
      current.baseline ||= { key: result.key, revision: result.revision }
      if (!proofs.some(proof => proof.key === result.key))
        proofs.push({ ...current.baseline, token: result.token })
    }
    return {
      'X-Dossier-Tab': tabId,
      'X-Dossier-Proofs': JSON.stringify(proofs)
    }
  }

  function acceptRevisions(snapshots: DossierSnapshot[]) {
    for (const current of Object.values(states)) {
      const next = snapshots.find(
        snapshot => snapshot.key === current.status?.key
      )
      if (next) {
        current.baseline = next
        if (current.status) current.status.revision = next.revision
      }
    }
  }

  function setDirty(current: DossierClientState, source: string, dirty: boolean) {
    if (dirty) current.dirtySources[source] = true
    else Reflect.deleteProperty(current.dirtySources, source)
    current.dirty = Object.values(current.dirtySources).some(Boolean)
  }

  function invalidate(rawProofs: string | null) {
    const proofs: DossierProof[] = JSON.parse(rawProofs || '[]')
    for (const current of Object.values(states)) {
      if (proofs.some(proof => proof.key === current.status?.key))
        current.lost = true
    }
  }

  function releaseInactive() {
    for (const current of Object.values(states)) {
      if (
        !current.active
        && current.token
        && !Object.values(states).some(
          other => other.active && other.status?.key === current.status?.key
        )
      )
        void leave(current)
    }
  }

  async function reload(
    current: DossierClientState,
    refresh: () => Promise<unknown>,
    takeover = false
  ) {
    if (takeover) await session(current, 'takeover')
    const before = await session(current, current.token ? 'observe' : 'acquire')
    await refresh()
    const after = await session(current)
    if (before.key !== after.key || before.revision !== after.revision)
      throw new Error('Le dossier a changé pendant le chargement. Réessayez.')
    current.baseline = { key: after.key, revision: after.revision }
    current.lost = false
    current.dirty = false
    current.dirtySources = {}
    current.epoch++
  }

  function start() {
    if (!import.meta.client || timer) return
    const heartbeat = () => {
      const keys = new Set<string>()
      for (const current of Object.values(states)) {
        const key
          = current.status?.key || `${current.target.kind}:${current.target.id}`
        if (!current.active || keys.has(key)) continue
        keys.add(key)
        void session(current).catch(() => {})
      }
    }
    timer = setInterval(heartbeat, DOSSIER_HEARTBEAT_MS)
    window.addEventListener('online', heartbeat)
    window.addEventListener('focus', heartbeat)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) heartbeat()
    })
    document.addEventListener('pointerdown', () => {
      if (!audio.enabled) void enableSound()
    })
    document.addEventListener('keydown', () => {
      if (!audio.enabled) void enableSound()
    })
    window.addEventListener('pagehide', () => {
      for (const current of Object.values(states)) {
        if (current.active)
          void fetcher('/api/dossiers/session', {
            method: 'POST',
            retry: 0,
            keepalive: true,
            body: {
              target: current.target,
              standalone: current.standalone,
              tabId,
              station,
              action: 'release',
              token: current.token
            }
          }).catch(() => {})
      }
    })
  }

  async function leave(current: DossierClientState) {
    current.active = Math.max(0, current.active - 1)
    // Let the next page register first so ticket -> document navigation retains ownership.
    await new Promise(resolve => setTimeout(resolve, 300))
    if (
      current.active
      || Object.values(states).some(
        other =>
          other.active
          && (other.status?.key || other.baseline?.key) === current.status?.key
      )
    )
      return
    await session(current, 'release').catch(() => {})
    current.token = null
    current.baseline = null
    current.lost = false
  }

  return {
    states,
    retries,
    state,
    audio,
    enableSound,
    beep,
    capture,
    snapshot,
    session,
    prepare,
    acceptRevisions,
    setDirty,
    invalidate,
    releaseInactive,
    reload,
    start,
    leave
  }
}
