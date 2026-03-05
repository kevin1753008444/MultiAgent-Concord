import { create } from 'zustand'
import type { AgentMessage, AgentId, WeatherData } from '../types'

interface ConversationState {
  messages: AgentMessage[]
  thinkingAgent: AgentId | null
  weather: WeatherData | null
  isAutoMode: boolean

  addMessage: (msg: AgentMessage) => void
  setThinking: (agentId: AgentId | null) => void
  setWeather: (data: WeatherData) => void
  setAutoMode: (val: boolean) => void
  reset: () => void
}

export const useConversationStore = create<ConversationState>((set) => ({
  messages: [],
  thinkingAgent: null,
  weather: null,
  isAutoMode: false,

  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg], thinkingAgent: null })),
  setThinking: (agentId) => set({ thinkingAgent: agentId }),
  setWeather: (data) => set({ weather: data }),
  setAutoMode: (val) => set({ isAutoMode: val }),
  reset: () => set({ messages: [], thinkingAgent: null }),
}))
