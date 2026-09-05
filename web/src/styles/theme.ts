/**
 * Sincroniza la clase que Radix usa para sus escalas oscuras.
 *
 * Radix publica cada escala oscura bajo `.dark`, así que la preferencia del
 * sistema —o la elección explícita en `data-theme`— tiene que traducirse a
 * esa clase en el elemento raíz. Sin esto la aplicación resolvería siempre
 * la escala clara.
 */

const QUERY = "(prefers-color-scheme: dark)";

function isDark(): boolean {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark") return true;
  if (explicit === "light") return false;
  return window.matchMedia(QUERY).matches;
}

function apply(): void {
  document.documentElement.classList.toggle("dark", isDark());
}

/** Aplica el tema y queda escuchando el cambio de preferencia del sistema. */
export function watchTheme(): void {
  apply();
  window.matchMedia(QUERY).addEventListener("change", apply);

  // `data-theme` lo puede cambiar el visor, no solo la aplicación.
  new MutationObserver(apply).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}
