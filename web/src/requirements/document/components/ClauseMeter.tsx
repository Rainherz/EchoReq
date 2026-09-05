/** Umbral a partir del cual un requisito deja de ser estimable. */
export const ATOMIC_LIMIT = 2;

/** Segmentos dibujados. Un requisito por encima llena la escala y muestra su número real. */
const SCALE = 5;

/**
 * Responsabilidades empaquetadas en un requisito, sobre una escala fija.
 *
 * La escala es constante entre filas a propósito: con barras que crecen sin
 * tope, dos requisitos solo se comparan midiendo el ancho. Con cinco casillas
 * iguales se comparan de un vistazo.
 */
export function ClauseMeter({ count }: { count: number }) {
  const over = count > ATOMIC_LIMIT;
  const filled = Math.min(count, SCALE);

  return (
    <span className={over ? "meter meter--over" : "meter"}>
      <span className="meter__track" aria-hidden="true">
        {Array.from({ length: SCALE }, (_, i) => (
          <i
            key={i}
            className={i < filled ? "meter__seg meter__seg--on" : "meter__seg"}
          />
        ))}
      </span>
      <span className="meter__count">
        {count}/{SCALE}
      </span>
    </span>
  );
}
