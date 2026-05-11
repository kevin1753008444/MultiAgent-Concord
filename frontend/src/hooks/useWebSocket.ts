import { useEffect, useRef, useCallback } from 'react'
import { useConversationStore } from '../store/conversationStore'
import type { AgentId, WsMessage } from '../types'

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const WS_URL = `${wsProtocol}//${window.location.host}/ws`
const HEARTBEAT_MS = 15000
const RECONNECT_MS = 2500

// ── Audio queue ────────────────────────────────────────────────────────────
// Plays base64 MP3 clips sequentially so agent voices never overlap.
const audioQueue: string[] = []
let audioPlaying = false
let currentAudio: HTMLAudioElement | null = null

function enqueueAudio(base64Mp3: string) {
  audioQueue.push(base64Mp3)
  if (!audioPlaying) drainQueue()
}

function drainQueue() {
  const next = audioQueue.shift()
  if (!next) { audioPlaying = false; currentAudio = null; return }
  audioPlaying = true
  const audio = new Audio(`data:audio/mpeg;base64,${next}`)
  currentAudio = audio
  audio.onended = drainQueue
  audio.onerror = drainQueue
  audio.play().catch(drainQueue)
}

export function stopAudio() {
  audioQueue.length = 0
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
  audioPlaying = false
}
// ──────────────────────────────────────────────────────────────────────────

interface WebSocketOptions {
  playAudio?: boolean
  audioFilterAgentId?: AgentId
}

export function useWebSocket(options: WebSocketOptions = {}) {
  const { playAudio = true, audioFilterAgentId } = options
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<number | null>(null)
  const reconnectRef = useRef<number | null>(null)
  const shouldReconnectRef = useRef(true)
  const {
    addMessage,
    addModeratorMessage,
    addUserMessage,
    setThinking,
    setWeather,
    setWsConnected,
    setLastWsEvent,
    setTranscribingText,
    reset,
  } = useConversationStore()

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: WsMessage = JSON.parse(event.data)
      setLastWsEvent(data.type)
      switch (data.type) {
        case 'agent_message':
          addMessage(data)
          if (playAudio && data.audio_data && (!audioFilterAgentId || data.agent_id === audioFilterAgentId)) {
            enqueueAudio(data.audio_data)
          }
          break
        case 'moderator_message':
          addModeratorMessage(data)
          break
        case 'user_message':
          addUserMessage(data)
          break
        case 'agent_thinking':
          setThinking(data.agent_id)
          break
        case 'weather_update':
          setWeather(data.data)
          break
        case 'user_transcribing':
          setTranscribingText(data.is_final ? null : data.text ?? null)
          break
        case 'reset_ack':
          reset()
          break
      }
    } catch (e) {
      console.error('WS parse error', e)
    }
  }, [
    addMessage,
    addModeratorMessage,
    addUserMessage,
    audioFilterAgentId,
    playAudio,
    reset,
    setLastWsEvent,
    setThinking,
    setTranscribingText,
    setWeather,
  ])

  useEffect(() => {
    shouldReconnectRef.current = true

    function clearHeartbeat() {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
    }

    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onmessage = handleMessage
      ws.onopen = () => {
        setWsConnected(true)
        setLastWsEvent('connected')
        clearHeartbeat()
        heartbeatRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, HEARTBEAT_MS)
      }
      ws.onclose = () => {
        clearHeartbeat()
        setWsConnected(false)
        setLastWsEvent('disconnected')
        if (shouldReconnectRef.current) {
          reconnectRef.current = window.setTimeout(connect, RECONNECT_MS)
        }
      }
      ws.onerror = () => {
        setLastWsEvent('error')
      }
    }

    connect()

    return () => {
      shouldReconnectRef.current = false
      clearHeartbeat()
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [handleMessage, setLastWsEvent, setWsConnected])

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  return { send }
}
