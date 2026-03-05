import { useEffect, useState } from 'react'
import KnowledgeManager from '../components/admin/KnowledgeManager'

const AGENTS = ['Agent_Prison', 'Agent_Developer', 'Agent_Town']
const LABELS: Record<string, string> = {
  Agent_Prison: 'PRISON',
  Agent_Developer: 'DEVELOPER',
  Agent_Town: 'TOWN',
}

export default function AdminPage() {
  const [prompts, setPrompts] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState('Agent_Prison')
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/admin/agents')
      .then((r) => r.json())
      .then((data) => {
        setPrompts(data)
        setDraft(data['Agent_Prison'] ?? '')
      })
  }, [])

  function handleSelect(id: string) {
    setSelected(id)
    setDraft(prompts[id] ?? '')
    setSaved(false)
  }

  async function handleSave() {
    const resp = await fetch(`/api/admin/agents/${selected}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: selected, system_prompt: draft }),
    })
    if (resp.ok) {
      setPrompts((p) => ({ ...p, [selected]: draft }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-void p-8 font-mono">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xs text-secondary tracking-widest">ADMIN — SYSTEM PROMPTS</h1>
          <a href="/" className="text-xs text-muted hover:text-secondary">← BACK</a>
        </div>

        {/* Agent 选择 */}
        <div className="flex gap-4 mb-6">
          {AGENTS.map((id) => (
            <button
              key={id}
              onClick={() => handleSelect(id)}
              className={`text-xs tracking-widest px-4 py-1.5 border transition-colors ${
                selected === id
                  ? 'border-primary text-primary'
                  : 'border-border text-secondary hover:border-secondary'
              }`}
            >
              {LABELS[id]}
            </button>
          ))}
        </div>

        {/* 编辑区 */}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full h-96 bg-surface border border-border text-primary text-xs p-4 resize-none focus:outline-none focus:border-secondary font-mono leading-relaxed"
          placeholder="System prompt..."
        />

        <div className="flex items-center gap-4 mt-4">
          <button
            onClick={handleSave}
            className="text-xs tracking-widest border border-border px-6 py-1.5 text-secondary hover:border-secondary hover:text-primary transition-colors"
          >
            SAVE
          </button>
          {saved && (
            <span className="text-xs text-secondary tracking-widest animate-fade-in">
              — saved
            </span>
          )}
        </div>
        {/* 知识库管理 */}
        <KnowledgeManager />
      </div>
    </div>
  )
}
