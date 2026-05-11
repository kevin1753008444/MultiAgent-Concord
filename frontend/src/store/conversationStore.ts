import { create } from 'zustand'
import type {
  AgentId,
  AgentMessage,
  ChatMessage,
  DirectedAt,
  HistoryMessage,
  ModeratorMessage,
  UserMessage,
  WeatherData,
} from '../types'

interface ConversationState {
  messages: ChatMessage[]
  thinkingAgent: AgentId | null
  weather: WeatherData | null
  isAutoMode: boolean
  wsConnected: boolean
  lastWsEvent: string | null
  transcribingText: string | null

  addMessage: (msg: AgentMessage) => void
  addModeratorMessage: (msg: ModeratorMessage) => void
  addUserMessage: (msg: UserMessage) => void
  setMessagesFromHistory: (history: HistoryMessage[]) => void
  setThinking: (agentId: AgentId | null) => void
  setWeather: (data: WeatherData) => void
  setAutoMode: (val: boolean) => void
  setWsConnected: (val: boolean) => void
  setLastWsEvent: (val: string | null) => void
  setTranscribingText: (text: string | null) => void
  reset: () => void
}

function isAgentId(sender: string): sender is AgentId {
  return sender === 'Agent_Prison' || sender === 'Agent_Developer' || sender === 'Agent_Town'
}

function normalizeDirectedAt(value: string | null | undefined): DirectedAt {
  if (value === 'Agent_Prison' || value === 'Agent_Developer' || value === 'Agent_Town' || value === 'ALL') {
    return value
  }
  return 'NONE'
}

function historyToChatMessage(msg: HistoryMessage): ChatMessage | null {
  const timestamp = msg.created_at ?? new Date().toISOString()
  if (isAgentId(msg.sender)) {
    return {
      type: 'agent_message',
      agent_id: msg.sender,
      speech: msg.speech,
      directed_at: normalizeDirectedAt(msg.directed_at),
      urgency_score: msg.urgency_score ?? 5,
      implicit_challenge_to: null,
      weather_snapshot: msg.weather_snapshot ?? { condition: 'Unknown', temp_f: 0, time_str: '' },
      timestamp,
    }
  }
  if (msg.sender === 'MODERATOR') {
    return {
      type: 'moderator_message',
      speech: msg.speech,
      timestamp,
    }
  }
  if (msg.sender === 'USER') {
    return {
      type: 'user_message',
      speech: msg.speech,
      timestamp,
    }
  }
  return null
}

export const useConversationStore = create<ConversationState>((set) => ({
  messages: [],
  thinkingAgent: null,
  weather: null,
  isAutoMode: false,
  wsConnected: false,
  lastWsEvent: null,
  transcribingText: null,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg], thinkingAgent: null })),
  addModeratorMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  addUserMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessagesFromHistory: (history) => set({
    messages: history.map(historyToChatMessage).filter((msg): msg is ChatMessage => msg !== null),
  }),
  setThinking: (agentId) => set({ thinkingAgent: agentId }),
  setWeather: (data) => set({ weather: data }),
  setAutoMode: (val) => set({ isAutoMode: val }),
  setWsConnected: (val) => set({ wsConnected: val }),
  setLastWsEvent: (val) => set({ lastWsEvent: val }),
  setTranscribingText: (text) => set({ transcribingText: text }),
  reset: () => set({ messages: [], thinkingAgent: null }),
}))
