import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./shell/AppShell";
import type { Section } from "./shell/AppShell";
import { AsyncBoundary } from "./shell/AsyncBoundary";
import { MeetingPicker } from "./shell/MeetingPicker";
import { CaptureScreen } from "./requirements/capture/CaptureScreen";
import { NewMeeting } from "./requirements/capture/NewMeeting";
import { DiscoveryScreen } from "./requirements/discovery/DiscoveryScreen";
import { ReviewScreen } from "./requirements/review/ReviewScreen";
import { DocumentScreen } from "./requirements/document/DocumentScreen";
import { TraceabilityScreen } from "./requirements/traceability/TraceabilityScreen";
import { IterationsScreen } from "./requirements/iterations/IterationsScreen";
import { AgreementScreen } from "./requirements/agreement/AgreementScreen";
import { ExportScreen } from "./requirements/export/ExportScreen";
import { WorkspacesScreen } from "./workspaces/WorkspacesScreen";
import {
  correctDecision,
  fetchMeetings,
  fetchParticipants,
  fetchSpeakers,
  fetchProjects,
  fetchQueue,
  fetchTurns,
  recordDecision,
} from "./adapters/api/client";
import type {
  Meeting,
  Participant,
  Project,
  RecordDecisionInput,
} from "./adapters/api/client";
import { ParticipantPicker } from "./shell/ParticipantPicker";
import type { ReviewAction } from "./requirements/domain/types";
import { useResource } from "./adapters/api/useResource";

/** Último proyecto abierto. Es contexto del usuario, no de la URL: la sección
    sí va en el hash porque un enlace a un requisito tiene que poder
    compartirse. */
const LAST_PROJECT = "echoreq.project";

/** Quién revisó la última vez en este navegador. Se recuerda para que no haya
    que elegirlo en cada visita, pero nunca se adivina: si el guardado ya no
    existe, se cae al primero de la lista y queda a la vista en la barra. */
const LAST_PARTICIPANT = "echoreq.participant";

const SECTIONS: Section[] = [
  "sessions",
  "discovery",
  "review",
  "document",
  "traceability",
  "iterations",
  "agreement",
  "export",
];

const SECTION_LABEL: Record<Section, string> = {
  sessions: "Sesiones",
  discovery: "Descubrimiento",
  review: "Revisión",
  document: "Documento",
  traceability: "Trazabilidad",
  iterations: "Iteraciones",
  agreement: "Concordancia",
  export: "Exportar",
};

/**
 * Ruta actual.
 *
 * `#document/R-02` abre el documento con ese requisito ya seleccionado: es
 * cómo la matriz de trazabilidad manda a leer la historia de una fila.
 */
interface Route {
  section: Section;
  focus: string | null;
}

