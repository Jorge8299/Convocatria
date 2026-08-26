import type { TrainingBoardAction, TrainingBoardPiece } from "./TrainingBoard";
import type { PlannedExercise, TrainingBlock, TrainingSession } from "./AgendaView";

export interface TrainingPdfInput {
  categoryLabel: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  session: TrainingSession;
}

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = 279;

const palette = {
  navy: [7, 29, 56] as const,
  blue: [29, 105, 181] as const,
  blueSoft: [232, 242, 255] as const,
  green: [29, 132, 84] as const,
  greenSoft: [232, 247, 239] as const,
  amber: [198, 132, 20] as const,
  amberSoft: [255, 247, 226] as const,
  ink: [22, 43, 68] as const,
  muted: [92, 111, 133] as const,
  border: [216, 226, 237] as const,
  surface: [247, 250, 253] as const,
  white: [255, 255, 255] as const,
};

const cleanText = (value: string) =>
  value.replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();

const exerciseDuration = (exercise: PlannedExercise) =>
  Math.max(0, Number(exercise.minutes) || 0);

const blockExercises = (block: TrainingBlock) =>
  block.exercises?.length ? block.exercises : block.exercise ? [block.exercise] : [];

const formatTrainingDate = (date: string) => {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${date}T12:00:00`));
  } catch {
    return date;
  }
};

const safeFileName = (value: string) =>
  cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

function drawArrow(
  doc: import("jspdf").jsPDF,
  action: TrainingBoardAction,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const colours: Record<TrainingBoardAction["kind"], readonly [number, number, number]> = {
    pass: [255, 225, 90], run: [255, 255, 255], dribble: [255, 159, 53], press: [255, 89, 100],
  };
  const fromX = x + (action.from.x / 100) * width;
  const fromY = y + (action.from.y / 100) * height;
  const toX = x + (action.to.x / 100) * width;
  const toY = y + (action.to.y / 100) * height;
  const colour = colours[action.kind];
  doc.setDrawColor(...colour);
  doc.setLineWidth(action.kind === "press" ? 0.65 : 0.48);
  doc.setLineDashPattern(
    action.kind === "pass" ? [2.2, 1.2] : action.kind === "run" ? [0.8, 1.2] : action.kind === "dribble" ? [3, 0.8, 0.5, 0.8] : [1.2, 0.8],
    0,
  );
  doc.line(fromX, fromY, toX, toY);
  doc.setLineDashPattern([], 0);
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const head = 2.4;
  doc.setFillColor(...colour);
  doc.triangle(toX, toY, toX - Math.cos(angle - 0.55) * head, toY - Math.sin(angle - 0.55) * head, toX - Math.cos(angle + 0.55) * head, toY - Math.sin(angle + 0.55) * head, "F");
  if (action.order) {
    doc.setFillColor(...palette.navy);
    doc.circle(fromX + 2, fromY - 2, 1.65, "F");
    doc.setTextColor(...palette.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.text(String(action.order), fromX + 2, fromY - 1.35, { align: "center" });
  }
}

function drawPiece(
  doc: import("jspdf").jsPDF,
  piece: TrainingBoardPiece,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const pieceX = x + (piece.x / 100) * width;
  const pieceY = y + (piece.y / 100) * height;
  if (piece.kind === "ball") {
    doc.setFillColor(255, 255, 255); doc.setDrawColor(20, 33, 52); doc.circle(pieceX, pieceY, 1.8, "FD");
    doc.setFillColor(20, 33, 52); doc.circle(pieceX, pieceY, 0.72, "F");
    return;
  }
  if (piece.kind === "cone") {
    doc.setFillColor(255, 194, 41); doc.setDrawColor(255, 255, 255);
    doc.triangle(pieceX, pieceY - 2.1, pieceX - 2.1, pieceY + 1.8, pieceX + 2.1, pieceY + 1.8, "FD");
    return;
  }
  if (piece.kind === "attacker") doc.setFillColor(22, 116, 232);
  else doc.setFillColor(237, 75, 85);
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.65); doc.circle(pieceX, pieceY, 2.65, "FD");
  if (piece.label) {
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(5.5);
    doc.text(cleanText(piece.label).slice(0, 3), pieceX, pieceY + 0.8, { align: "center" });
  }
}

function drawBoard(
  doc: import("jspdf").jsPDF,
  pieces: TrainingBoardPiece[],
  actions: TrainingBoardAction[],
  x: number,
  y: number,
  width: number,
  height: number,
) {
  doc.setFillColor(33, 139, 87); doc.roundedRect(x, y, width, height, 2.2, 2.2, "F");
  const stripeWidth = width / 8;
  for (let index = 0; index < 8; index += 2) { doc.setFillColor(28, 126, 78); doc.rect(x + index * stripeWidth, y, stripeWidth, height, "F"); }
  doc.setDrawColor(231, 255, 242); doc.setLineWidth(0.45);
  doc.roundedRect(x + 1.7, y + 1.7, width - 3.4, height - 3.4, 1.4, 1.4, "S");
  doc.line(x + width / 2, y + 1.7, x + width / 2, y + height - 1.7);
  doc.circle(x + width / 2, y + height / 2, height * 0.095, "S");
  doc.rect(x + 1.7, y + height * 0.28, width * 0.13, height * 0.44, "S");
  doc.rect(x + width - 1.7 - width * 0.13, y + height * 0.28, width * 0.13, height * 0.44, "S");
  actions.forEach((action) => drawArrow(doc, action, x, y, width, height));
  pieces.forEach((piece) => drawPiece(doc, piece, x, y, width, height));
}

export async function buildTrainingPdf(input: TrainingPdfInput) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  let y = 0;

  const drawHeader = (continuation = false) => {
    doc.setFillColor(...palette.navy); doc.rect(0, 0, PAGE_WIDTH, continuation ? 24 : 39, "F");
    doc.setFillColor(...palette.blue); doc.rect(0, continuation ? 23 : 38, PAGE_WIDTH, 1, "F");
    doc.setTextColor(...palette.white); doc.setFont("helvetica", "bold"); doc.setFontSize(continuation ? 15 : 21);
    doc.text(continuation ? "Plan de entrenamiento - continuacion" : "Plan de entrenamiento", MARGIN, continuation ? 11 : 16);
    doc.setFontSize(8); doc.setTextColor(180, 213, 248);
    doc.text(`CONVO | ${cleanText(input.categoryLabel).toUpperCase()}`, MARGIN, continuation ? 17 : 23);
    if (!continuation) {
      doc.setTextColor(221, 235, 250); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
      doc.text(cleanText(formatTrainingDate(input.date)), MARGIN, 31);
      doc.text(`${input.startTime || "--:--"} - ${input.endTime || "--:--"}`, PAGE_WIDTH - MARGIN, 31, { align: "right" });
    }
    y = continuation ? 31 : 47;
  };

  const ensureSpace = (height: number) => { if (y + height > BOTTOM_LIMIT) { doc.addPage(); drawHeader(true); } };

  const drawWrapped = (
    label: string, value: string, x: number, top: number, width: number,
    options: { background?: readonly [number, number, number]; accent?: readonly [number, number, number] } = {},
  ) => {
    const content = cleanText(value) || "Sin indicaciones";
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.2);
    const lines = doc.splitTextToSize(content, width - 8) as string[];
    const height = 10 + lines.length * 3.8;
    doc.setFillColor(...(options.background || palette.surface)); doc.roundedRect(x, top, width, height, 2, 2, "F");
    if (options.accent) { doc.setFillColor(...options.accent); doc.roundedRect(x, top, 2, height, 1, 1, "F"); }
    doc.setTextColor(...palette.muted); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.text(cleanText(label).toUpperCase(), x + 5, top + 5);
    doc.setTextColor(...palette.ink); doc.setFont("helvetica", "normal"); doc.setFontSize(8.2); doc.text(lines, x + 5, top + 10);
    return height;
  };

  drawHeader();
  const exercises = input.session.blocks.flatMap(blockExercises);
  const usedMinutes = exercises.reduce((total, exercise) => total + exerciseDuration(exercise), 0);
  const allocatedMinutes = input.session.blocks.reduce((total, block) => total + block.minutes, 0);
  const metricWidth = (CONTENT_WIDTH - 9) / 4;
  const metrics = [["DURACION", `${usedMinutes}/${allocatedMinutes} min`], ["JUGADORES", String(input.session.playerCount || 0)], ["EJERCICIOS", String(exercises.length)], ["OBJETIVO", input.session.objective || "Sin definir"]];
  metrics.forEach(([label, value], index) => {
    const x = MARGIN + index * (metricWidth + 3);
    if (index === 0) doc.setFillColor(...palette.blueSoft);
    else doc.setFillColor(...palette.surface);
    doc.roundedRect(x, y, metricWidth, 20, 2.4, 2.4, "F");
    doc.setTextColor(...palette.muted); doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); doc.text(label, x + 4, y + 6);
    doc.setTextColor(...palette.ink); doc.setFontSize(index === 3 ? 8 : 12);
    const metricLines = doc.splitTextToSize(cleanText(value), metricWidth - 8) as string[];
    doc.text(metricLines.slice(0, 2), x + 4, y + 13);
  });
  y += 26;
  if (input.session.focus) y += drawWrapped("Matiz de la sesion", input.session.focus, MARGIN, y, CONTENT_WIDTH, { background: palette.blueSoft, accent: palette.blue }) + 5;
  if (input.session.materials.length) y += drawWrapped("Material", input.session.materials.join(" | "), MARGIN, y, CONTENT_WIDTH) + 7;

  input.session.blocks.forEach((block, blockIndex) => {
    const blockItems = blockExercises(block);
    const blockUsed = blockItems.reduce((total, exercise) => total + exerciseDuration(exercise), 0);
    ensureSpace(23);
    doc.setFillColor(...palette.navy); doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 14, 2.5, 2.5, "F");
    doc.setFillColor(...palette.blue); doc.circle(MARGIN + 7, y + 7, 3.4, "F");
    doc.setTextColor(...palette.white); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text(String(blockIndex + 1), MARGIN + 7, y + 8, { align: "center" });
    doc.setFontSize(10.5); doc.text(cleanText(block.title), MARGIN + 14, y + 8.6);
    doc.setFontSize(8); doc.setTextColor(195, 216, 239);
    doc.text(`${blockItems.length} ${blockItems.length === 1 ? "ejercicio" : "ejercicios"} | ${blockUsed}/${block.minutes} min`, PAGE_WIDTH - MARGIN - 5, y + 8.5, { align: "right" });
    y += 18;
    if (!blockItems.length) { y += drawWrapped("Tarea libre", block.task || "Bloque sin ejercicio asignado", MARGIN, y, CONTENT_WIDTH, { background: palette.amberSoft, accent: palette.amber }) + 8; return; }

    blockItems.forEach((exercise, exerciseIndex) => {
      const boardWidth = 75; const boardHeight = 45.5; const copyWidth = CONTENT_WIDTH - boardWidth - 7;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.1);
      const descriptionLines = doc.splitTextToSize(cleanText(exercise.description), copyWidth - 8) as string[];
      const coachingLines = doc.splitTextToSize(cleanText(exercise.coaching), copyWidth - 8) as string[];
      const topHeight = Math.max(boardHeight, 22 + descriptionLines.length * 3.5 + coachingLines.length * 3.5);
      const organizationLines = doc.splitTextToSize(cleanText(exercise.organization), CONTENT_WIDTH - 10) as string[];
      const ageLines = doc.splitTextToSize(cleanText(exercise.ageBenefit), CONTENT_WIDTH - 10) as string[];
      const detailHeight = 22 + organizationLines.length * 3.6 + ageLines.length * 3.6;
      const exerciseHeight = 11 + topHeight + detailHeight + 7;
      ensureSpace(exerciseHeight);
      doc.setDrawColor(...palette.border); doc.setFillColor(255, 255, 255); doc.roundedRect(MARGIN, y, CONTENT_WIDTH, exerciseHeight - 4, 3, 3, "FD");
      doc.setFillColor(...palette.greenSoft); doc.roundedRect(MARGIN + 4, y + 4, 7, 7, 2, 2, "F");
      doc.setTextColor(...palette.green); doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text(String(exerciseIndex + 1), MARGIN + 7.5, y + 8.8, { align: "center" });
      doc.setTextColor(...palette.ink); doc.setFontSize(10.5); doc.text(cleanText(exercise.title), MARGIN + 14, y + 9);
      doc.setTextColor(...palette.blue); doc.setFontSize(7.2); doc.text(`${cleanText(exercise.taskType)} | ${exerciseDuration(exercise)} min`, PAGE_WIDTH - MARGIN - 5, y + 8.7, { align: "right" });
      const contentTop = y + 15;
      drawBoard(doc, exercise.board, exercise.actions || [], MARGIN + 4, contentTop, boardWidth, boardHeight);
      const copyX = MARGIN + boardWidth + 11;
      doc.setTextColor(...palette.muted); doc.setFont("helvetica", "bold"); doc.setFontSize(6.4); doc.text("COMO SE REALIZA", copyX, contentTop + 2);
      doc.setTextColor(...palette.ink); doc.setFont("helvetica", "normal"); doc.setFontSize(8.1); doc.text(descriptionLines, copyX, contentTop + 7);
      const coachingTop = contentTop + 10 + descriptionLines.length * 3.5;
      doc.setTextColor(...palette.muted); doc.setFont("helvetica", "bold"); doc.setFontSize(6.4); doc.text("CLAVES DEL ENTRENADOR", copyX, coachingTop);
      doc.setTextColor(...palette.ink); doc.setFont("helvetica", "normal"); doc.setFontSize(8.1); doc.text(coachingLines, copyX, coachingTop + 5);
      const detailTop = contentTop + topHeight + 3;
      doc.setFillColor(...palette.surface); doc.roundedRect(MARGIN + 4, detailTop, CONTENT_WIDTH - 8, detailHeight - 3, 2, 2, "F");
      doc.setTextColor(...palette.muted); doc.setFont("helvetica", "bold"); doc.setFontSize(6.4); doc.text("ORGANIZACION", MARGIN + 8, detailTop + 5);
      doc.setTextColor(...palette.ink); doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.text(organizationLines, MARGIN + 8, detailTop + 10);
      const ageTop = detailTop + 13 + organizationLines.length * 3.6;
      doc.setTextColor(...palette.green); doc.setFont("helvetica", "bold"); doc.setFontSize(6.4); doc.text(`POR QUE FUNCIONA PARA ${cleanText(input.categoryLabel).toUpperCase()}`, MARGIN + 8, ageTop);
      doc.setTextColor(...palette.ink); doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.text(ageLines, MARGIN + 8, ageTop + 5);
      y += exerciseHeight;
    });
    if (block.task) { ensureSpace(22); y += drawWrapped("Nota del bloque", block.task, MARGIN, y, CONTENT_WIDTH, { background: palette.amberSoft, accent: palette.amber }) + 8; }
  });

  if (input.notes) { ensureSpace(25); drawWrapped("Observaciones generales", input.notes, MARGIN, y, CONTENT_WIDTH, { background: palette.blueSoft, accent: palette.blue }); }
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page); doc.setDrawColor(...palette.border); doc.line(MARGIN, 286, PAGE_WIDTH - MARGIN, 286);
    doc.setTextColor(...palette.muted); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text("Generado con CONVO", MARGIN, 291); doc.text(`Pagina ${page} de ${pageCount}`, PAGE_WIDTH - MARGIN, 291, { align: "right" });
  }
  return doc;
}

export async function downloadTrainingPdf(input: TrainingPdfInput) {
  const doc = await buildTrainingPdf(input);
  const fileName = ["entrenamiento", input.date, safeFileName(input.categoryLabel)].filter(Boolean).join("-");
  doc.save(`${fileName}.pdf`);
}
