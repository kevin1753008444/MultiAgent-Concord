import { useEffect } from 'react'
import { useConversationStore } from '../store/conversationStore'
import type { HistoryMessage } from '../types'

export function useHydrateHistory() {
  const setMessagesFromHistory = useConversationStore((s) => s.setMessagesFromHistory)

  useEffect(() => {
    let cancelled = false
    fetch('/api/chat/history')
      .then((response) => response.json())
      .then((history: HistoryMessage[]) => {
        if (!cancelled) setMessagesFromHistory(history)
      })
      .catch(() => {
        if (!cancelled) setMessagesFromHistory([])
      })

    return () => {
      cancelled = true
    }
  }, [setMessagesFromHistory])
}