function routeFromHash(): Route {
  const [raw, focus] = window.location.hash.replace("#", "").split("/");
  const section = SECTIONS.includes(raw as Section) ? (raw as Section) : "sessions";
  return { section, focus: focus ? decodeURIComponent(focus) : null };
}

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [meetingId, setMeetingId] = useState<string | null>(null);

  // El último proyecto abierto se reabre solo: quien vuelve a la herramienta
  // sigue en el proyecto donde estaba, no en una lista.
  const projects = useResource(useCallback(() => fetchProjects(), []), []);
  const [restored, setRestored] = useState(false);

  if (!restored && projects.data) {
    setRestored(true);
    const remembered = window.localStorage.getItem(LAST_PROJECT);
    const match = projects.data.find((p) => p.id === remembered);
    if (match) setProject(match);
  }

  // Los participantes son del instrumento, no del proyecto: el mismo revisor
  // puede aparecer en varias cadenas.
  const participants = useResource(useCallback(() => fetchParticipants(), []), []);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [identityRestored, setIdentityRestored] = useState(false);

  if (!identityRestored && participants.data) {
    setIdentityRestored(true);
    const remembered = window.localStorage.getItem(LAST_PARTICIPANT);
    const match = participants.data.find((p) => p.id === remembered);
    setParticipantId(match?.id ?? participants.data[0]?.id ?? null);
  }

  const chooseParticipant = (next: string) => {
    window.localStorage.setItem(LAST_PARTICIPANT, next);
    setParticipantId(next);
  };

  const identity = participants.data ? (
    <ParticipantPicker
      participants={participants.data}
      selectedId={participantId}
      onSelect={chooseParticipant}
      onCreated={(created) => {
        participants.reload();
        chooseParticipant(created.id);
      }}
    />
  ) : null;

  const openProject = (next: Project) => {
    window.localStorage.setItem(LAST_PROJECT, next.id);
    setMeetingId(null);
    // Se entra por Sesiones. Conservar la sección del proyecto anterior dejaba
    // a un proyecto nuevo mirando una cola de revisión que no puede existir.
    window.location.hash = "sessions";
    setRoute({ section: "sessions", focus: null });
    setProject(next);
  };

  const leaveProject = () => {
    window.localStorage.removeItem(LAST_PROJECT);
    setProject(null);
  };

  // Sin participante no se puede atribuir una decisión, y una atribución
  // equivocada no se corrige después. Se espera a saber quién revisa.
  if (participantId === null) {
    return (
      <WorkspacesScreen
        projects={projects}
        onOpen={openProject}
      />
    );
  }

  // Sin proyecto abierto la aplicación no tiene contexto: ni reuniones, ni
  // cola, ni documento. La lista de proyectos es la entrada real.
  if (project === null) {
    return (
      <WorkspacesScreen
        projects={projects}
        onOpen={openProject}
      />
    );
  }

  return (
    <ProjectApp
      // Cambiar de participante reinicia las pantallas que llevan estado de
      // revisión: la cola es de la persona, no del proyecto.
      key={participantId}
      project={project}
      participantId={participantId}
      identity={identity}
      otherReviewers={Math.max(0, (participants.data?.length ?? 1) - 1)}
      allParticipants={participants.data ?? []}
      onLeave={leaveProject}
      route={route}
      setRoute={setRoute}
      meetingId={meetingId}
      setMeetingId={setMeetingId}
    />
  );
}

interface ProjectAppProps {
  project: Project;
  participantId: string;
  identity: React.ReactNode;
  /** Cuántas otras personas pueden revisar la misma cola. */
  otherReviewers: number;
  /** Todos los revisores, para cruzar sus decisiones en Concordancia. */
  allParticipants: Participant[];
  onLeave: () => void;
  route: Route;
  setRoute: (route: Route) => void;
  meetingId: string | null;
  setMeetingId: (id: string) => void;
}

