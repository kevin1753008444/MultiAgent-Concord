import { useEffect, useState } from 'react'
import { useRef } from 'react'

const AGENTS = ['Agent_Prison', 'Agent_Developer', 'Agent_Town'] as const
const LABELS: Record<string, string> = {
  Agent_Prison: 'PRISON',
  Agent_Developer: 'DEVELOPER',
  Agent_Town: 'TOWN',
}

const KB_DIRS: Record<string, string> = {
  Agent_Prison: 'AgentPrison_knowledgebase',
  Agent_Developer: 'AgentDeveloper_knowledgebase',
  Agent_Town: 'AgentTown_knowledgebase',
}

interface KbFile {
  name: string
}

interface KbStatus {
  agent_id: string
  files: KbFile[]
}

export default function KnowledgeManager() {
  const [selected, setSelected] = useState<string>('Agent_Prison')
  const [kbData, setKbData] = useState<Record<string, KbStatus>>({})
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const fetchStatus = async () => {
    try {
      const resp = await fetch('/api/admin/rag/status')
      if (!resp.ok) {
        setMessage(`Status fetch failed: ${resp.status} ${resp.statusText}`)
        return
      }
      const data = await resp.json()
      const mapped: Record<string, KbStatus> = {}
      for (const [id, info] of Object.entries(data as Record<string, any>)) {
        mapped[id] = { agent_id: id, files: (info.documents ?? []).map((n: string) => ({ name: n })) }
      }
      setKbData(mapped)
    } catch (e) {
      setMessage(`Failed to load status: ${e}`)
    }
  }

  useEffect(() => { fetchStatus() }, [])

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploading(true)
    setMessage('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const resp = await fetch(`/api/admin/rag/${selected}/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await resp.json()
      if (resp.ok) {
        setMessage(`Added ${data.filename} to ${KB_DIRS[selected]}`)
        fetchStatus()
      } else {
        setMessage(`Error: ${data.detail}`)
      }
    } catch (e) {
      setMessage(`Upload failed: ${e}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const runInit = async (url: string, label: string) => {
    setMessage(`${label}... this may take 1-2 minutes`)
    setUploading(true)
    try {
      const resp = await fetch(url, { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok) {
        setMessage(`Error: ${data.detail ?? resp.statusText}`)
        return
      }
      const result = data.result as Record<string, number>
      const summary = Object.entries(result)
        .map(([id, n]) => `${id.replace('Agent_', '')}: ${n} chunks`)
        .join(' · ')
      setMessage(`Done — ${summary}`)
      fetchStatus()
    } catch (e) {
      setMessage(`Failed: ${e}`)
    } finally {
      setUploading(false)
    }
  }

  const handleInitAll = () => runInit('/api/admin/rag/init', 'Vectorizing new files')
  const handleResetAll = () => runInit('/api/admin/rag/reset', 'Clearing and re-vectorizing all')

  const handleDelete = async (filename: string) => {
    const resp = await fetch(`/api/admin/rag/${selected}/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    })
    if (resp.ok) {
      setMessage(`Removed ${filename}`)
      fetchStatus()
    } else {
      setMessage(`Delete failed: ${resp.statusText}`)
    }
  }

  const info = kbData[selected]

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs text-secondary tracking-widest">KNOWLEDGE BASE</h2>
        <div className="flex gap-2">
          <button
            onClick={handleInitAll}
            disabled={uploading}
            className="text-xs tracking-widest border border-border px-4 py-1.5 text-muted hover:border-secondary hover:text-primary transition-colors disabled:opacity-30"
          >
            {uploading ? 'LOADING...' : 'LOAD FROM FOLDER'}
          </button>
          <button
            onClick={handleResetAll}
            disabled={uploading}
            className="text-xs tracking-widest border border-border px-4 py-1.5 text-muted hover:border-red-500 hover:text-red-400 transition-colors disabled:opacity-30"
          >
            RESET & RELOAD
          </button>
        </div>
      </div>

      {/* Agent tabs */}
      <div className="flex gap-4 mb-6 mt-4">
        {AGENTS.map((id) => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            className={`text-xs tracking-widest px-4 py-1.5 border transition-colors ${
              selected === id
                ? 'border-primary text-primary'
                : 'border-border text-secondary hover:border-secondary'
            }`}
          >
            {LABELS[id]}
            {kbData[id] && (
              <span className="ml-2 text-muted">({kbData[id].files.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* File list */}
      <div className="border border-border mb-4">
        <div className="px-4 py-2 border-b border-border">
          <span className="text-xs text-muted tracking-widest font-mono">
            {KB_DIRS[selected]}/
          </span>
        </div>
        {(!info || info.files.length === 0) ? (
          <p className="px-4 py-6 text-xs text-muted text-center">No files found</p>
        ) : (
          <ul>
            {info.files.map((f) => (
              <li key={f.name} className="flex items-center justify-between px-4 py-2 border-b border-border last:border-0">
                <span className="text-xs text-primary font-mono">{f.name}</span>
                <button
                  onClick={() => handleDelete(f.name)}
                  className="text-xs text-muted hover:text-primary transition-colors tracking-widest"
                >
                  REMOVE
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add file */}
      <div className="flex items-center gap-4">
        <input
          ref={fileRef}
          type="file"
          accept=".md,.txt,.pdf"
          className="text-xs text-secondary font-mono file:mr-4 file:py-1.5 file:px-4 file:border file:border-border file:text-xs file:bg-void file:text-secondary file:cursor-pointer hover:file:border-secondary hover:file:text-primary file:transition-colors file:tracking-widest"
        />
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="text-xs tracking-widest border border-border px-6 py-1.5 text-secondary hover:border-secondary hover:text-primary transition-colors disabled:opacity-30"
        >
          {uploading ? 'SAVING...' : 'ADD FILE'}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">Files take effect immediately — no processing needed.</p>

      {message && (
        <p className="mt-4 text-xs text-secondary font-mono animate-fade-in">— {message}</p>
      )}
    </div>
  )
}
