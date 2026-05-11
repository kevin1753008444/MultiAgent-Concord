import { useCallback, useEffect, useRef, useState } from 'react'

export type MicMode = 'keyboard' | 'physical'
export type MicState = 'idle' | 'pending' | 'listening'

const HOLD_THRESHOLD_MS = 300  // must hold before recognition fires
const AUDIO_SPIKE_THRESHOLD = 0.15
const AUDIO_COOLDOWN_MS = 1500

export function useMicInput(
  mode: MicMode | null,
  onTranscript: (text: string) => void,
  onInterim?: (text: string) => void,
) {
  const [micState, setMicState] = useState<MicState>('idle')

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const thresholdRef = useRef<number | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript
  const onInterimRef = useRef(onInterim)
  onInterimRef.current = onInterim

  // Physical-mode refs
  const audioCtxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const isListeningRef = useRef(false)
  const inCooldownRef = useRef(false)

  const stopRecognition = useCallback(() => {
    if (thresholdRef.current) { clearTimeout(thresholdRef.current); thresholdRef.current = null }
    if (recognitionRef.current) { try { recognitionRef.current.abort() } catch { /* ignore */ }; recognitionRef.current = null }
    isListeningRef.current = false
    setMicState('idle')
  }, [])

  const startRecognition = useCallback(() => {
    const SR =
      (window as Window & { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ??
      (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition
    if (!SR) { console.warn('SpeechRecognition not supported'); setMicState('idle'); return }

    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    recognitionRef.current = rec
    isListeningRef.current = true
    setMicState('listening')

    rec.onresult = (e) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      if (interim) onInterimRef.current?.(interim)
      const text = final.trim()
      if (text) onTranscriptRef.current(text)
    }

    rec.onerror = () => {
      recognitionRef.current = null
      isListeningRef.current = false
      setMicState('idle')
      inCooldownRef.current = true
      setTimeout(() => { inCooldownRef.current = false }, AUDIO_COOLDOWN_MS)
    }

    rec.onend = () => {
      recognitionRef.current = null
      isListeningRef.current = false
      setMicState(prev => prev === 'listening' ? 'idle' : prev)
    }

    rec.start()
  }, [])

  // ── Push-to-talk API (used by keyboard mode and physical mode externally) ──

  const startHold = useCallback(() => {
    if (isListeningRef.current || thresholdRef.current) return
    setMicState('pending')
    thresholdRef.current = window.setTimeout(startRecognition, HOLD_THRESHOLD_MS)
  }, [startRecognition])

  const endHold = useCallback(() => {
    if (thresholdRef.current) {
      clearTimeout(thresholdRef.current)
      thresholdRef.current = null
      setMicState('idle')
      return
    }
    // Stop gracefully so recognition finalises and fires onresult
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
    }
  }, [])

  // ── Physical mode: audio spike detection ──────────────────────────────────
  useEffect(() => {
    if (mode !== 'physical') return

    let cancelled = false

    navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(stream => {
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const buf = new Uint8Array(analyser.frequencyBinCount)

      function tick() {
        if (cancelled) return
        analyser.getByteTimeDomainData(buf)
        let maxDev = 0
        for (let i = 0; i < buf.length; i++) maxDev = Math.max(maxDev, Math.abs(buf[i] - 128))
        const level = maxDev / 128

        if (level > AUDIO_SPIKE_THRESHOLD && !isListeningRef.current && !inCooldownRef.current) {
          startRecognition()
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }).catch(err => console.warn('Microphone access denied:', err))

    return () => {
      cancelled = true
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null
      audioCtxRef.current?.close(); audioCtxRef.current = null
    }
  }, [mode, startRecognition])

  // ── Cleanup on mode change / unmount ──────────────────────────────────────
  useEffect(() => { if (mode === null) stopRecognition() }, [mode, stopRecognition])
  useEffect(() => () => stopRecognition(), [stopRecognition])

  return { micState, startHold, endHold }
}
