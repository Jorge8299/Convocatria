export type TrainingAILevel = 'iniciacion' | 'medio' | 'avanzado';
export type TrainingAIIntensity = 'baja' | 'media' | 'alta';
export type TrainingAIGenerationType = 'session' | 'exercise' | 'adapt';
export type TrainingAIBoardPieceKind = 'attacker' | 'defender' | 'ball' | 'cone';
export type TrainingAIBoardActionKind = 'pass' | 'run' | 'dribble' | 'press';

export interface TrainingAIBoardPiece { id: string; kind: TrainingAIBoardPieceKind; x: number; y: number; label?: string }
export interface TrainingAIBoardAction { id: string; kind: TrainingAIBoardActionKind; from: { x: number; y: number }; to: { x: number; y: number }; curve?: number; order?: number }

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
  board: TrainingAIBoardPiece[];
  actions: TrainingAIBoardAction[];
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
const list = (value: unknown, maxItems = 12, maxLength = 240) => (Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n|,\s*/) : [])
  .map((item) => text(item, maxLength)).filter(Boolean).slice(0, maxItems);
const integer = (value: unknown, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
};
const coordinate = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 4 && parsed <= 96 ? Math.round(parsed * 10) / 10 : null;
};
const versusCounts = (value: string) => {
  const match=value.match(/\b(\d{1,2})\s*(?:v(?:s)?\.?|x|contra)\s*(\d{1,2})\b/i);
  if(!match)return null;
  const attackers=Number(match[1]),defenders=Number(match[2]);
  return attackers>0&&defenders>0&&attackers+defenders<=40?{attackers,defenders}:null;
};
const generatedPiece=(exerciseIndex:number,kind:TrainingAIBoardPieceKind,index:number,total:number):TrainingAIBoardPiece=>{
  const side=kind==='attacker'?0:1,column=index%5,row=Math.floor(index/5),rows=Math.ceil(total/5);
  return {id:`ai-${exerciseIndex+1}-${kind}-${index+1}`,kind,x:(side?58:18)+column*5,y:20+(row+1)*(60/(rows+1)),label:`${kind==='attacker'?'A':'D'}${index+1}`.slice(0,3)};
};
function alignExerciseBoard(input:{index:number;name:string;organization:string;development:string;objective:string;material:string[];board:TrainingAIBoardPiece[];actions:TrainingAIBoardAction[]}){
  const description=`${input.name} ${input.organization} ${input.development} ${input.objective}`;
  const counts=versusCounts(description);
  let board=[...input.board];
  if(counts){
    for(const [kind,total] of [['attacker',counts.attackers],['defender',counts.defenders]] as const){
      const current=board.filter(piece=>piece.kind===kind).slice(0,total);
      while(current.length<total)current.push(generatedPiece(input.index,kind,current.length,total));
      board=board.filter(piece=>piece.kind!==kind).concat(current);
    }
  }
  const footballTask=!/estir|movilidad|vuelta a la calma/i.test(`${input.name} ${input.development}`);
  if(footballTask&&!board.some(piece=>piece.kind==='ball')){
    const starter=board.find(piece=>piece.kind==='attacker')||board[0];
    board.push({id:`ai-${input.index+1}-ball`,kind:'ball',x:starter?Math.min(96,starter.x+3):50,y:starter?.y||50});
  }
  if(input.material.some(item=>/cono/i.test(item))&&!board.some(piece=>piece.kind==='cone')){
    [[12,14],[12,86],[88,14],[88,86]].forEach(([x,y],index)=>board.push({id:`ai-${input.index+1}-cone-${index+1}`,kind:'cone',x,y}));
  }
  return {board:board.slice(0,40),actions:input.actions};
}

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
    const explicitCounts=versusCounts(`${name} ${organization} ${development} ${objective}`);
    if(explicitCounts&&explicitCounts.attackers+explicitCounts.defenders>players)return null;
    if (!Array.isArray(item.board) || item.board.length < 2 || item.board.length > 40 || !Array.isArray(item.actions) || item.actions.length > 24) return null;
    const board = item.board.map((rawPiece, pieceIndex) => {
      if (typeof rawPiece === 'string') {
        const [rawKind,rawX,rawY,rawLabel='']=rawPiece.split('|').map(part=>part.trim());
        const kind=['attacker','defender','ball','cone'].includes(rawKind)?rawKind as TrainingAIBoardPieceKind:null,x=coordinate(rawX),y=coordinate(rawY);
        return kind&&x!==null&&y!==null?{id:`ai-${index+1}-piece-${pieceIndex+1}`,kind,x,y,label:text(rawLabel,3)||undefined}:null;
      }
      if (!rawPiece || typeof rawPiece !== 'object') return null;
      const piece = rawPiece as Record<string, unknown>, kind = ['attacker','defender','ball','cone'].includes(String(piece.kind)) ? piece.kind as TrainingAIBoardPieceKind : null;
      const x = coordinate(piece.x), y = coordinate(piece.y);
      return kind && x !== null && y !== null ? { id: text(piece.id, 80) || `ai-${index + 1}-piece-${pieceIndex + 1}`, kind, x, y, label: text(piece.label, 3) || undefined } : null;
    });
    const actions = item.actions.map((rawAction, actionIndex) => {
      if(typeof rawAction==='string'){
        const [rawKind,rawFromX,rawFromY,rawToX,rawToY,rawOrder='',rawCurve='']=rawAction.split('|').map(part=>part.trim());
        const kind=['pass','run','dribble','press'].includes(rawKind)?rawKind as TrainingAIBoardActionKind:null,fromX=coordinate(rawFromX),fromY=coordinate(rawFromY),toX=coordinate(rawToX),toY=coordinate(rawToY);
        if(!kind||fromX===null||fromY===null||toX===null||toY===null)return null;
        const order=integer(rawOrder,1,24),curve=Number(rawCurve);
        return {id:`ai-${index+1}-action-${actionIndex+1}`,kind,from:{x:fromX,y:fromY},to:{x:toX,y:toY},order:order||undefined,curve:Number.isFinite(curve)&&Math.abs(curve)<=30?curve:undefined};
      }
      if (!rawAction || typeof rawAction !== 'object') return null;
      const action=rawAction as Record<string,unknown>,from=action.from as Record<string,unknown>|undefined,to=action.to as Record<string,unknown>|undefined;
      const kind=['pass','run','dribble','press'].includes(String(action.kind))?action.kind as TrainingAIBoardActionKind:null;
      const fromX=coordinate(from?.x??action.fromX),fromY=coordinate(from?.y??action.fromY),toX=coordinate(to?.x??action.toX),toY=coordinate(to?.y??action.toY);
      if(!kind||fromX===null||fromY===null||toX===null||toY===null)return null;
      const order=integer(action.order,1,24),curve=Number(action.curve);
      return {id:text(action.id,80)||`ai-${index+1}-action-${actionIndex+1}`,kind,from:{x:fromX,y:fromY},to:{x:toX,y:toY},order:order||undefined,curve:Number.isFinite(curve)&&Math.abs(curve)<=30?curve:undefined};
    });
    if(board.some(piece=>!piece)||actions.some(action=>!action))return null;
    const material=list(item.material),aligned=alignExerciseBoard({index,name,organization,development,objective,material,board:board as TrainingAIBoardPiece[],actions:actions as TrainingAIBoardAction[]});
    exercises.push({ id: text(item.id, 100) || `ai-${index + 1}`, order: index + 1, block, name, duration, objective, players, space: text(item.space, 160), material, organization, development, instructions: list(item.instructions), variants: list(item.variants), coachingPoints: list(item.coachingPoints), board: aligned.board, actions: aligned.actions });
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
