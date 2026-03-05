import { useEffect, useState, useRef } from 'react'

const AGENTS = ['Agent_Prison', 'Agent_Developer', 'Agent_Town'] as const
const LABELS: Record<string, string> = {
  Agent_Prison: 'PRISON',
  Agent_Developer: 'DEVELOPER',
  Agent_Town: 'TOWN',
}

interface RagInfo {
  agent_id: string
  total_chunks: number
  documents: string[]
}

export default function KnowledgeManager() {
  const [selected, setSelected] = useState<string>('Agent_Prison')
  const [ragData, setRagData] = useState<Record<string, RagInfo>>({})
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchAll = async () => {
    try {
      const resp = await fetch('/api/admin/rag/status')
      const data = await resp.json()
      // data 是 { Agent_Prison: {...}, Agent_Developer: {...}, Agent_Town: {...} }
      const mapped: Record<string, RagInfo> = {}
      for (const [id, info] of Object.entries(data)) {
        mapped[id] = { agent_id: id, ...(info as any) }
      }
      setRagData(mapped)
    } catch {
      setMessage('Failed to load RAG status')
    }
  }

  useEffect(() => { fetchAll() }, [])

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
        setMessage(`uploaded ${data.filename} → ${data.chunks} chunks`)
        fetchAll()
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

  const handleDelete = async (filename: string) => {
    const resp = await fetch(`/api/admin/rag/${selected}/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    })
    if (resp.ok) {
      const data = await resp.json()
      setMessage(`deleted ${filename} (${data.chunks_deleted} chunks)`)
      fetchAll()
    }
  }

  const handleInitAll = async () => {
    setMessage('Initializing all knowledgebases...')
    setUploading(true)
    try {
      const resp = await fetch('/api/admin/rag/init', { method: 'POST' })
      const data = await resp.json()
      setMessage(`Init complete: ${JSON.stringify(data.result)}`)
      fetchAll()
    } catch (e) {
      setMessage(`Init failed: ${e}`)
    } finally {
      setUploading(false)
    }
  }

  const info = ragData[selected]

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xs text-secondary tracking-widest">KNOWLEDGE BASE (RAG)</h2>
        <button
          onClick={handleInitAll}
          disabled={uploading}
          className="text-xs tracking-widest border border-border px-4 py-1.5 text-muted hover:border-secondary hover:text-primary transition-colors disabled:opacity-30"
        >
          INIT ALL
        </button>
      </div>

      {/* Agent 选择 */}
      <div className="flex gap-4 mb-6">
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
            {ragData[id] && (
              <span className="ml-2 text-muted">({ragData[id].total_chunks})</span>
            )}
          </button>
        ))}
      </div>

      {/* 文件列表 */}
      <div className="border border-border mb-6">
        <div className="px-4 py-2 border-b border-border">
          <span className="text-xs text-muted tracking-widest">
            DOCUMENTS — {info?.total_chunks ?? 0} total chunks
          </span>
        </div>
        {(!info || info.documents.length === 0) ? (
          <p className="px-4 py-6 text-xs text-muted text-center">No documents loaded</p>
        ) : (
          <ul>
            {info.documents.map((doc) => (
              <li key={doc} className="flex items-center justify-between px-4 py-2 border-b border-border last:border-0">
                <span className="text-xs text-primary font-mono">{doc}</span>
                <button
                  onClick={() => handleDelete(doc)}
                  className="text-xs text-muted hover:text-primary transition-colors tracking-widest"
                >
                  DELETE
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 上传区 */}
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
          {uploading ? 'UPLOADING...' : 'UPLOAD'}
        </button>
      </div>

      {/* 消息 */}
      {message && (
        <p className="mt-4 text-xs text-secondary font-mono animate-fade-in">— {message}</p>
      )}
    </div>
  )
}
