/**
 * Placeholder waveform.
 *
 * Deterministic from `seed` so the shape stays put across re-renders instead
 * of shimmering. Replaced by real peak data once the audio pipeline lands.
 */
/** Pure hash: same (seed, index) always yields the same amplitude. */
const amplitudeAt = (seed: number, index: number): number => {
  const x = Math.sin(seed * 127.1 + index * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function Waveform({ seed = 7, bars = 72 }: { seed?: number; bars?: number }) {
  const width = 720;
  const height = 52;
  const gap = width / bars;

  return (
    <svg
      className="wave"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Forma de onda del audio cargado"
    >
      {Array.from({ length: bars }, (_, i) => {
        const amplitude = 0.18 + amplitudeAt(seed, i) * 0.82;
        const barHeight = amplitude * (height - 8);
        return (
          <rect
            key={i}
            className="wave__bar"
            x={i * gap}
            y={(height - barHeight) / 2}
            width={Math.max(1.5, gap - 3)}
            height={barHeight}
            rx="1"
          />
        );
      })}
    </svg>
  );
}