function ProjectApp({
  project,
  participantId,
  identity,
  otherReviewers,
  allParticipants,
  onLeave,
  route,
  setRoute,
  meetingId,
  setMeetingId,
}: ProjectAppProps) {
  const projectId = project.id;
  // Quién arbitra. Sale de su propia columna y no de comparar `role`, que es
  // texto descriptivo que alguien tipea: en la misma base conviven «analista»
  // y «Analista», y un permiso colgado de eso dependería de una mayúscula.
  const isLead =
    allParticipants.find((person) => person.id === participantId)?.isLead ?? false;

  // El routing por hash evita que un refresh saque al revisor de su pantalla
  // en medio de la cola.
  useEffect(() => {
    const sync = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [setRoute]);

  const navigate = (section: Section, focus?: string) => {
    window.location.hash = focus
      ? `${section}/${encodeURIComponent(focus)}`
      : section;
    setRoute({ section, focus: focus ?? null });
  };

  const meetings = useResource(
    useCallback(
      () => fetchMeetings(projectId, participantId),
      [projectId, participantId],
    ),
    [projectId, participantId],
  );

  // Al abrir se elige la primera reunión con trabajo pendiente; si no queda
  // ninguna, la última procesada.
  const selected: Meeting | null = useMemo(() => {
    const list = meetings.data ?? [];
    if (list.length === 0) return null;
    const explicit = list.find((m) => m.id === meetingId);
    if (explicit) return explicit;
    return list.find((m) => m.pendingProposals > 0) ?? list[list.length - 1];
  }, [meetings.data, meetingId]);

  const iteration = selected?.iteration ?? 1;

  // Hasta dónde puede leer el documento esta persona: la última reunión que
  // terminó de decidir. El documento es uno solo para el proyecto y avanza
  // con las decisiones del que llega primero, así que leer más adelante es
  // ver —ya redactadas por el otro revisor— las propuestas que todavía tiene
  // que juzgar. Dos series que se leyeron entre sí dejan de ser
  // independientes, y la concordancia entre ellas mide copia, no acuerdo.
  const progress = useMemo(() => {
    let through = 0;
    let blockedAt: number | null = null;
    for (const meeting of meetings.data ?? []) {
      if (meeting.pendingProposals > 0) {
        blockedAt = meeting.iteration;
        break;
      }
      through = meeting.iteration;
    }
    return { through, blockedAt };
  }, [meetings.data]);
  const meetingLabels = useMemo(
    () => Object.fromEntries((meetings.data ?? []).map((m) => [m.id, m.label])),
    [meetings.data],
  );

  const meetingDates = useMemo(
    () =>
      Object.fromEntries(
        (meetings.data ?? []).map((m) => [
          m.iteration,
          new Date(m.heldAt).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          }),
        ]),
      ),
    [meetings.data],
  );

  const selectedId = selected?.id;
  const selectedIteration = selected?.iteration;

  const queue = useResource(
    useCallback(
      () =>
        selectedIteration === undefined
          ? Promise.resolve([])
          : fetchQueue(projectId, selectedIteration, participantId),
      [projectId, selectedIteration, participantId],
    ),
    [selectedId],
  );

  // La cola cambia con cada decisión, y hay dos pantallas que la consumen.
  // Decidir en Descubrimiento dejaba a Revisión con la cola de antes: las
  // propuestas ya decididas seguían en pantalla y al aceptarlas el backend
  // las rechazaba con 409, que es correcto pero llega tarde y sin explicar
  // nada.
  //
  // Se vuelve a pedir al entrar, no después de cada decisión: refrescarla
  // mientras alguien revisa le movería la cola bajo los pies en medio de la
  // medición.
  const { reload: reloadQueue } = queue;
  useEffect(() => {
    if (route.section === "review" || route.section === "discovery") {
      reloadQueue();
    }
  }, [route.section, reloadQueue]);

  // Quién es cada voz. Se reparte a las pantallas que muestran turnos: sin
  // esto el revisor lee S1 y S2 y no sabe si lo citado lo dijo el cliente o
  // quien lo entrevistaba.
  const voices = useResource(
    useCallback(
      () => (selectedId ? fetchSpeakers(selectedId) : Promise.resolve([])),
      [selectedId],
    ),
    [selectedId],
  );

  const speakerNames = useMemo(
    () =>
      Object.fromEntries(
        (voices.data ?? []).map((v) => [v.code, { role: v.role, name: v.name }]),
      ),
    [voices.data],
  );

  // La transcripción completa: Descubrimiento la lee entera para juzgar si
  // los candidatos cubren lo que se habló.
  const turns = useResource(
    useCallback(
      () => (selectedId ? fetchTurns(selectedId) : Promise.resolve([])),
      [selectedId],
    ),
    [selectedId],
  );

  const [addingMeeting, setAddingMeeting] = useState(false);

  const { reload: reloadMeetings } = meetings;

  const persist = useCallback(
    async (input: RecordDecisionInput) => {
      const { id } = await recordDecision(input);
      // Los contadores de la barra y del selector salen de la lista de
      // reuniones, no de la cola. Sin refrescarla seguían mostrando lo que
      // faltaba antes de decidir, y una cola terminada figuraba con
      // pendientes. Refrescar acá es seguro: la lista no alimenta la pantalla
      // de revisión, así que no le mueve las propuestas al revisor.
      reloadMeetings();
      return id;
    },
    [reloadMeetings],
  );

  const correct = useCallback(
    async (decisionId: number, intended: ReviewAction, reason: string) => {
      await correctDecision({
        decisionId,
        participantId,
        intendedAction: intended,
        reason,
      });
    },
    [participantId],
  );

  const crumb =
    route.section === "review" || route.section === "discovery"
      ? `/ ${SECTION_LABEL[route.section]} / Reunión ${iteration}`
      : `/ ${SECTION_LABEL[route.section]}`;

  return (
    <AppShell
      project={project.name}
      crumb={crumb}
      active={route.section}
      onNavigate={(section) => navigate(section)}
      onLeaveProject={onLeave}
      identity={identity}
      isLead={isLead}
      pendingReview={selected?.pendingProposals ?? 0}
      meetingCount={meetings.data?.length ?? 0}
      discoveryMeeting={selected?.mode === "discovery"}
      toolbar={
        meetings.data && meetings.data.length > 0 && selected ? (
          <MeetingPicker
            meetings={meetings.data}
            selectedId={selected.id}
            onSelect={setMeetingId}
          />
        ) : null
      }
    >
      {/* Sin reuniones todavía no es un error ni un vacío: es el alta de la
          primera. La sección Sesiones se encarga. */}
      <AsyncBoundary resource={meetings} allowEmpty>
        {() => (
          <>
            {route.section === "sessions" &&
              (addingMeeting || !selected ? (
                <div className="capture">
                  {!selected && (
                    <div className="screen__head">
                      <span className="screen__title">
                        Este proyecto todavía no tiene reuniones
                      </span>
                      <span className="screen__meta">
                        Creá la primera para empezar a cargar audio
                      </span>
                    </div>
                  )}
                  <NewMeeting
                    projectId={projectId}
                    participantId={participantId}
                    nextIteration={(meetings.data?.length ?? 0) + 1}
                    onCreated={(created) => {
                      setAddingMeeting(false);
                      setMeetingId(created.id);
                      meetings.reload();
                    }}
                    onCancel={selected ? () => setAddingMeeting(false) : undefined}
                  />
                </div>
              ) : (
                <CaptureScreen
                  meeting={selected}
                  onChanged={meetings.reload}
                  onAddMeeting={() => setAddingMeeting(true)}
                />
              ))}

            {route.section === "discovery" && selected?.mode !== "discovery" && (
              <div className="card">
                <div className="card__head">Esta reunión no es de descubrimiento</div>
                <p style={{ margin: "0 0 .7rem", fontSize: ".88rem", lineHeight: 1.55 }}>
                  Descubrimiento muestra todos los candidatos a la vez, porque un
                  primer borrador se juzga como conjunto. La reunión {iteration} es
                  de documentación viva y sus propuestas se deciden de a una, en
                  Revisión. Usar este layout acá cambiaría cómo se toman las
                  decisiones y la medición dejaría de ser comparable.
                </p>
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={() => navigate("review")}
                >
                  Ir a Revisión
                </button>
              </div>
            )}

            {route.section === "discovery" && selected?.mode === "discovery" && (
              <AsyncBoundary
                resource={queue}
                empty={
                  selected === null ? (
                    <NoMeetingsYet onGo={() => navigate("sessions")} />
                  ) : (
                    <EmptyQueue
                      iteration={iteration}
                      meeting={selected}
                      what="candidatos"
                      otherReviewers={otherReviewers}
                    />
                  )
                }
              >
                {(items) => (
                  <DiscoveryScreen
                    participantId={participantId}
                    iteration={iteration}
                    items={items}
                    turns={turns.data ?? []}
                    speakers={speakerNames}
                    onDecide={persist}
                  />
                )}
              </AsyncBoundary>
            )}

            {route.section === "review" && (
              <AsyncBoundary
                resource={queue}
                empty={
                  selected === null ? (
                    <NoMeetingsYet onGo={() => navigate("sessions")} />
                  ) : (
                    <EmptyQueue
                      iteration={iteration}
                      meeting={selected}
                      what="propuestas"
                      onReload={queue.reload}
                      otherReviewers={otherReviewers}
                    />
                  )
                }
              >
                {(items) => (
                  <ReviewScreen
                    iteration={iteration}
                    participantId={participantId}
                    speakers={speakerNames}
                    items={items}
                    onDecide={persist}
                    onCorrect={correct}
                  />
                )}
              </AsyncBoundary>
            )}

            {route.section === "document" && (
              <DocumentScreen
                projectId={projectId}
                upToRevision={Math.min(iteration, progress.through)}
                blockedAt={progress.blockedAt}
                onGoReview={() => navigate("review")}
                meetingLabels={meetingLabels}
                focusRequirementId={route.focus}
              />
            )}

            {route.section === "traceability" && (
              <TraceabilityScreen
                projectId={projectId}
                participantId={participantId}
                currentRevision={progress.through}
                blockedAt={progress.blockedAt}
                onGoReview={() => navigate("review")}
                meetingDates={meetingDates}
                onOpenRequirement={(id) => navigate("document", id)}
              />
            )}

            {route.section === "iterations" && (
              <IterationsScreen
                projectId={projectId}
                participantId={participantId}
              />
            )}

            {route.section === "agreement" &&
              (isLead ? (
                <AgreementScreen
                  projectId={projectId}
                  participants={allParticipants}
                  resolvedBy={participantId}
                />
              ) : (
                <NotForYou onGo={() => navigate("review")} />
              ))}

            {route.section === "export" && <ExportScreen projectId={projectId} />}
          </>
        )}
      </AsyncBoundary>
    </AppShell>
  );
}

