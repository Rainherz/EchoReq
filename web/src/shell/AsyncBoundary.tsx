import type { ReactNode } from "react";
import type { Resource } from "../adapters/api/useResource";

interface AsyncBoundaryProps<T> {
  resource: Resource<T>;
  children: (data: T) => ReactNode;
  empty?: ReactNode;
}

/**
 * Estados de carga y error de una lectura de la API.
 *
 * El error se muestra completo y con un botón de reintento explícito. Durante
 * una corrida del estudio el revisor tiene que poder distinguir "el backend no
 * responde" de "no hay nada pendiente": ocultar la falla detrás de una pantalla
 * vacía haría pasar una caída por una cola terminada.
 */
export function AsyncBoundary<T>({
  resource,
  children,
  empty,
}: AsyncBoundaryProps<T>) {
  const { data, error, loading, reload } = resource;

  if (error !== null) {
    return (
      <div className="card">
        <div className="card__head">No se pudo cargar</div>
        <p style={{ margin: "0 0 .7rem", fontSize: ".88rem", lineHeight: 1.55 }}>
          {error}
        </p>
        <button type="button" className="btn btn--small" onClick={reload}>
          Reintentar
        </button>
      </div>
    );
  }

  if (loading && data === null) {
    return (
      <div className="card">
        <div className="card__head">Cargando…</div>
      </div>
    );
  }

  if (data === null || (Array.isArray(data) && data.length === 0)) {
    return <>{empty ?? <div className="card">Sin datos.</div>}</>;
  }

  return <>{children(data)}</>;
}
