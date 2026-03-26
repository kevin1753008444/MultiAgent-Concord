import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void:      '#000000',
        surface:   '#0a0a0a',
        border:    '#2a2a2a',
        primary:   '#ffffff',
        secondary: '#999999',
        muted:     '#606060',
        prison:    '#d4cfc8',
        developer: '#ffffff',
        town:      '#8ab4cf',
        thinking:  '#555555',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'blink': 'blink 1.2s step-end infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
    },
  },
  plugins: [],
} satisfies Config
