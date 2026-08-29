import { useMemo, useRef, useState } from "react";
import type { FootballStage } from "./clubTypes";
import { TrainingBoard, type TrainingBoardAction, type TrainingBoardPiece } from "./TrainingBoard";
import { downloadTrainingPdf } from "./trainingPdf";
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  Dumbbell,
  Eye,
  ListChecks,
  MapPin,
  PencilRuler,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
  Trash2,
  X,
} from "lucide-react";
import { FieldZoneDialog, fieldZoneLabel } from "./fieldZones";

export type AgendaEvent = TrainingAgendaEvent | MatchAgendaEvent;

interface AgendaEventBase {
  id: string;
  date: string;
  startTime: string;
  notes: string;
}

export interface TrainingAgendaEvent extends AgendaEventBase {
  type: "training";
  endTime: string;
  session?: TrainingSession;
  fieldId?: string;
  fieldName?: string;
  zoneIds?: string[];
  seriesId?: string;
  recurrenceLabel?: string;
  assignedByCoordinator?: boolean;
  assignedByName?: string;
  assignedAt?: string;
  exceptionStatus?: "scheduled" | "holiday" | "cancelled";
}

export interface TrainingBlock {
  id: "activation" | "main" | "game" | "cooldown";
  title: string;
  minutes: number;
  task: string;
  exercises?: PlannedExercise[];
  /** Compatibilidad con sesiones guardadas antes de admitir varios ejercicios. */
  exercise?: PlannedExercise;
}

export interface PlannedExercise {
  id: string;
  instanceId?: string;
  minutes?: number;
  title: string;
  taskType: string;
  description: string;
  organization: string;
  coaching: string;
  ageBenefit: string;
  board: TrainingBoardPiece[];
  actions: TrainingBoardAction[];
  steps: string[];
  minPlayers?: number;
  maxPlayers?: number;
}

export interface TrainingSession {
  playerCount: number;
  gameMoment: string;
  objective: string;
  taskType: string;
  focus: string;
  materials: string[];
  blocks: TrainingBlock[];
}

export interface MatchAgendaEvent extends AgendaEventBase {
  type: "match";
  matchType: "liga" | "amistoso" | "torneo";
  home: boolean;
  rivalId: string;
  rivalName: string;
  field: string;
  callupTime?: string;
  callupPlace?: string;
  kit?: string;
  homeLockerRoom?: string;
  awayLockerRoom?: string;
  playInWhite?: boolean;
  assignedByCoordinator?: boolean;
  assignedByName?: string;
  assignedAt?: string;
  acknowledgedAt?: string | null;
}

interface RivalOption {
  id: string;
  nombre: string;
  campo: string;
}

interface MatchSummary {
  date: string;
  rival: string;
  home: boolean;
}

