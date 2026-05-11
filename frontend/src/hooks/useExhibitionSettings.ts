import { useCallback, useEffect, useState } from 'react'

const SETTINGS_KEY = 'mci-concord-exhibition-settings'
const CHANNEL_NAME = 'mci-concord-exhibition-settings'

export interface ExhibitionSettings {
  projectionTextScale: number
}

const DEFAULT_SETTINGS: ExhibitionSettings = {
  projectionTextScale: 0.78,
}

function readSettings(): ExhibitionSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function useExhibitionSettings() {
  const [settings, setSettings] = useState<ExhibitionSettings>(readSettings)

  useEffect(() => {
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null

    function apply(next: ExhibitionSettings) {
      setSettings(next)
      document.documentElement.style.setProperty('--projection-text-scale', String(next.projectionTextScale))
    }

    apply(readSettings())

    function onStorage(event: StorageEvent) {
      if (event.key === SETTINGS_KEY) apply(readSettings())
    }

    channel?.addEventListener('message', (event) => apply(event.data))
    window.addEventListener('storage', onStorage)

    return () => {
      channel?.close()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const updateSettings = useCallback((patch: Partial<ExhibitionSettings>) => {
    const next = { ...readSettings(), ...patch }
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
    document.documentElement.style.setProperty('--projection-text-scale', String(next.projectionTextScale))
    setSettings(next)
    if ('BroadcastChannel' in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME)
      channel.postMessage(next)
      channel.close()
    }
  }, [])

  return { settings, updateSettings }
}
