interface LockedByProgressProps {
  /** Reunión en la que esta persona todavía tiene propuestas sin decidir. */
  blockedAt: number | null;
  what: string;
  onGo: () => void;
}

/**
 * Pantalla cerrada hasta terminar de revisar.
 *
 * El documento es uno solo para el proyecto y avanza con las decisiones del
 * que llega primero. Quien todavía no decidió sus propuestas y abre la
 * especificación está leyendo el resultado de las propuestas que tiene que
 * juzgar, ya redactadas por el otro revisor.
 *
 * Eso no es una molestia de interfaz: dos series que se leyeron entre sí
 * dejan de ser independientes, y la concordancia entre ellas ya no mide
 * acuerdo, mide copia. Por eso cierra en vez de advertir.
 */
export function LockedByProgress({
  blockedAt,
  what,
  onGo,
}: LockedByProgressProps) {
  return (
    <div className="card">
      <div className="card__head">{what} se abre al terminar de revisar</div>
      <p style={{ margin: "0 0 .9rem", maxWidth: "68ch", lineHeight: 1.6 }}>
        {blockedAt === null
          ? "Todavía no hay ninguna reunión terminada."
          : `Te quedan propuestas sin decidir en la reunión ${blockedAt}.`}{" "}
        El documento avanza con las decisiones de quien llega primero, así que
        leerlo ahora sería ver, ya redactadas por el otro revisor, las mismas
        propuestas que todavía tenés que juzgar. Dos criterios que se leyeron
        entre sí dejan de ser dos.
      </p>
      <button type="button" className="btn btn--small" onClick={onGo}>
        Ir a Revisión
      </button>
    </div>
  );
}