const HOME_FIELDS = ["El Morer", "Campo C", "Polideportivo"];
const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
});
const MATERIALS = ["Balones", "Conos pequeños", "Conos grandes", "Petos", "Picas", "Aros", "Miniporterías", "Portería extra"];
const GAME_MOMENTS = [
  ["attack", "Ataque"],
  ["defence", "Defensa"],
  ["transition", "Transiciones"],
  ["individual", "Desarrollo individual"],
] as const;
const OBJECTIVES: Record<string, string[]> = {
  attack: ["Salida de balón", "Conservación", "Progresión", "Amplitud y profundidad", "Finalización"],
  defence: ["Presión", "Repliegue", "Basculación y coberturas", "Duelos defensivos", "Defensa de portería"],
  transition: ["Transición ataque-defensa", "Transición defensa-ataque"],
  individual: ["Conducción", "Pase y control", "Regate", "Coordinación", "Toma de decisiones"],
};
const OBJECTIVE_TASK_TYPES: Record<string, string[]> = {
  "Salida de balón": ["Juego de posición", "Situación de partido", "Partido condicionado"],
  "Conservación": ["Rondo", "Posesión", "Juego de posición"],
  "Progresión": ["Posesión", "Juego de posición", "Situación de partido"],
  "Amplitud y profundidad": ["Juego de posición", "Situación de partido", "Partido condicionado"],
  "Finalización": ["Técnica", "Situación de partido", "Partido condicionado"],
  "Presión": ["Posesión", "Situación de partido", "Partido condicionado"],
  "Repliegue": ["Situación de partido", "Partido condicionado"],
  "Basculación y coberturas": ["Juego de posición", "Situación de partido", "Partido condicionado"],
  "Duelos defensivos": ["Técnica", "Situación de partido"],
  "Defensa de portería": ["Situación de partido", "Partido condicionado"],
  "Transición ataque-defensa": ["Posesión", "Situación de partido", "Partido condicionado"],
  "Transición defensa-ataque": ["Posesión", "Situación de partido", "Partido condicionado"],
  "Conducción": ["Técnica", "Situación de partido"],
  "Pase y control": ["Técnica", "Rondo", "Posesión"],
  "Regate": ["Técnica", "Situación de partido"],
  "Coordinación": ["Técnica"],
  "Toma de decisiones": ["Rondo", "Posesión", "Situación de partido"],
};
interface Exercise extends PlannedExercise {
  objective: string;
  blocks: TrainingBlock["id"][];
  stages: FootballStage[];
  minPlayers: number;
  maxPlayers: number;
  minutes: number;
  materials: string[];
}
const boardPiece = (id: string, kind: TrainingBoardPiece["kind"], x: number, y: number, label?: string): TrainingBoardPiece => ({ id, kind, x, y, label });
const exerciseBoard = (variant: Exercise["id"]): TrainingBoardPiece[] => {
  const boards: Record<string, TrainingBoardPiece[]> = {
    "exit-3v2": [boardPiece("gk", "attacker", 9, 50, "P"), boardPiece("a1", "attacker", 25, 28, "1"), boardPiece("a2", "attacker", 25, 72, "2"), boardPiece("d1", "defender", 45, 38, "1"), boardPiece("d2", "defender", 45, 62, "2"), boardPiece("s1", "attacker", 72, 25, "A"), boardPiece("s2", "attacker", 72, 75, "B"), boardPiece("b", "ball", 14, 50)],
    "exit-gates": [boardPiece("gk", "attacker", 10, 50, "P"), boardPiece("a1", "attacker", 27, 28, "1"), boardPiece("a2", "attacker", 27, 72, "2"), boardPiece("d1", "defender", 46, 50, "1"), boardPiece("c1", "cone", 70, 18), boardPiece("c2", "cone", 70, 32), boardPiece("c3", "cone", 70, 44), boardPiece("c4", "cone", 70, 58), boardPiece("c5", "cone", 70, 70), boardPiece("c6", "cone", 70, 84), boardPiece("b", "ball", 15, 50)],
    "keep-4v2": [boardPiece("a1", "attacker", 24, 24, "1"), boardPiece("a2", "attacker", 24, 76, "2"), boardPiece("a3", "attacker", 48, 24, "3"), boardPiece("a4", "attacker", 48, 76, "4"), boardPiece("d1", "defender", 35, 42, "1"), boardPiece("d2", "defender", 35, 60, "2"), boardPiece("s1", "attacker", 76, 30, "A"), boardPiece("s2", "attacker", 76, 70, "B"), boardPiece("b", "ball", 26, 27)],
    "finish-2v1": [boardPiece("a1", "attacker", 25, 36, "1"), boardPiece("a2", "attacker", 25, 64, "2"), boardPiece("d1", "defender", 53, 50, "1"), boardPiece("gk", "defender", 88, 50, "P"), boardPiece("b", "ball", 29, 38), boardPiece("c1", "cone", 18, 30), boardPiece("c2", "cone", 18, 70)],
    "press-3v3": [boardPiece("a1", "attacker", 28, 28, "1"), boardPiece("a2", "attacker", 28, 72, "2"), boardPiece("a3", "attacker", 60, 50, "3"), boardPiece("d1", "defender", 42, 34, "1"), boardPiece("d2", "defender", 42, 66, "2"), boardPiece("d3", "defender", 68, 50, "3"), boardPiece("b", "ball", 32, 30)],
    "control-colours": [boardPiece("a1", "attacker", 24, 50, "1"), boardPiece("a2", "attacker", 52, 50, "2"), boardPiece("b", "ball", 31, 50), boardPiece("c1", "cone", 73, 25), boardPiece("c2", "cone", 73, 42), boardPiece("c3", "cone", 73, 60), boardPiece("c4", "cone", 73, 77)],
  };
  return boards[variant] || [];
};
const boardAction = (id: string, kind: TrainingBoardAction["kind"], from: [number, number], to: [number, number], order: number, curve = 0): TrainingBoardAction => ({ id, kind, from: { x: from[0], y: from[1] }, to: { x: to[0], y: to[1] }, order, curve });
const exerciseActions = (variant: string): TrainingBoardAction[] => ({
  "exit-3v2": [boardAction("p1", "pass", [9, 50], [25, 28], 1, -4), boardAction("r1", "run", [25, 72], [58, 78], 2, 5), boardAction("p2", "pass", [25, 28], [72, 25], 3, -6), boardAction("press1", "press", [45, 38], [25, 28], 1, 3)],
  "exit-gates": [boardAction("d1", "dribble", [10, 50], [27, 28], 1, -4), boardAction("p1", "pass", [27, 28], [67, 24], 2, -7), boardAction("r1", "run", [27, 72], [68, 73], 2, 7)],
  "keep-4v2": [boardAction("p1", "pass", [24, 24], [48, 24], 1), boardAction("p2", "pass", [48, 24], [48, 76], 2, 4), boardAction("p3", "pass", [48, 76], [76, 70], 3, 4), boardAction("pr1", "press", [35, 42], [48, 24], 1, -3)],
  "finish-2v1": [boardAction("c1", "dribble", [25, 36], [47, 38], 1, -2), boardAction("r1", "run", [25, 64], [63, 67], 1, 5), boardAction("p1", "pass", [47, 38], [63, 67], 2, 4), boardAction("s1", "pass", [63, 67], [88, 50], 3, -8)],
  "press-3v3": [boardAction("pa1", "pass", [28, 28], [60, 50], 1, 4), boardAction("pr1", "press", [42, 34], [28, 28], 1, -4), boardAction("pr2", "press", [42, 66], [28, 72], 1, 4), boardAction("pr3", "press", [68, 50], [60, 50], 2), boardAction("r1", "run", [28, 72], [22, 53], 2, -4)],
  "control-colours": [boardAction("p1", "pass", [24, 50], [52, 50], 1), boardAction("d1", "dribble", [52, 50], [73, 25], 2, -5), boardAction("d2", "dribble", [52, 50], [73, 77], 2, 5)],
} as Record<string, TrainingBoardAction[]>)[variant] || [];
const exerciseSteps = (variant: string): string[] => ({
  "exit-3v2": ["El portero inicia con uno de los dos jugadores abiertos.", "El compañero sin balón gana altura para separar a los defensores.", "Cuando aparece el pase, se conecta con el apoyo exterior y todos avanzan."],
  "exit-gates": ["El portero activa al jugador que tiene más espacio.", "El poseedor observa qué puerta deja libre el defensor.", "El equipo progresa por esa puerta mediante pase o conducción."],
  "keep-4v2": ["Los cuatro atacantes aseguran apoyos por fuera del defensor.", "Tras cuatro pases, buscan al compañero orientado hacia la segunda zona.", "Los defensores cambian de zona y el equipo vuelve a dar amplitud."],
  "finish-2v1": ["El poseedor conduce para fijar al defensor.", "El segundo atacante se separa y ofrece una línea diagonal.", "Se decide entre pase o tiro y la acción termina en pocos segundos."],
  "press-3v3": ["El equipo azul pierde el balón durante el juego reducido.", "El jugador más cercano presiona de inmediato al nuevo poseedor.", "Los otros dos compañeros cierran los pases próximos; si no recuperan, repliegan."],
  "control-colours": ["El pasador envía el balón al compañero.", "Antes de recibir, el entrenador nombra un color.", "El receptor orienta el primer control hacia esa puerta y acelera."],
} as Record<string, string[]>)[variant] || [];
const EXERCISES: Exercise[] = [
  { id: "exit-3v2", title: "Salida 3 contra 2 con portero", objective: "Salida de balón", blocks: ["main", "game"], taskType: "Situación de partido", stages: ["benjamin", "alevin"], minPlayers: 8, maxPlayers: 14, minutes: 18, materials: ["Balones", "Conos pequeños", "Petos"], description: "El equipo inicia desde su portería y debe superar una primera línea de dos defensores para conectar con dos apoyos exteriores.", organization: "Espacio de medio campo. Portero y dos iniciadores contra dos defensores; dos apoyos esperan tras la primera línea.", coaching: "Crear líneas de pase, perfil corporal y decidir cuándo conducir o pasar.", ageBenefit: "En Benjamín ayuda a reconocer al compañero libre y a levantar la mirada sin exigir todavía una salida posicional rígida.", board: exerciseBoard("exit-3v2"), actions: exerciseActions("exit-3v2"), steps: exerciseSteps("exit-3v2") },
  { id: "exit-gates", title: "Salir por una de las tres puertas", objective: "Salida de balón", blocks: ["activation", "main"], taskType: "Juego de posición", stages: ["prebenjamin", "benjamin"], minPlayers: 7, maxPlayers: 12, minutes: 15, materials: ["Balones", "Conos pequeños", "Petos"], description: "Desde portería, los atacantes progresan conduciendo o pasando por tres puertas anchas. La oposición empieza condicionada.", organization: "Tres puertas de conos en la línea final. Un defensor comienza en zona central y aumenta la oposición de forma progresiva.", coaching: "Levantar la cabeza y ocupar el espacio libre; sin exigir basculaciones complejas.", ageBenefit: "En Prebenjamín y Benjamín convierte la salida de balón en una decisión visual sencilla: observar, elegir una puerta y avanzar.", board: exerciseBoard("exit-gates"), actions: exerciseActions("exit-gates"), steps: exerciseSteps("exit-gates") },
  { id: "keep-4v2", title: "Conservación 4 contra 2 por zonas", objective: "Conservación", blocks: ["activation", "main"], taskType: "Posesión", stages: ["benjamin", "alevin"], minPlayers: 8, maxPlayers: 14, minutes: 16, materials: ["Balones", "Conos pequeños", "Petos"], description: "Dos cuadrados conectados. Tras cuatro pases, el balón puede cambiar de zona y los defensores deben reajustarse.", organization: "Dos espacios contiguos de 12 × 12 m. Cuatro poseedores, dos defensores y dos apoyos en la zona de destino.", coaching: "Apoyos constantes, orientación antes de recibir y ritmo de circulación.", ageBenefit: "En Benjamín mejora el hábito de separarse del balón y mirar antes de recibir; en Alevín añade lectura del momento para cambiar de zona.", board: exerciseBoard("keep-4v2"), actions: exerciseActions("keep-4v2"), steps: exerciseSteps("keep-4v2") },
  { id: "finish-2v1", title: "Dos contra uno y finalización", objective: "Finalización", blocks: ["main", "game"], taskType: "Situación de partido", stages: ["prebenjamin", "benjamin", "alevin"], minPlayers: 6, maxPlayers: 14, minutes: 18, materials: ["Balones", "Conos pequeños"], description: "Oleadas de dos atacantes contra un defensor hacia la portería de F8, con finalización rápida.", organization: "Dos filas de atacantes a 25 m de portería. Un defensor parte centrado y las acciones se reinician tras cada tiro.", coaching: "Fijar al defensor, elegir pase o conducción y finalizar con intención.", ageBenefit: "A estas edades presenta una decisión real pero fácil de entender: avanzar si el defensor no sale o pasar cuando fija al poseedor.", board: exerciseBoard("finish-2v1"), actions: exerciseActions("finish-2v1"), steps: exerciseSteps("finish-2v1") },
  { id: "press-3v3", title: "Presión tras pérdida 3 contra 3", objective: "Presión", blocks: ["main", "game"], taskType: "Partido condicionado", stages: ["benjamin", "alevin"], minPlayers: 8, maxPlayers: 14, minutes: 20, materials: ["Balones", "Conos pequeños", "Petos"], description: "Juego reducido con cinco segundos para recuperar después de perder. Si no se recupera, el equipo reorganiza.", organization: "Campo de 25 × 20 m con dos miniporterías. Juegan 3 contra 3 y descansan dos apoyos para mantener el ritmo.", coaching: "Jugador cercano presiona y compañeros cierran pases próximos.", ageBenefit: "En Benjamín introduce una regla memorable —cinco segundos— para reaccionar juntos; en Alevín permite distinguir presión y repliegue.", board: exerciseBoard("press-3v3"), actions: exerciseActions("press-3v3"), steps: exerciseSteps("press-3v3") },
  { id: "control-colours", title: "Control orientado por colores", objective: "Pase y control", blocks: ["activation", "cooldown"], taskType: "Técnica", stages: ["prebenjamin", "benjamin"], minPlayers: 6, maxPlayers: 16, minutes: 12, materials: ["Balones", "Conos pequeños"], description: "Por parejas, el entrenador indica una puerta de color antes de recibir y el jugador orienta allí su primer control.", organization: "Parejas separadas 8 m y cuatro puertas de colores detrás del receptor. Cambiar roles cada seis repeticiones.", coaching: "Mirar antes de recibir, perfilarse y alejar el balón del pie de apoyo.", ageBenefit: "En Prebenjamín y Benjamín une percepción y técnica mediante colores, evitando explicaciones tácticas demasiado abstractas.", board: exerciseBoard("control-colours"), actions: exerciseActions("control-colours"), steps: exerciseSteps("control-colours") },
];
const BLOCK_LABELS: Record<TrainingBlock["id"], string> = {
  activation: "Activación",
  main: "Parte principal",
  game: "Juego aplicado",
  cooldown: "Vuelta a la calma",
};
const ALL_TASK_TYPES = Array.from(new Set(Object.values(OBJECTIVE_TASK_TYPES).flat()));
const exerciseDuration = (exercise: PlannedExercise) => exercise.minutes ?? EXERCISES.find((item) => item.id === exercise.id)?.minutes ?? 0;
const exercisePlayerRange = (exercise: PlannedExercise) => {
  const source = EXERCISES.find((item) => item.id === exercise.id);
  return {
    min: exercise.minPlayers ?? source?.minPlayers ?? 1,
    max: exercise.maxPlayers ?? source?.maxPlayers ?? 30,
  };
};
const exercisePlayerDistance = (exercise: PlannedExercise, playerCount: number) => {
  const { min, max } = exercisePlayerRange(exercise);
  if (playerCount < min) return min - playerCount;
  if (playerCount > max) return playerCount - max;
  return 0;
};
const exercisePlayerAdaptation = (exercise: PlannedExercise, playerCount: number) => {
  const { min, max } = exercisePlayerRange(exercise);
  if (playerCount >= min && playerCount <= max) return `Listo para los ${playerCount} jugadores disponibles.`;
  if (playerCount > max) {
    const firstGroup = Math.ceil(playerCount / 2);
    const secondGroup = playerCount - firstGroup;
    return `Adáptalo con dos grupos de ${firstGroup} y ${secondGroup}; alterna tarea y recuperación.`;
  }
  return `Adáptalo reduciendo un apoyo o un defensor para conservar la intención del ejercicio.`;
};
const blockExercises = (block: TrainingBlock): PlannedExercise[] => block.exercises?.length ? block.exercises : block.exercise ? [{ ...block.exercise, minutes: exerciseDuration(block.exercise) }] : [];
const defaultBlocks = (): TrainingBlock[] => [
  { id: "activation", title: "Activación", minutes: 15, task: "" },
  { id: "main", title: "Parte principal", minutes: 40, task: "" },
  { id: "game", title: "Juego aplicado", minutes: 25, task: "" },
  { id: "cooldown", title: "Vuelta a la calma", minutes: 10, task: "" },
];
const defaultSession = (playerCount: number): TrainingSession => ({
  playerCount,
  gameMoment: "",
  objective: "",
  taskType: "",
  focus: "",
  materials: ["Balones", "Conos pequeños", "Petos"],
  blocks: defaultBlocks(),
});

const isoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const emptyTraining = (date: string, playerCount: number): TrainingAgendaEvent => ({
  id: crypto.randomUUID(),
  type: "training",
  date,
  startTime: "17:00",
  endTime: "18:30",
  notes: "",
  session: defaultSession(playerCount),
});

const emptyMatch = (date: string): MatchAgendaEvent => ({
  id: crypto.randomUUID(),
  type: "match",
  date,
  startTime: "",
  notes: "",
  matchType: "liga",
  home: true,
  rivalId: "",
  rivalName: "",
  field: "",
  playInWhite: false,
});

const trainingExerciseCount = (event: TrainingAgendaEvent) =>
  event.session?.blocks.reduce(
    (total, block) => total + blockExercises(block).length,
    0,
  ) || 0;

export function AgendaView({
  events,
  rivals,
  matches,
  onChange,
  onOpenBoard,
  onOpenStats,
  onOpenCallup,
  categoryLabel,
  footballStage,
  defaultPlayerCount,
}: {
  events: AgendaEvent[];
  rivals: RivalOption[];
  matches: MatchSummary[];
  onChange: (events: AgendaEvent[]) => void;
  onOpenBoard: (event: MatchAgendaEvent) => void;
  onOpenStats: (event: MatchAgendaEvent) => void;
  onOpenCallup: (event: MatchAgendaEvent) => void;
  categoryLabel: string;
  footballStage: FootballStage | null;
  defaultPlayerCount: number;
}) {
  const today = new Date();
  const todayIso = isoDate(today.getFullYear(), today.getMonth(), today.getDate());
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [draft, setDraft] = useState<AgendaEvent | null>(null);
  const [zonePreview, setZonePreview] = useState<TrainingAgendaEvent | null>(null);
  const [trainingView, setTrainingView] = useState<"summary" | "planner">("planner");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [exercisePreview, setExercisePreview] = useState<{
    exercise: PlannedExercise;
    blockId?: TrainingBlock["id"];
    exerciseInstanceId?: string;
  } | null>(null);
  const [previewTargetBlock, setPreviewTargetBlock] = useState<TrainingBlock["id"]>("main");
  const trainingFiltersRef = useRef<HTMLElement>(null);
  const chooseExerciseBlock = (blockId: TrainingBlock["id"]) => {
    setPreviewTargetBlock(blockId);
    requestAnimationFrame(() => trainingFiltersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const totalDays = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: firstOffset }, () => null),
      ...Array.from({ length: totalDays }, (_, index) => ({
        day: index + 1,
        date: isoDate(year, month, index + 1),
      })),
    ];
  }, [cursor]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, AgendaEvent[]>();
    events.forEach((event) => {
      const day = grouped.get(event.date) || [];
      day.push(event);
      grouped.set(event.date, day);
    });
    grouped.forEach((day) =>
      day.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    );
    return grouped;
  }, [events]);
  const selectedEvents = eventsByDate.get(selectedDate) || [];
  const saveDraft = () => {
    if (!draft) return;
    if (draft.type === "match" && (!draft.rivalName.trim() || !draft.startTime))
      return;
    const exists = events.some((event) => event.id === draft.id);
    onChange(
      exists
        ? events.map((event) => (event.id === draft.id ? draft : event))
        : [...events, draft],
    );
    setDraft(null);
  };

  const updateMatchRival = (rivalId: string) => {
    if (!draft || draft.type !== "match") return;
    const rival = rivals.find((item) => item.id === rivalId);
    setDraft({
      ...draft,
      rivalId,
      rivalName: rival?.nombre || "",
      field: draft.home ? draft.field : rival?.campo || "",
    });
  };

  const matchIsCompleted = (event: MatchAgendaEvent) =>
    matches.some(
      (match) =>
        match.date === event.date &&
        match.rival === event.rivalName &&
        match.home === event.home,
    );

  const openTraining = (event: TrainingAgendaEvent) => {
    setDraft({ ...event, session: event.session || defaultSession(defaultPlayerCount) });
    setTrainingView("summary");
  };

  const updateSession = (change: Partial<TrainingSession>) => {
    if (!draft || draft.type !== "training") return;
    setDraft({ ...draft, session: { ...(draft.session || defaultSession(defaultPlayerCount)), ...change } });
  };
  const trainingSession = draft?.type === "training" ? { ...defaultSession(defaultPlayerCount), ...draft.session } : null;
  const downloadSummaryPdf = async () => {
    if (!draft || draft.type !== "training" || !trainingSession || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await downloadTrainingPdf({
        categoryLabel,
        date: draft.date,
        startTime: draft.startTime,
        endTime: draft.endTime,
        notes: draft.notes,
        session: trainingSession,
      });
    } finally {
      setDownloadingPdf(false);
    }
  };
  const allocatedTrainingMinutes = trainingSession?.blocks.reduce((total, block) => total + block.minutes, 0) || 0;
  const usedTrainingMinutes = trainingSession?.blocks.reduce((total, block) => total + blockExercises(block).reduce((blockTotal, exercise) => blockTotal + exerciseDuration(exercise), 0), 0) || 0;
  const remainingTrainingMinutes = allocatedTrainingMinutes - usedTrainingMinutes;
  const availableObjectives = trainingSession?.gameMoment ? OBJECTIVES[trainingSession.gameMoment] || [] : [];
  const availableTaskTypes = trainingSession?.objective ? OBJECTIVE_TASK_TYPES[trainingSession.objective] || [] : ALL_TASK_TYPES;
  const matchingExercises = trainingSession ? EXERCISES.filter((exercise) =>
    exercise.blocks.includes(previewTargetBlock) &&
    (!trainingSession.gameMoment || (OBJECTIVES[trainingSession.gameMoment] || []).includes(exercise.objective)) &&
    (!trainingSession.objective || exercise.objective === trainingSession.objective) &&
    (!trainingSession.taskType || exercise.taskType === trainingSession.taskType) &&
    (!footballStage || exercise.stages.includes(footballStage === "querubin" ? "prebenjamin" : footballStage)) &&
    exercise.materials.every((material) => trainingSession.materials.includes(material)),
  ).sort((first, second) => exercisePlayerDistance(first, trainingSession.playerCount) - exercisePlayerDistance(second, trainingSession.playerCount)) : [];
  const plannedExercise = (exercise: Exercise): PlannedExercise => ({
    id: exercise.id,
    instanceId: crypto.randomUUID(),
    minutes: exercise.minutes,
    title: exercise.title,
    taskType: exercise.taskType,
    description: exercise.description,
    organization: exercise.organization,
    coaching: exercise.coaching,
    ageBenefit: exercise.ageBenefit,
    board: exercise.board.map((piece) => ({ ...piece })),
    actions: exercise.actions.map((action) => ({ ...action, from: { ...action.from }, to: { ...action.to } })),
    steps: [...exercise.steps],
    minPlayers: exercise.minPlayers,
    maxPlayers: exercise.maxPlayers,
  });
  const openExercisePreview = (exercise: Exercise) => {
    setExercisePreview({ exercise: plannedExercise(exercise) });
  };
  const openBlockBoard = (block: TrainingBlock, exercise: PlannedExercise) => {
    const exerciseInstanceId = exercise.instanceId || exercise.id;
    setExercisePreview({
      exercise: {
        ...exercise,
        instanceId: exerciseInstanceId,
        minutes: exerciseDuration(exercise),
        board: exercise.board.map((piece) => ({ ...piece })),
        actions: (exercise.actions || []).map((action) => ({ ...action, from: { ...action.from }, to: { ...action.to } })),
        steps: [...(exercise.steps || [])],
      },
      blockId: block.id,
      exerciseInstanceId,
    });
    setPreviewTargetBlock(block.id);
  };
  const removeBlockExercise = (blockId: TrainingBlock["id"], exerciseInstanceId: string) => {
    updateSession({
      blocks: (trainingSession?.blocks || defaultBlocks()).map((block) => block.id === blockId ? {
        ...block,
        exercise: undefined,
        exercises: blockExercises(block).filter((exercise) => (exercise.instanceId || exercise.id) !== exerciseInstanceId),
      } : block),
    });
  };
  const savePreviewExercise = () => {
    if (!exercisePreview) return;
    const targetId = exercisePreview.blockId || previewTargetBlock;
    const sourceExercise = EXERCISES.find((exercise) => exercise.id === exercisePreview.exercise.id);
    const savedExercise: PlannedExercise = {
      ...exercisePreview.exercise,
      instanceId: exercisePreview.exerciseInstanceId || exercisePreview.exercise.instanceId || crypto.randomUUID(),
      minutes: exercisePreview.exercise.minutes ?? sourceExercise?.minutes ?? 0,
    };
    updateSession({
      blocks: (trainingSession?.blocks || defaultBlocks()).map((block) => {
        if (block.id !== targetId) return block;
        const currentExercises = blockExercises(block);
        return {
          ...block,
          exercise: undefined,
          exercises: exercisePreview.exerciseInstanceId
            ? currentExercises.map((exercise) => (exercise.instanceId || exercise.id) === exercisePreview.exerciseInstanceId ? savedExercise : exercise)
            : [...currentExercises, savedExercise],
        };
      }),
    });
    setExercisePreview(null);
  };

  return (
    <div className={`agenda-layout${draft?.type === "training" ? " training-workspace-open" : ""}`}>
      <section className="agenda-calendar">
        <div className="agenda-toolbar">
          <button
            aria-label="Mes anterior"
            onClick={() =>
              setCursor(
                (current) =>
                  new Date(current.getFullYear(), current.getMonth() - 1, 1),
              )
            }
          >
            <ChevronLeft size={18} />
          </button>
          <h2>{monthFormatter.format(cursor)}</h2>
          <button
            aria-label="Mes siguiente"
            onClick={() =>
              setCursor(
                (current) =>
                  new Date(current.getFullYear(), current.getMonth() + 1, 1),
              )
            }
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="agenda-weekdays">
          {weekDays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="agenda-grid">
          {cells.map((cell, index) =>
            cell ? (
              <button
                key={cell.date}
                className={[
                  cell.date === selectedDate ? "selected" : "",
                  (eventsByDate.get(cell.date) || []).some((event) => event.type === "match" && event.assignedByCoordinator) ? "coordinator-assigned-day" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => {
                  const assignedMatch = (eventsByDate.get(cell.date) || []).find(
                    (event): event is MatchAgendaEvent =>
                      event.type === "match" && event.assignedByCoordinator === true,
                  );
                  setSelectedDate(cell.date);
                  setDraft(assignedMatch ? { ...assignedMatch } : null);
                  setExercisePreview(null);
                }}
              >
                <span>{cell.day}</span>
                <div>
                  {(eventsByDate.get(cell.date) || [])
                    .slice(0, 3)
                    .map((event) => (
                      <small className={`${event.type}${event.type === "match" && event.assignedByCoordinator ? " coordinator-assigned" : ""}`} key={event.id}>
                        <span className="agenda-cell-event-icon" aria-hidden="true">
                          {event.type === "training" ? <Dumbbell size={11} /> : <Trophy size={11} />}
                        </span>
                        <span className="agenda-cell-event-copy">
                          <b>{event.type === "training" ? "Entreno" : event.rivalName || "Partido"}</b>
                          <em>{event.startTime || "Sin hora"}{event.type === "match" ? ` · ${event.home ? "Local" : "Fuera"}` : ""}</em>
                        </span>
                      </small>
                    ))}
                </div>
              </button>
            ) : (
              <span className="agenda-empty-cell" key={`empty-${index}`} />
            ),
          )}
        </div>
      </section>

      <aside className="agenda-day-panel">
        <div className="agenda-day-heading">
          <div>
            <span className="eyebrow">DÍA SELECCIONADO</span>
            <h2>{new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selectedDate}T12:00:00`))}</h2>
          </div>
          {draft && !(draft.type === "match" && draft.assignedByCoordinator) && (
            <button aria-label="Cerrar formulario" onClick={() => setDraft(null)}>
              <X size={18} />
            </button>
          )}
        </div>

        {!draft && (
          <>
            <div className="agenda-event-list">
              {selectedEvents.map((event) => (
                <article className={`${event.type}${event.assignedByCoordinator ? " coordinator-assigned" : ""}${event.type === "training" && event.exceptionStatus !== "scheduled" && event.exceptionStatus ? " cancelled" : ""}`} key={event.id}>
                  <button className="agenda-event-main" onClick={() => event.type === "training" ? openTraining(event) : setDraft({ ...event })}>
                    <span className="agenda-event-icon" aria-hidden="true">
                      {event.type === "training" ? <Dumbbell size={22} /> : <Trophy size={22} />}
                    </span>
                    <span className="agenda-event-copy">
                      <em>{event.type === "training" ? event.exceptionStatus === "holiday" ? "FESTIVO · SIN ENTRENAMIENTO" : event.exceptionStatus === "cancelled" ? "ENTRENAMIENTO CANCELADO" : "SESIÓN DE ENTRENAMIENTO" : `${event.matchType} · ${event.home ? "EN CASA" : "A DOMICILIO"}`}</em>
                      {event.assignedByCoordinator && (
                        <span className="coordinator-origin"><ShieldCheck size={12} /> Coordinación</span>
                      )}
                      {event.type === "match" && event.playInWhite && (
                        <span className="white-kit-badge">OBSERVACIONES · JUGAMOS DE BLANCO</span>
                      )}
                      <strong>
                        {event.type === "training" ? "Entrenamiento" : event.rivalName || "Partido"}
                      </strong>
                      <span className="agenda-event-meta">
                        <small><Clock size={13} />{event.startTime || "Sin hora"}{event.type === "training" ? `–${event.endTime}` : ""}</small>
                        {event.type === "training" ? event.fieldName ? (
                          <small><MapPin size={13} />{event.fieldName} · {fieldZoneLabel(event.fieldId, event.zoneIds)}</small>
                        ) : (
                          <small><ListChecks size={13} />{trainingExerciseCount(event) ? `${trainingExerciseCount(event)} ejercicios` : "Planificación libre"}</small>
                        ) : event.field ? (
                          <small><MapPin size={13} />{event.field}</small>
                        ) : null}
                      </span>
                    </span>
                  </button>
                  {event.type === "training" && event.fieldId && event.zoneIds?.length ? (
                    <div className="agenda-event-side"><button type="button" className="agenda-zone-button" onClick={() => setZonePreview(event)}><MapPin size={15} /> Ver zona</button></div>
                  ) : event.type === "match" ? (
                    <div className="agenda-event-side">
                      <span className={matchIsCompleted(event) ? "agenda-status done" : "agenda-status"}>
                        {matchIsCompleted(event) ? "Finalizado" : "Programado"}
                      </span>
                      <button type="button" className="agenda-callup-button" onClick={() => onOpenCallup(event)}>
                        <ClipboardList size={15} /> Citación
                      </button>
                      <button className="agenda-stat-button" onClick={() => onOpenStats(event)}>
                        <BarChart3 size={15} /> Estadísticas
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              {!selectedEvents.length && <p className="agenda-no-events">No hay actividades guardadas.</p>}
            </div>
            <div className="agenda-add-actions">
              <button onClick={() => { setDraft(emptyTraining(selectedDate, defaultPlayerCount)); setTrainingView("planner"); }}>
                <Plus size={17} /> Entrenamiento
              </button>
              <button onClick={() => setDraft(emptyMatch(selectedDate))}>
                <Plus size={17} /> Partido
              </button>
            </div>
          </>
        )}

        {draft?.type === "training" && draft.assignedByCoordinator && (
          <div className={`agenda-form assigned-training-detail${draft.exceptionStatus !== "scheduled" && draft.exceptionStatus ? " cancelled" : ""}`}>
            <div className="assigned-training-heading"><span><ShieldCheck size={16} /> ASIGNADO POR COORDINACIÓN</span><strong>{draft.exceptionStatus === "holiday" ? "Festivo · No hay entrenamiento" : draft.exceptionStatus === "cancelled" ? "Entrenamiento cancelado" : "Entrenamiento"}</strong><small>{draft.recurrenceLabel || "Horario habitual"}</small></div>
            <div className="assigned-match-ticket"><div><span>Hora</span><strong>{draft.startTime}–{draft.endTime}</strong></div><div><span>Campo</span><strong>{draft.fieldName || "Pendiente"}</strong></div><div><span>Zona</span><strong>{fieldZoneLabel(draft.fieldId, draft.zoneIds)}</strong></div><div><span>Fecha</span><strong>{new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${draft.date}T12:00:00`))}</strong></div></div>
            {draft.notes && <p className="assigned-match-notes">{draft.notes}</p>}
            {draft.fieldId && draft.zoneIds?.length ? <button type="button" className="agenda-zone-button large" onClick={() => setZonePreview(draft)}><MapPin size={17} /> Ver zona del campo</button> : null}
          </div>
        )}

        {draft?.type === "training" && !draft.assignedByCoordinator && (
          <div className="agenda-form">
            <div className="training-session-heading">
              <div><span className="eyebrow">SESIÓN DE ENTRENAMIENTO</span><h3>{categoryLabel}</h3></div>
              <div className="training-view-switch">
                <button type="button" className={trainingView === "summary" ? "active" : ""} onClick={() => setTrainingView("summary")}><Eye size={14} /> Resumen</button>
                <button type="button" className={trainingView === "planner" ? "active" : ""} onClick={() => setTrainingView("planner")}><PencilRuler size={14} /> Preparar</button>
              </div>
            </div>

            {trainingView === "summary" ? (
              <section className="training-review">
                <div className="training-review-meta">
                  <div><span>Horario</span><strong>{draft.startTime}–{draft.endTime}</strong></div>
                  <div><span>Jugadores</span><strong>{trainingSession?.playerCount || defaultPlayerCount}</strong></div>
                  <div><span>Objetivo</span><strong>{trainingSession?.objective || "Sin definir"}</strong></div>
                  <div><span>Ejercicios</span><strong>{usedTrainingMinutes}/{allocatedTrainingMinutes} min</strong></div>
                </div>
                <div className={`training-total-time${remainingTrainingMinutes < 0 ? " over" : remainingTrainingMinutes === 0 ? " complete" : ""}`}><div><strong>Tiempo total de la sesión</strong><span>{usedTrainingMinutes} min en ejercicios · {remainingTrainingMinutes < 0 ? `${Math.abs(remainingTrainingMinutes)} min por encima` : `${remainingTrainingMinutes} min todavía disponibles`}</span></div><b>{usedTrainingMinutes}/{allocatedTrainingMinutes}</b><i><span style={{ width: `${Math.min(100, allocatedTrainingMinutes ? (usedTrainingMinutes / allocatedTrainingMinutes) * 100 : 0)}%` }} /></i></div>
                {trainingSession?.focus && <div className="training-review-focus"><ListChecks size={18} /><div><span>Matiz de la sesión</span><strong>{trainingSession.focus}</strong></div></div>}
                <div className="training-review-blocks">
                  {(trainingSession?.blocks || defaultBlocks()).map((block, index) => {
                    const exercises = blockExercises(block);
                    const usedMinutes = exercises.reduce((total, exercise) => total + exerciseDuration(exercise), 0);
                    const remainingMinutes = block.minutes - usedMinutes;
                    return <article className={exercises.length ? "has-exercise" : ""} key={block.id}>
                      <header><span>{index + 1}</span><div><small>{block.title}</small><strong>{exercises.length ? `${exercises.length} ${exercises.length === 1 ? "ejercicio" : "ejercicios"}` : "Bloque libre"}</strong></div><b>{usedMinutes}/{block.minutes} min</b></header>
                      <div className={`block-time-balance${remainingMinutes < 0 ? " over" : remainingMinutes === 0 ? " complete" : ""}`}><span style={{ width: `${Math.min(100, block.minutes ? (usedMinutes / block.minutes) * 100 : 0)}%` }} /><strong>{remainingMinutes < 0 ? `${Math.abs(remainingMinutes)} min por encima` : remainingMinutes === 0 ? "Bloque completo" : `${remainingMinutes} min disponibles`}</strong></div>
                      {exercises.length ? <div className="training-review-exercises">{exercises.map((exercise, exerciseIndex) => {
                        const exerciseInstanceId = exercise.instanceId || exercise.id;
                        return <section className="training-review-exercise" key={`${exerciseInstanceId}-${exerciseIndex}`}>
                          <div className="planned-exercise-heading"><span>{exerciseIndex + 1}</span><div><strong>{exercise.title}</strong><small>{exercise.taskType} · {exerciseDuration(exercise)} min</small></div></div>
                          <TrainingBoard pieces={exercise.board} actions={exercise.actions || []} compact label={`Pizarra de ${exercise.title}`} />
                          <p>{exercise.description}</p>
                          <div className="training-review-detail"><strong>Claves</strong><span>{exercise.coaching}</span></div>
                          <div className="training-review-age"><strong>Por qué funciona para {categoryLabel}</strong><span>{exercise.ageBenefit}</span></div>
                          <div className="planned-exercise-actions"><button type="button" className="open-board-button" onClick={() => openBlockBoard(block, exercise)}><PencilRuler size={15} /> Abrir y editar pizarra</button><button type="button" className="remove-exercise-button" onClick={() => removeBlockExercise(block.id, exerciseInstanceId)}><Trash2 size={15} /> Quitar</button></div>
                        </section>;
                      })}</div> : <p className="training-review-free">{block.task || "Todavía no has añadido una tarea a este bloque."}</p>}
                      {block.task && exercises.length > 0 && <div className="training-block-note"><strong>Nota del bloque</strong><p>{block.task}</p></div>}
                    </article>;
                  })}
                </div>
                {draft.notes && <div className="training-review-notes"><strong>Observaciones generales</strong><p>{draft.notes}</p></div>}
                <div className="training-review-actions">
                  <button type="button" className="training-pdf-button" disabled={downloadingPdf} onClick={() => void downloadSummaryPdf()}><Download size={16} /> {downloadingPdf ? "Preparando PDF..." : "Descargar PDF"}</button>
                  <button type="button" className="primary-button training-edit-button" onClick={() => setTrainingView("planner")}><PencilRuler size={16} /> Editar planificación</button>
                </div>
              </section>
            ) : (
              <>
                <div className="agenda-time-row">
                  <label><span>Empieza</span><input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></label>
                  <label><span>Termina</span><input type="time" value={draft.endTime} onChange={(event) => setDraft({ ...draft, endTime: event.target.value })} /></label>
                </div>
                <div className="training-session-summary training-session-focus">
                  <label><span>Matiz que quieres trabajar</span><input value={trainingSession?.focus || ""} onChange={(event) => updateSession({ focus: event.target.value })} placeholder="Ej. atraer para jugar por fuera" /></label>
                </div>
                <details className="training-materials-details">
                  <summary><span>Material disponible</span><small>{trainingSession?.materials.length || 0} seleccionados · cambiar</small></summary>
                  <fieldset className="training-materials"><legend>Selecciona el material disponible</legend><div>{MATERIALS.map((material) => { const selected = trainingSession?.materials.includes(material) ?? false; return <button type="button" className={selected ? "selected" : ""} key={material} onClick={() => updateSession({ materials: selected ? (trainingSession?.materials || []).filter((item) => item !== material) : [...(trainingSession?.materials || []), material] })}>{selected && <Check size={13} />}{material}</button> })}</div></fieldset>
                </details>
                <div className={`training-total-time${remainingTrainingMinutes < 0 ? " over" : remainingTrainingMinutes === 0 ? " complete" : ""}`}><div><strong>Tiempo total de la sesión</strong><span>{usedTrainingMinutes} min en ejercicios · {remainingTrainingMinutes < 0 ? `${Math.abs(remainingTrainingMinutes)} min por encima` : `${remainingTrainingMinutes} min todavía disponibles`}</span></div><b>{usedTrainingMinutes}/{allocatedTrainingMinutes}</b><i><span style={{ width: `${Math.min(100, allocatedTrainingMinutes ? (usedTrainingMinutes / allocatedTrainingMinutes) * 100 : 0)}%` }} /></i></div>
                <section className="training-filters" ref={trainingFiltersRef}>
                  <div className="training-filters-heading"><SlidersHorizontal size={18} /><div><strong>Elige el bloque y los jugadores</strong><small>Las pizarras aparecen ya. Momento, objetivo y formato son filtros opcionales.</small></div></div>
                  <div className="training-filter-grid">
                    <label className="training-filter-primary"><span>1 · Bloque</span><select value={previewTargetBlock} onChange={(event) => setPreviewTargetBlock(event.target.value as TrainingBlock["id"])}>{(trainingSession?.blocks || defaultBlocks()).map((block) => <option value={block.id} key={block.id}>{block.title}</option>)}</select></label>
                    <div className="training-player-filter"><span>2 · Jugadores hoy</span><div className="player-count-stepper"><button type="button" aria-label="Quitar un jugador" disabled={(trainingSession?.playerCount || 1) <= 1} onClick={() => updateSession({ playerCount: Math.max(1, (trainingSession?.playerCount || 1) - 1) })}>−</button><input aria-label="Jugadores disponibles" type="number" min="1" max="30" value={trainingSession?.playerCount || defaultPlayerCount} onChange={(event) => updateSession({ playerCount: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} /><button type="button" aria-label="Añadir un jugador" disabled={(trainingSession?.playerCount || 30) >= 30} onClick={() => updateSession({ playerCount: Math.min(30, (trainingSession?.playerCount || 0) + 1) })}>+</button></div></div>
                    <label><span>Momento · opcional</span><select value={trainingSession?.gameMoment || ""} onChange={(event) => updateSession({ gameMoment: event.target.value, objective: "", taskType: "" })}><option value="">Todos</option>{GAME_MOMENTS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                    <label><span>Objetivo · opcional</span><select disabled={!trainingSession?.gameMoment} value={trainingSession?.objective || ""} onChange={(event) => updateSession({ objective: event.target.value, taskType: "" })}><option value="">Todos</option>{availableObjectives.map((objective) => <option key={objective}>{objective}</option>)}</select></label>
                    <label><span>Formato · opcional</span><select value={trainingSession?.taskType || ""} onChange={(event) => updateSession({ taskType: event.target.value })}><option value="">Todos</option>{availableTaskTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                  </div>
                  <div className="training-filter-status"><strong>{BLOCK_LABELS[previewTargetBlock]}</strong><span>{trainingSession?.playerCount || defaultPlayerCount} jugadores · {categoryLabel} · {matchingExercises.length} resultados</span></div>
                </section>
                <section className="exercise-library">
                  <div className="exercise-library-heading"><div><BookOpen size={18} /><span><strong>Pizarras para {BLOCK_LABELS[previewTargetBlock]}</strong><small>{matchingExercises.length} {matchingExercises.length === 1 ? "tarea compatible" : "tareas compatibles"}, ordenadas por número de jugadores</small></span></div></div>
                  {matchingExercises.length ? <div className="exercise-results">{matchingExercises.map((exercise) => { const playerDistance = exercisePlayerDistance(exercise, trainingSession?.playerCount || defaultPlayerCount); return <article key={exercise.id}><TrainingBoard pieces={exercise.board} actions={exercise.actions} compact label={`Vista previa de ${exercise.title}`} /><div className="exercise-card-top"><span>{exercise.taskType}</span><small>{exercise.minutes} min · {exercise.minPlayers}–{exercise.maxPlayers} jugadores</small></div><h4>{exercise.title}</h4><p>{exercise.description}</p><div className={`exercise-player-fit${playerDistance === 0 ? " exact" : " adaptable"}`}><strong>{playerDistance === 0 ? "Encaja con tu grupo" : "Se puede adaptar"}</strong><span>{exercisePlayerAdaptation(exercise, trainingSession?.playerCount || defaultPlayerCount)}</span></div><div className="exercise-age-hint"><strong>Para esta edad</strong><span>{exercise.ageBenefit}</span></div><button type="button" onClick={() => openExercisePreview(exercise)}><Eye size={14} /> Ver ejercicio y pizarra</button></article> })}</div> : <div className="exercise-empty"><strong>No hay una tarea compatible para {BLOCK_LABELS[previewTargetBlock]}</strong><span>Prueba otro formato o revisa el material disponible. El número de jugadores nunca oculta una tarea: la app propone cómo adaptarla.</span></div>}
                </section>
                <div className="training-blocks"><div className="training-blocks-title"><span>Bloques de la sesión</span><small>{draft.session?.blocks.reduce((total, block) => total + block.minutes, 0) || 0} min planificados</small></div>{(draft.session?.blocks || defaultBlocks()).map((block) => {
                  const exercises = blockExercises(block);
                  const usedMinutes = exercises.reduce((total, exercise) => total + exerciseDuration(exercise), 0);
                  const remainingMinutes = block.minutes - usedMinutes;
                  return <article className={exercises.length ? "has-exercise" : ""} key={block.id}>
                    <div><strong>{block.title}</strong><label><input aria-label={`Minutos de ${block.title}`} type="number" min="0" max="90" value={block.minutes} onChange={(event) => updateSession({ blocks: (draft.session?.blocks || defaultBlocks()).map((item) => item.id === block.id ? { ...item, minutes: Number(event.target.value) } : item) })} /><span>min</span></label></div>
                    <div className={`block-time-balance compact${remainingMinutes < 0 ? " over" : remainingMinutes === 0 ? " complete" : ""}`}><span style={{ width: `${Math.min(100, block.minutes ? (usedMinutes / block.minutes) * 100 : 0)}%` }} /><strong>{usedMinutes} usados · {remainingMinutes < 0 ? `${Math.abs(remainingMinutes)} de más` : `${remainingMinutes} libres`}</strong></div>
                    {exercises.length > 0 && <div className="training-block-exercises">{exercises.map((exercise, exerciseIndex) => { const exerciseInstanceId = exercise.instanceId || exercise.id; const needsAdaptation = exercisePlayerDistance(exercise, trainingSession?.playerCount || defaultPlayerCount) > 0; return <div className="training-block-exercise" key={`${exerciseInstanceId}-${exerciseIndex}`}><TrainingBoard pieces={exercise.board} actions={exercise.actions || []} compact label={`Pizarra de ${exercise.title}`} /><span><strong>{exerciseIndex + 1}. {exercise.title}</strong><small>{exercise.taskType} · {exerciseDuration(exercise)} min</small>{needsAdaptation && <em className="planned-player-adaptation">{exercisePlayerAdaptation(exercise, trainingSession?.playerCount || defaultPlayerCount)}</em>}<span className="training-block-exercise-actions"><button type="button" onClick={() => openBlockBoard(block, exercise)}><PencilRuler size={13} /> Editar</button><button type="button" className="remove-exercise-button" onClick={() => removeBlockExercise(block.id, exerciseInstanceId)}><Trash2 size={13} /> Quitar</button></span></span></div> })}</div>}
                    <button type="button" className="add-block-exercise-button" onClick={() => chooseExerciseBlock(block.id)}><Plus size={14} /> Elegir ejercicio para {block.title}</button>
                    <textarea rows={2} value={block.task} onChange={(event) => updateSession({ blocks: (draft.session?.blocks || defaultBlocks()).map((item) => item.id === block.id ? { ...item, task: event.target.value } : item) })} placeholder="Nota o tarea libre adicional para este bloque" />
                  </article>;
                })}</div>
                <label><span>Observaciones generales</span><textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Opcional" /></label>
                <AgendaFormActions onSave={saveDraft} onDelete={events.some((event) => event.id === draft.id) ? () => { onChange(events.filter((event) => event.id !== draft.id)); setDraft(null); } : undefined} />
              </>
            )}

            {exercisePreview && (
              <div className="exercise-preview-backdrop" role="presentation" onMouseDown={() => setExercisePreview(null)}>
                <section className="exercise-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="exercise-preview-title" onMouseDown={(event) => event.stopPropagation()}>
                  <header><div><span className="eyebrow">FICHA DEL EJERCICIO</span><h3 id="exercise-preview-title">{exercisePreview.exercise.title}</h3><small>{exercisePreview.exercise.taskType} · {exerciseDuration(exercisePreview.exercise)} min</small></div><button type="button" aria-label="Cerrar ejercicio" onClick={() => setExercisePreview(null)}><X size={20} /></button></header>
                  <div className="exercise-preview-grid">
                    <div className="exercise-preview-board-column">
                      <TrainingBoard pieces={exercisePreview.exercise.board} actions={exercisePreview.exercise.actions || []} onChange={(board) => setExercisePreview((current) => current ? { ...current, exercise: { ...current.exercise, board } } : current)} onActionsChange={(actions) => setExercisePreview((current) => current ? { ...current, exercise: { ...current.exercise, actions } } : current)} label={`Pizarra editable de ${exercisePreview.exercise.title}`} />
                      <div className="exercise-sequence"><strong>Secuencia del ejercicio</strong><ol>{(exercisePreview.exercise.steps || []).map((step, index) => <li key={`${exercisePreview.exercise.id}-step-${index}`}><span>{index + 1}</span><p>{step}</p></li>)}</ol></div>
                    </div>
                    <aside>
                      <div><strong>Cómo se realiza</strong><p>{exercisePreview.exercise.description}</p></div>
                      <div><strong>Organización</strong><p>{exercisePreview.exercise.organization}</p></div>
                      <div><strong>Claves del entrenador</strong><p>{exercisePreview.exercise.coaching}</p></div>
                      <div className="exercise-preview-adaptation"><strong>Adaptación a {trainingSession?.playerCount || defaultPlayerCount} jugadores</strong><p>{exercisePlayerAdaptation(exercisePreview.exercise, trainingSession?.playerCount || defaultPlayerCount)}</p></div>
                      <div className="exercise-preview-age"><strong>Por qué sirve para {categoryLabel}</strong><p>{exercisePreview.exercise.ageBenefit}</p></div>
                    </aside>
                  </div>
                  <footer>
                    {!exercisePreview.blockId && <label><span>Añadir al bloque</span><select value={previewTargetBlock} onChange={(event) => setPreviewTargetBlock(event.target.value as TrainingBlock["id"])}>{(trainingSession?.blocks || defaultBlocks()).map((block) => { const used = blockExercises(block).reduce((total, exercise) => total + exerciseDuration(exercise), 0); return <option value={block.id} key={block.id}>{block.title} · {Math.max(0, block.minutes - used)} min disponibles</option> })}</select></label>}
                    <button type="button" className="primary-button" onClick={savePreviewExercise}><Check size={16} /> {exercisePreview.blockId ? "Guardar cambios" : "Añadir ejercicio"}</button>
                  </footer>
                </section>
              </div>
            )}
          </div>
        )}

        {draft?.type === "match" && draft.assignedByCoordinator && (
          <div className="agenda-form assigned-match-detail">
            <div className="assigned-match-heading">
              <span><ShieldCheck size={16} /> PARTIDO ASIGNADO POR COORDINACIÓN</span>
              <strong>{draft.rivalName}</strong>
              <small>{draft.assignedByName ? `Añadido por ${draft.assignedByName}` : "Añadido por coordinación"}</small>
            </div>
            <div className="assigned-match-ticket">
              <div><span>Fecha</span><strong>{new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${draft.date}T12:00:00`))}</strong></div>
              <div><span>Hora</span><strong>{draft.startTime}</strong></div>
              <div><span>Condición</span><strong>{draft.home ? "En casa" : "A domicilio"}</strong></div>
              <div><span>Campo</span><strong>{draft.field}</strong></div>
              {(draft.callupPlace || draft.callupTime) && <div><span>Citación</span><strong>{[draft.callupPlace, draft.callupTime].filter(Boolean).join(" · ")}</strong></div>}
              {draft.kit && <div><span>Equipación</span><strong>{draft.kit}</strong></div>}
              {draft.homeLockerRoom && <div><span>Vestuario</span><strong>{draft.homeLockerRoom}</strong></div>}
              {draft.awayLockerRoom && <div><span>Vest. visitante</span><strong>{draft.awayLockerRoom}</strong></div>}
            </div>
            {(draft.playInWhite || draft.notes) && (
              <div className="assigned-match-observations">
                <strong>Observaciones</strong>
                {draft.playInWhite && <div className="white-kit-notice">JUGAMOS DE BLANCO</div>}
                {draft.notes && <p className="assigned-match-notes">{draft.notes}</p>}
              </div>
            )}
            <div className="agenda-linked-actions">
              <button type="button" onClick={() => onOpenCallup(draft)}><ClipboardList size={17} /> Citación</button>
              <button onClick={() => onOpenStats(draft)}><BarChart3 size={17} /> Estadísticas</button>
              <button onClick={() => onOpenBoard(draft)}><PencilRuler size={17} /> Abrir alineación</button>
            </div>
          </div>
        )}

        {draft?.type === "match" && !draft.assignedByCoordinator && (
          <div className="agenda-form">
            <span className="eyebrow">PARTIDO</span>
            <div className="agenda-segmented">
              {(["liga", "amistoso", "torneo"] as const).map((type) => <button className={draft.matchType === type ? "active" : ""} key={type} onClick={() => setDraft({ ...draft, matchType: type })}>{type}</button>)}
            </div>
            <div className="agenda-segmented">
              <button className={draft.home ? "active" : ""} onClick={() => setDraft({ ...draft, home: true, field: "" })}>Local</button>
              <button className={!draft.home ? "active" : ""} onClick={() => { const rival = rivals.find((item) => item.id === draft.rivalId); setDraft({ ...draft, home: false, field: rival?.campo || draft.field }); }}>Visitante</button>
            </div>
            <label><span>Rival</span><select value={draft.rivalId} onChange={(event) => updateMatchRival(event.target.value)}><option value="">Selecciona rival</option>{rivals.map((rival) => <option key={rival.id} value={rival.id}>{rival.nombre}</option>)}</select></label>
            <label><span>Hora</span><input type="time" value={draft.startTime} onChange={(event) => setDraft({ ...draft, startTime: event.target.value })} /></label>
            {draft.home ? (
              <label><span>Campo</span><select value={draft.field} onChange={(event) => setDraft({ ...draft, field: event.target.value })}><option value="">Selecciona campo</option>{HOME_FIELDS.map((field) => <option key={field}>{field}</option>)}</select></label>
            ) : (
              <label><span>Campo del rival</span><input value={draft.field} onChange={(event) => setDraft({ ...draft, field: event.target.value })} placeholder="Se completa desde el rival" /></label>
            )}
            <div className="match-observations-group">
              <label><span>Observaciones</span><textarea rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Escribe cualquier indicación para el equipo" /></label>
              <label className={`white-kit-toggle${draft.playInWhite ? " active" : ""}`}>
                <input type="checkbox" checked={draft.playInWhite === true} onChange={(event) => setDraft({ ...draft, playInWhite: event.target.checked })} />
                <span aria-hidden="true" />
                <strong>Añadir en observaciones: JUGAMOS DE BLANCO</strong>
              </label>
            </div>
            <div className="agenda-linked-actions">
              <button type="button" onClick={() => onOpenCallup(draft)}><ClipboardList size={17} /> Citación</button>
              <button onClick={() => onOpenBoard(draft)}><PencilRuler size={17} /> Abrir alineación</button>
              <button onClick={() => onOpenStats(draft)}><BarChart3 size={17} /> Estadísticas</button>
            </div>
            <AgendaFormActions onSave={saveDraft} onDelete={events.some((event) => event.id === draft.id) ? () => { onChange(events.filter((event) => event.id !== draft.id)); setDraft(null); } : undefined} />
          </div>
        )}
      </aside>
      {zonePreview?.fieldId && zonePreview.zoneIds ? <FieldZoneDialog fieldId={zonePreview.fieldId} zoneIds={zonePreview.zoneIds} onClose={() => setZonePreview(null)} /> : null}
    </div>
  );
}

function AgendaFormActions({ onSave, onDelete }: { onSave: () => void; onDelete?: () => void }) {
  return <div className="agenda-form-actions">{onDelete && <button className="danger" onClick={onDelete}><Trash2 size={16} /> Eliminar</button>}<button className="primary-button" onClick={onSave}><Save size={16} /> Guardar</button></div>;
}
