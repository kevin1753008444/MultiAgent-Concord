export default function ThinkingDots() {
  return (
    <span className="inline-flex gap-1 items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 rounded-full bg-thinking animate-blink"
          style={{ animationDelay: `${i * 0.4}s` }}
        />
      ))}
    </span>
  )
}
