export type TrainingAILevel = 'iniciacion' | 'medio' | 'avanzado';
export type TrainingAIIntensity = 'baja' | 'media' | 'alta';
export type TrainingAIGenerationType = 'session' | 'exercise' | 'adapt';

export interface TrainingAIExercise {
  id: string;
  order: number;
  block: string;
  name: string;
  duration: number;
  objective: string;
  players: number;
  space: string;
  material: string[];
  organization: string;
  development: string;
  instructions: string[];
  variants: string[];
  coachingPoints: string[];
}

export interface TrainingAISession {
  title: string;
  totalDuration: number;
  category: string;
  format: 'F8' | 'F11';
  players: number;
  goalkeepers: number;
  objectives: string[];
  totalMaterial: string[];
  summary: string;
  exercises: TrainingAIExercise[];
  generationSource: 'ai';
}

export interface TrainingAIContext {
  players: number;
  goalkeepers: number;
  duration: number;
  level: TrainingAILevel;
  mode: 'individual' | 'collective';
  objectives: string[];
  material: string[];
  fieldSize: string;
  intensity: TrainingAIIntensity;
  observations: string;
}

const text = (value: unknown, max = 1200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const list = (value: unknown, maxItems = 12, maxLength = 240) => Array.isArray(value)
  ? value.map((item) => text(item, maxLength)).filter(Boolean).slice(0, maxItems)
  : [];
const integer = (value: unknown, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

export function validateTrainingAIContext(value: unknown): TrainingAIContext | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const players = integer(input.players, 1, 40);
  const goalkeepers = integer(input.goalkeepers, 0, 6);
  const duration = integer(input.duration, 20, 180);
  const level = ['iniciacion', 'medio', 'avanzado'].includes(String(input.level)) ? input.level as TrainingAILevel : null;
  const mode = ['individual', 'collective'].includes(String(input.mode)) ? input.mode as TrainingAIContext['mode'] : null;
  const intensity = ['baja', 'media', 'alta'].includes(String(input.intensity)) ? input.intensity as TrainingAIIntensity : null;
  const objectives = list(input.objectives, 8, 80);
  if (players === null || goalkeepers === null || goalkeepers > players || duration === null || !level || !mode || !intensity || !objectives.length) return null;
  return { players, goalkeepers, duration, level, mode, intensity, objectives, material: list(input.material, 20, 80), fieldSize: text(input.fieldSize, 120), observations: text(input.observations, 1000) };
}

export function validateTrainingAISession(value: unknown, expected?: { players?: number; duration?: number }): TrainingAISession | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.exercises) || !input.exercises.length || input.exercises.length > 12) return null;
  const exercises: TrainingAIExercise[] = [];
  for (const [index, raw] of input.exercises.entries()) {
    if (!raw || typeof raw !== 'object') return null;
    const item = raw as Record<string, unknown>;
    const duration = integer(item.duration, 3, 90);
    const players = integer(item.players, 1, 40);
    const name = text(item.name, 140);
    const block = text(item.block, 80);
    const objective = text(item.objective, 160);
    const organization = text(item.organization);
    const development = text(item.development);
    if (duration === null || players === null || !name || !block || !objective || !organization || !development) return null;
    exercises.push({ id: text(item.id, 100) || `ai-${index + 1}`, order: index + 1, block, name, duration, objective, players, space: text(item.space, 160), material: list(item.material), organization, development, instructions: list(item.instructions), variants: list(item.variants), coachingPoints: list(item.coachingPoints) });
  }
  const totalDuration = exercises.reduce((sum, item) => sum + item.duration, 0);
  const players = integer(input.players, 1, 40);
  const goalkeepers = integer(input.goalkeepers, 0, 6);
  const title = text(input.title, 160);
  const category = text(input.category, 80);
  const format = input.format === 'F11' ? 'F11' : input.format === 'F8' ? 'F8' : null;
  const objectives = list(input.objectives, 10, 100);
  if (!title || !category || !format || players === null || goalkeepers === null || goalkeepers > players || !objectives.length || !text(input.summary, 1000)) return null;
  if (expected?.players && players !== expected.players) return null;
  if (expected?.duration && Math.abs(totalDuration - expected.duration) > 5) return null;
  return { title, totalDuration, category, format, players, goalkeepers, objectives, totalMaterial: list(input.totalMaterial, 20, 80), summary: text(input.summary, 1000), exercises, generationSource: 'ai' };
}

export const INDIVIDUAL_OBJECTIVES = ['Técnica individual', 'Conducción', 'Pase', 'Control', 'Regate', 'Finalización', 'Toma de decisiones', 'Habilidades específicas'];
export const COLLECTIVE_OBJECTIVES = ['Coordinación grupal', 'Posesión', 'Salida de balón', 'Presión', 'Transiciones', 'Sistemas tácticos', 'Automatismos colectivos', 'Finalización colectiva'];
export const TRAINING_MATERIALS = ['Balones', 'Conos pequeños', 'Conos grandes', 'Petos', 'Picas', 'Aros', 'Miniporterías', 'Portería reglamentaria', 'Escaleras de coordinación'];
