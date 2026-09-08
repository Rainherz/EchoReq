import { useState } from "react";
import type { FormEvent, RefObject } from "react";
import {
  addGlossaryActor,
  removeGlossaryActor,
  updateGlossaryActor,
} from "../../../adapters/api/client";
import type { GlossaryActor } from "../../../adapters/api/client";

interface GlossaryProps {
  projectId: string;
  actors: GlossaryActor[];
  /** Requisitos que terminan en cada rol: los que ya lo nombran más los que
      una decisión mandó ahí. Cero es un rol que nadie pide. */
  reach: Map<string, number>;
  name: string;
  onName: (name: string) => void;
  descriptionRef: RefObject<HTMLInputElement | null>;
  onChange: () => void;
}

/**
 * Los roles que el proyecto reconoce.
 *
 * Declara quién existe; no reescribe quién pidió. Un nombre que aparece en un
 * requisito y no figura acá queda pendiente, y sigue pendiente hasta que
 * alguien arregle el texto —una tabla de alias que tradujera dejaría el
 * documento diciendo lo que no quiere decir, prolijo por fuera.
 *
 * Es configuración, no dato del estudio: se corrige y se borra. El log de
 * requisitos y las decisiones de revisión llevan un trigger que rechaza
 * UPDATE y DELETE.
 */
export function Glossary({
  projectId,
  actors,
  reach,
  name,
  onName,
  descriptionRef,
  onChange,
}: GlossaryProps) {
  const [description, setDescription] = useState("");
  const [transversal, setTransversal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return;
    setSaving(true);
    setFailure(null);
    try {
      await addGlossaryActor(
        projectId,
        name.trim(),
        description.trim(),
        transversal,
      );
      onName("");
      setDescription("");
      setTransversal(false);
      onChange();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (actorName: string) => {
    setFailure(null);
    try {
      await removeGlossaryActor(projectId, actorName);
      onChange();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const toggle = async (actor: GlossaryActor) => {
    setFailure(null);
    try {
      await updateGlossaryActor(
        projectId,
        actor.name,
        actor.description,
        !actor.transversal,
      );
      onChange();
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    }
  };

  // Los transversales van aparte: sus conteos no son comparables con los de un
  // rol de dominio. «Directivo 10 · Usuario 2» en la misma columna sugiere que
  // el Usuario pide dos cosas, cuando lo que dice es que dos requisitos no
  // dependen de quién sos.
  const dominio = actors.filter((actor) => !actor.transversal);
  const transversales = actors.filter((actor) => actor.transversal);
  const sinUsar = dominio.filter((actor) => (reach.get(actor.name) ?? 0) === 0);

  return (
    <div className="card">
      <div className="card__head">
        Roles declarados
        <span className="card__count">
          {dominio.length - sinUsar.length} con requisitos · {sinUsar.length} sin
          usar
        </span>
      </div>

      <ul className="glossary">
        {dominio.map((actor) => {
          const uses = reach.get(actor.name) ?? 0;
          return (
            <li key={actor.name} className="glossary__item">
              <span className="glossary__name">{actor.name}</span>
              <span className="glossary__reach">
                {uses === 0 ? "ningún requisito" : `${uses}`}
              </span>
              {actor.description && (
                <span className="glossary__desc">{actor.description}</span>
              )}
              <button
                type="button"
                className="glossary__drop"
                aria-pressed={actor.transversal}
                onClick={() => toggle(actor)}
              >
                {actor.transversal ? "es de dominio" : "es transversal"}
              </button>
              <button
                type="button"
                className="glossary__drop"
                aria-label={`Sacar ${actor.name} del glosario`}
                onClick={() => remove(actor.name)}
              >
                sacar
              </button>
            </li>
          );
        })}
      </ul>

      {transversales.length > 0 && (
        <>
          <span className="glossary__group">Transversales</span>
          <p className="actors__hint">
            No distinguen a nadie: los requisitos que los nombran aplican a
            cualquiera. Sus conteos van aparte porque no son comparables con
            los de arriba.
          </p>
          <ul className="glossary">
            {transversales.map((actor) => (
              <li key={actor.name} className="glossary__item">
                <span className="glossary__name">{actor.name}</span>
                <span className="glossary__reach">
                  {reach.get(actor.name) ?? 0}
                </span>
                {actor.description && (
                  <span className="glossary__desc">{actor.description}</span>
                )}
                <button
                  type="button"
                  className="glossary__drop"
                  aria-pressed
                  onClick={() => toggle(actor)}
                >
                  es de dominio
                </button>
                <button
                  type="button"
                  className="glossary__drop"
                  aria-label={`Sacar ${actor.name} del glosario`}
                  onClick={() => remove(actor.name)}
                >
                  sacar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <form className="glossary__form" onSubmit={submit}>
        <label className="glossary__field">
          <span className="label">Rol</span>
          <input
            className="field"
            type="text"
            maxLength={60}
            value={name}
            placeholder="directivo"
            onChange={(event) => onName(event.target.value)}
          />
        </label>
        <label className="glossary__field glossary__field--wide">
          {/* No «qué hace»: eso ya lo dice la lista de quién pide qué, y
              repetirlo daría dos fuentes que se desincronizan. La pregunta que
              el glosario contesta es de límite —¿«subdirector» entra en
              «directivo»?—, que es la que junta quince nombres en seis. */}
          <span className="label">A quién incluye</span>
          <input
            ref={descriptionRef}
            className="field"
            type="text"
            maxLength={280}
            value={description}
            placeholder="Director y subdirector de una IE. No incluye al jefe de gestión."
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className="glossary__check">
          <input
            type="checkbox"
            checked={transversal}
            onChange={(event) => setTransversal(event.target.checked)}
          />
          <span>
            Transversal
            <span className="decision__optionHint">
              Aplica a cualquiera; no distingue rol.
            </span>
          </span>
        </label>
        <button
          type="submit"
          className="btn btn--small"
          disabled={saving || name.trim().length < 2}
        >
          {saving ? "Guardando…" : "Declarar"}
        </button>
      </form>

      {failure && (
        <p className="resolve__error" role="alert">
          {failure}
        </p>
      )}
    </div>
  );
}
