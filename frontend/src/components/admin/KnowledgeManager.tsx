import { useEffect, useRef, useState } from 'react'

const AGENTS = ['Agent_Prison', 'Agent_Developer', 'Agent_Town'] as const
const LABELS: Record<string, string> = {
  Agent_Prison: 'Prison',
  Agent_Developer: 'Developer',
  Agent_Town: 'Town',
}

const KB_DIRS: Record<string, string> = {
  Agent_Prison: 'AgentPrison_knowledgebase',
  Agent_Developer: 'AgentDeveloper_knowledgebase',
  Agent_Town: 'AgentTown_knowledgebase',
}

interface KbFile { name: string }
interface KbStatus { agent_id: string; files: KbFile[] }

export default function KnowledgeManager() {
  const [selected, setSelected] = useState<string>('Agent_Prison')
  const [kbData, setKbData] = useState<Record<string, KbStatus>>({})
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchStatus = async () => {
    try {
      const resp = await fetch('/api/admin/rag/status')
      if (!resp.ok) { setMessage(`Status fetch failed: ${resp.status}`); return }
      const data = await resp.json()
      const mapped: Record<string, KbStatus> = {}
      for (const [id, info] of Object.entries(data as Record<string, any>)) {
        mapped[id] = { agent_id: id, files: (info.documents ?? []).map((n: string) => ({ name: n })) }
      }
      setKbData(mapped)
    } catch (e) { setMessage(`Failed to load: ${e}`) }
  }

  useEffect(() => { fetchStatus() }, [])

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploading(true); setMessage('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const resp = await fetch(`/api/admin/rag/${selected}/upload`, { method: 'POST', body: formData })
      const data = await resp.json()
      if (resp.ok) { setMessage(`Added ${data.filename} to ${KB_DIRS[selected]}`); fetchStatus() }
      else setMessage(`Error: ${data.detail}`)
    } catch (e) { setMessage(`Upload failed: ${e}`) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const runInit = async (url: string, label: string) => {
    setMessage(`${label}… this may take 1–2 minutes`); setUploading(true)
    try {
      const resp = await fetch(url, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok) { setMessage(`Error: ${data.detail ?? resp.statusText}`); return }
      const summary = Object.entries(data.result as Record<string, number>)
        .map(([id, n]) => `${id.replace('Agent_', '')}: ${n} chunks`).join(' · ')
      setMessage(`Done — ${summary}`)
      fetchStatus()
    } catch (e) { setMessage(`Failed: ${e}`) }
    finally { setUploading(false) }
  }

  const handleDelete = async (filename: string) => {
    const resp = await fetch(`/api/admin/rag/${selected}/${encodeURIComponent(filename)}`, { method: 'DELETE' })
    if (resp.ok) { setMessage(`Removed ${filename}`); fetchStatus() }
    else setMessage(`Delete failed: ${resp.statusText}`)
  }

  const info = kbData[selected]

  return (
    <>
      <div className="panel-heading">
        <span>Knowledge Base</span>
        <strong>{KB_DIRS[selected]}</strong>
      </div>

      {/* Agent tabs */}
      <div className="prompt-tabs" style={{ marginBottom: 16 }}>
        {AGENTS.map((id) => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            className={selected === id ? 'is-selected' : ''}
          >
            {LABELS[id]}
            {kbData[id] && (
              <span style={{ marginLeft: 6, color: 'var(--console-muted)', fontWeight: 400 }}>
                ({kbData[id].files.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* File list */}
      <div style={{
        border: '1px solid var(--console-line)',
        borderRadius: 6,
        marginBottom: 14,
        background: '#080806',
      }}>
        <div style={{
          padding: '8px 14px',
          borderBottom: '1px solid var(--console-line)',
          color: 'var(--console-muted)',
          fontSize: 11,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          {KB_DIRS[selected]}/
        </div>
        {(!info || info.files.length === 0) ? (
          <p style={{ padding: '20px 14px', color: 'var(--console-muted)', fontSize: 12, textAlign: 'center', margin: 0 }}>
            No files found
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {info.files.map((f) => (
              <li key={f.name} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '9px 14px',
                borderBottom: '1px solid var(--console-line)',
                gap: 12,
              }}>
                <span style={{ fontSize: 12, color: 'var(--console-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
                <button
                  onClick={() => handleDelete(f.name)}
                  className="command-button danger"
                  style={{ padding: '4px 10px', fontSize: 11 }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Upload row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="asset-upload" style={{ flex: 1, minWidth: 180 }}>
          <input ref={fileRef} type="file" accept=".md,.txt,.pdf" disabled={uploading} />
          <span style={{ fontSize: 12, padding: '8px 12px', display: 'block', cursor: 'pointer' }}>
            {fileRef.current?.files?.[0]?.name ?? 'Choose file (.md / .txt / .pdf)'}
          </span>
        </label>
        <button className="command-button" onClick={handleUpload} disabled={uploading}>
          {uploading ? 'Saving…' : 'Add File'}
        </button>
        <button className="command-button" onClick={() => runInit('/api/admin/rag/init', 'Vectorizing new files')} disabled={uploading}>
          {uploading ? 'Loading…' : 'Load from Folder'}
        </button>
        <button className="command-button danger" onClick={() => runInit('/api/admin/rag/reset', 'Clearing and re-vectorizing')} disabled={uploading}>
          Reset & Reload
        </button>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--console-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Files take effect immediately — no processing needed.
      </p>

      {message && (
        <p style={{ marginTop: 12, fontSize: 12, color: 'var(--console-accent)', fontFamily: 'var(--console-font)' }}>
          — {message}
        </p>
      )}
    </>
  )
}