/**
 * Concordancia mirada por alguien que no arbitra.
 *
 * No alcanza con sacarla del menú: la ruta va en el hash y un refresh o un
 * enlace pegado la abriría igual. Y en vez de redirigir en silencio, dice qué
 * pasó: que la pantalla exista y no sea tuya es información, esconderla haría
 * pensar en una falla.
 */
function NotForYou({ onGo }: { onGo: () => void }) {
  return (
    <div className="card">
      <div className="card__head">Concordancia la lleva el jefe de analistas</div>
      <p style={{ margin: "0 0 .9rem", maxWidth: "68ch", lineHeight: 1.6 }}>
        Consolidar no es una decisión del revisor: es la postura del equipo
        sobre su propio documento, y quien llega segundo no puede hacer regir
        su propia versión sobre la del otro. La pantalla además muestra el
        texto que dejó cada uno, y leerlo daría calibración para la reunión
        siguiente. Tus decisiones siguen siendo tuyas y quedan como están.
      </p>
      <button type="button" className="btn btn--small" onClick={onGo}>
        Ir a Revisión
      </button>
    </div>
  );
}

/**
 * Estado inicial de un proyecto recién creado.
 *
 * Descubrimiento y Revisión trabajan sobre la cola de una reunión. Sin
 * reuniones no hay nada que decidir todavía, y decirlo así evita que el
 * analista lea una cola vacía como una falla de la herramienta.
 */
