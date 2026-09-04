import { useEffect, useState } from "react";

/**
 * Elapsed time since the current proposal was presented.
 *
 * Display only. The measurement of record is the `presentedAt` / `decidedAt`
 * pair stored with the decision — this component never feeds it.
 */
export function ReviewTimer({ presentedAt }: { presentedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - presentedAt) / 1000));
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <span className="timer" role="timer" aria-label="Tiempo en esta propuesta">
      <span className="timer__pulse" aria-hidden="true" />
      {mm}:{ss}
    </span>
  );
}
