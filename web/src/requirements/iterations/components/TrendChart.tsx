import { useState } from "react";

export interface TrendPoint {
  x: number;
  y: number;
  /** Etiqueta del eje horizontal. */
  label: string;
  /** Texto del tooltip, ya formateado. */
  detail: string;
}

interface TrendChartProps {
  points: TrendPoint[];
  /** Nombre de la magnitud. El gráfico tiene una sola serie, así que no lleva leyenda. */
  measure: string;
  axisLabel: string;
  /** Sufijo de las etiquetas de valor: "s", "%", vacío. */
  unit?: string;
  /** Umbral opcional: se dibuja como línea de referencia. */
  threshold?: { value: number; label: string };
  tone?: "ok" | "warn";
}

const W = 720;
const H = 240;
const PAD = { top: 18, right: 54, bottom: 38, left: 46 };

const niceTop = (max: number): number => {
  if (max <= 1) return 1;
  const step = max <= 5 ? 1 : max <= 20 ? 5 : max <= 100 ? 20 : 50;
  return Math.ceil(max / step) * step;
};

/**
 * Serie única a lo largo de las iteraciones.
 *
 * Cada magnitud lleva su propio gráfico. Superponer responsabilidades y
 * segundos en dos ejes verticales haría que el cruce de las curvas parezca
 * un hallazgo cuando solo depende de las escalas elegidas.
 */
export function TrendChart({
  points,
  measure,
  axisLabel,
  unit = "",
  threshold,
  tone = "ok",
}: TrendChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const color = tone === "warn" ? "var(--warn)" : "var(--ok)";
  const top = niceTop(
    Math.max(...points.map((p) => p.y), threshold?.value ?? 0),
  );

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH;

  const ticks = [0, top / 2, top];
  const path = points.map((p, i) => `${x(i)},${y(p.y)}`).join(" ");
  const last = points[points.length - 1];
  const active = hover !== null ? points[hover] : null;

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${measure} por iteración. ${points
          .map((p) => `${p.label}: ${p.y}${unit}`)
          .join("; ")}`}
        onMouseLeave={() => setHover(null)}
      >
        <g className="chart__grid">
          {ticks.map((tick) => (
            <line key={tick} x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
          ))}
        </g>

        <g className="chart__tick" textAnchor="end">
          {ticks.map((tick) => (
            <text key={tick} x={PAD.left - 9} y={y(tick) + 4}>
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          ))}
        </g>

        {threshold && (
          <>
            <line
              className="chart__threshold"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(threshold.value)}
              y2={y(threshold.value)}
            />
            <text
              className="chart__threshold-label"
              x={W - PAD.right + 6}
              y={y(threshold.value) + 4}
            >
              {threshold.label}
            </text>
          </>
        )}

        <polyline
          className="chart__line"
          style={{ stroke: color }}
          points={path}
          fill="none"
        />

        {points.map((point, i) => (
          <circle
            key={point.x}
            cx={x(i)}
            cy={y(point.y)}
            r={hover === i ? 6 : 4.5}
            style={{ fill: color }}
            className="chart__dot"
          />
        ))}

        {/* Etiqueta directa del último valor: la serie no necesita leyenda. */}
        <text
          className="chart__endlabel"
          x={x(points.length - 1) + 11}
          y={y(last.y) + 4}
          style={{ fill: color }}
        >
          {last.y}
          {unit}
        </text>

        <g className="chart__tick" textAnchor="middle">
          {points.map((point, i) => (
            <text key={point.x} x={x(i)} y={H - 14}>
              {point.label}
            </text>
          ))}
        </g>

        <text className="chart__axis" x={PAD.left + plotW / 2} y={H - 1} textAnchor="middle">
          {axisLabel}
        </text>

        {active && (
          <line
            className="chart__crosshair"
            x1={x(hover!)}
            x2={x(hover!)}
            y1={PAD.top}
            y2={PAD.top + plotH}
          />
        )}

        {/* Zonas de hover más anchas que los puntos. */}
        {points.map((point, i) => (
          <rect
            key={`hit-${point.x}`}
            x={x(i) - plotW / (points.length * 2 || 1) / 1.2}
            y={PAD.top}
            width={Math.max(28, plotW / points.length)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      <figcaption className="chart__caption">
        {active ? (
          <>
            <strong>{active.label}</strong> · {active.detail}
          </>
        ) : (
          measure
        )}
      </figcaption>
    </figure>
  );
}