function NoMeetingsYet({ onGo }: { onGo: () => void }) {
  return (
    <div className="card">
      <div className="card__head">Todavía no hay reuniones</div>
      <p style={{ margin: "0 0 .7rem", fontSize: ".88rem", lineHeight: 1.55 }}>
        Esta pantalla trabaja sobre lo que el agente propone a partir de una
        reunión. Cargá la primera en Sesiones y volvé.
      </p>
      <button type="button" className="btn btn--small" onClick={onGo}>
        Ir a Sesiones
      </button>
    </div>
  );
}

/**
 * Cola sin nada por decidir.
 *
 * Hay dos motivos distintos y hasta ahora se mostraba uno solo. Que no haya
 * propuestas generadas se resuelve corriendo el análisis; que este
 * participante ya las haya decidido todas no se resuelve generando nada —
 * decirle que corra `generate.py` lo manda a duplicar el trabajo del agente
 * sobre una reunión que ya está analizada.
 */
function EmptyQueue({
  iteration,
  meeting,
  what,
  onReload,
  otherReviewers = 0,
}: {
  iteration: number;
  meeting: Meeting;
  what: string;
  onReload?: () => void;
  otherReviewers?: number;
}) {
  const generated = meeting.proposalCount > 0;

  return (
    <div className="card">
      <div className="card__head">
        {generated ? "Nada pendiente para vos" : `Sin ${what}`}
      </div>
      <p style={{ margin: "0 0 .7rem", fontSize: ".88rem", lineHeight: 1.55 }}>
        {generated ? (
          <>
            La reunión {iteration} tiene {meeting.proposalCount} {what} y ya las
            decidiste todas.{" "}
            {otherReviewers > 0 ? (
              <>
                La cola es de cada persona, así que{" "}
                {otherReviewers === 1 ? "el otro participante" : "los otros participantes"}{" "}
                todavía {otherReviewers === 1 ? "la tiene" : "la tienen"} sin
                decidir.
              </>
            ) : (
              <>
                Seguí con el documento, o cargá la próxima reunión en Sesiones.
              </>
            )}
          </>
        ) : (
          <>
            La reunión {iteration} todavía no pasó por el análisis. Generá las{" "}
            {what} desde <code>api/</code>:
            <br />
            <code>.venv/bin/python generate.py {meeting.id} --project …</code>
          </>
        )}
      </p>
      {onReload && (
        <button type="button" className="btn btn--small" onClick={onReload}>
          Recargar
        </button>
      )}
    </div>
  );
}
