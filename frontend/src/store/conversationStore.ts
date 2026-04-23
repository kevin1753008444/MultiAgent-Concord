import { create } from 'zustand'
import type { ChatMessage, AgentMessage, ModeratorMessage, UserMessage, AgentId, WeatherData } from '../types'

interface ConversationState {
  messages: ChatMessage[]
  thinkingAgent: AgentId | null
  weather: WeatherData | null
  isAutoMode: boolean
  wsConnected: boolean

  addMessage: (msg: AgentMessage) => void
  addModeratorMessage: (msg: ModeratorMessage) => void
  addUserMessage: (msg: UserMessage) => void
  setThinking: (agentId: AgentId | null) => void
  setWeather: (data: WeatherData) => void
  setAutoMode: (val: boolean) => void
  setWsConnected: (val: boolean) => void
  reset: () => void
}

export const useConversationStore = create<ConversationState>((set) => ({
  messages: [],
  thinkingAgent: null,
  weather: null,
  isAutoMode: false,
  wsConnected: false,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg], thinkingAgent: null })),
  addModeratorMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  addUserMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setThinking: (agentId) => set({ thinkingAgent: agentId }),
  setWeather: (data) => set({ weather: data }),
  setAutoMode: (val) => set({ isAutoMode: val }),
  setWsConnected: (val) => set({ wsConnected: val }),
  reset: () => set({ messages: [], thinkingAgent: null }),
}))
