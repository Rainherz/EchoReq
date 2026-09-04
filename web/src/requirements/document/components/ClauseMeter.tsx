/** Threshold past which a requirement stops being atomic enough to estimate. */
export const ATOMIC_LIMIT = 2;

/**
 * One bar per obligation packed into a requirement.
 *
 * Turns accumulation into something visible at a glance: a requirement that
 * grows a bar per iteration is the drift the study measures.
 */
export function ClauseMeter({ count }: { count: number }) {
  const over = count > ATOMIC_LIMIT;

  return (
    <span
      className={over ? "meter meter--over" : "meter"}
      title={`${count} responsabilidad${count === 1 ? "" : "es"}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className="meter__bar"
          style={{ height: `${5 + i * 3}px` }}
        />
      ))}
    </span>
  );
}
