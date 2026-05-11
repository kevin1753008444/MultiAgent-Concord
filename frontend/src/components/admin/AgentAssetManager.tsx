import { useEffect, useState } from 'react'
import { DISPLAY_ORDER, AGENT_DISPLAYS } from '../../agents'
import type { AgentAsset, AgentAssetMap, AgentEmotion, AgentId, AgentVisualMode } from '../../types'

const MODES: AgentVisualMode[] = ['idle', 'thinking', 'speaking']
const EMOTIONS: AgentEmotion[] = ['neutral', 'uneasy', 'angry']

const MODE_LABELS: Record<AgentVisualMode, string> = {
  idle: 'Default / Listen',
  thinking: 'Thinking',
  speaking: 'Speaking',
}

export default function AgentAssetManager() {
  const [assets, setAssets] = useState<AgentAssetMap>({})
  const [busySlot, setBusySlot] = useState<string | null>(null)

  async function refreshAssets() {
    const response = await fetch('/api/admin/agent-assets')
    if (response.ok) setAssets(await response.json())
  }

  useEffect(() => {
    refreshAssets()
  }, [])

  async function uploadAsset(agentId: AgentId, mode: AgentVisualMode, emotion: AgentEmotion, file?: File) {
    if (!file) return
    const slot = `${agentId}-${mode}-${emotion}`
    setBusySlot(slot)
    const data = new FormData()
    data.append('file', file)
    const response = await fetch(`/api/admin/agent-assets/${agentId}/${mode}/${emotion}`, {
      method: 'POST',
      body: data,
    })
    if (response.ok) await refreshAssets()
    setBusySlot(null)
  }

  async function deleteAsset(agentId: AgentId, mode: AgentVisualMode, emotion: AgentEmotion) {
    const slot = `${agentId}-${mode}-${emotion}`
    setBusySlot(slot)
    const response = await fetch(`/api/admin/agent-assets/${agentId}/${mode}/${emotion}`, { method: 'DELETE' })
    if (response.ok) await refreshAssets()
    setBusySlot(null)
  }

  function getAsset(agentId: AgentId, mode: AgentVisualMode, emotion: AgentEmotion): AgentAsset | undefined {
    return assets[agentId]?.[mode]?.[emotion]
  }

  return (
    <div className="asset-manager">
      <div className="panel-heading">
        <span>Agent Visual States</span>
        <strong>local media library</strong>
      </div>

      <div className="asset-help">
        Upload .png, .jpg, .webp, .gif, .mp4, or .webm. Each slot stores one local file and replaces the old one.
      </div>

      {DISPLAY_ORDER.map((key) => {
        const display = AGENT_DISPLAYS[key]
        return (
          <section className="asset-agent" key={display.id}>
            <div className="asset-agent-title">
              <img src={display.image} alt="" />
              <div>
                <h3>{display.label}</h3>
                <p>{display.role}</p>
              </div>
            </div>

            <div className="asset-grid">
              {MODES.map((mode) => (
                <div className="asset-column" key={mode}>
                  <h4>{MODE_LABELS[mode]}</h4>
                  {EMOTIONS.map((emotion) => {
                    const asset = getAsset(display.id, mode, emotion)
                    const slot = `${display.id}-${mode}-${emotion}`
                    return (
                      <div className="asset-slot" key={slot}>
                        <div>
                          <span>{emotion}</span>
                          <small>{asset ? asset.filename : 'no media'}</small>
                        </div>
                        <label className="asset-upload">
                          Upload
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
                            disabled={busySlot === slot}
                            onChange={(event) => uploadAsset(display.id, mode, emotion, event.target.files?.[0])}
                          />
                        </label>
                        <button disabled={!asset || busySlot === slot} onClick={() => deleteAsset(display.id, mode, emotion)}>
                          Delete
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
