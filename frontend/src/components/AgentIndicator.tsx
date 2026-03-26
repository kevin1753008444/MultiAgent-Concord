import { useConversationStore } from '../store/conversationStore'
import ThinkingDots from './ThinkingDots'
import type { AgentId } from '../types'

const AGENTS: { id: AgentId; label: string }[] = [
  { id: 'Agent_Prison', label: 'PRISON' },
  { id: 'Agent_Developer', label: 'DEVELOPER' },
  { id: 'Agent_Town', label: 'TOWN' },
]

export default function AgentIndicator() {
  const thinkingAgent = useConversationStore((s) => s.thinkingAgent)

  return (
    <div className="flex gap-6 justify-center py-3 border-b border-border">
      {AGENTS.map(({ id, label }) => {
        const isThinking = thinkingAgent === id
        return (
          <div key={id} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isThinking ? 'bg-primary' : 'bg-thinking'}`} />
            <span className={`text-sm font-mono tracking-widest ${isThinking ? 'text-primary' : 'text-muted'}`}>
              {label}
            </span>
            {isThinking && <ThinkingDots />}
          </div>
        )
      })}
    </div>
  )
}
