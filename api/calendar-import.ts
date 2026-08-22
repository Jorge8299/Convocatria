import { randomUUID } from "node:crypto";
import {
  ApiRequest,
  ApiResponse,
  fail,
  getSession,
  getSql,
  jsonBody,
  methodNotAllowed,
} from "./_lib/server.js";

interface ImportedRival {
  nombre: string;
  campo: string;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const clean = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/^[\s|,;:–—-]+|[\s|,;:–—-]+$/g, "")
    .trim();
const isOliva = (value: string) =>
  /\b(?:u\.?\s*d\.?|union deportiva)\s+oliva\b/i.test(value);
const fieldPattern =
  /\b(campo|camp\b|estadio|estadi\b|polideportivo|poliesportiu|instalaci[oó]n|ciudad deportiva|complex esportiu|complejo deportivo|municipal)\b/i;
const teamPattern =
  /\b(c\.?\s*f\.?\s*b?\.?|c\.?\s*d\.?|u\.?\s*d\.?|u\.?\s*e\.?|f\.?\s*c\.?|a\.?\s*d\.?|atl[eé]tic|atl[eé]tico|escola|academia|sporting|racing|club de f[uú]tbol|f[uú]tbol base)\b/i;

async function extractText(fileName: string, mimeType: string, base64: string) {
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > 10 * 1024 * 1024)
    throw new Error("El archivo debe ocupar menos de 10 MB.");
  const extension = fileName.toLowerCase().split(".").pop() || "";
  if (extension === "pdf" || mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  if (
    extension === "docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer })).value;
  }
  if (["txt", "csv"].includes(extension) || mimeType.startsWith("text/"))
    return buffer.toString("utf8");
  throw new Error(
    "Formato no compatible. Utiliza PDF, Word (.docx), TXT o CSV.",
  );
}

export function detectRivals(text: string): ImportedRival[] {
  const lines = text
    .split(/\r?\n/)
    .map(clean)
    .filter((line) => line.length >= 3 && line.length <= 220);
  const fields = lines
    .map((line, index) =>
      fieldPattern.test(line) ? { index, value: line } : null,
    )
    .filter((item): item is { index: number; value: string } => Boolean(item));
  const candidates: Array<{ index: number; name: string }> = [];
  lines.forEach((line, index) => {
    const pieces = line
      .split(/\s+(?:vs?\.?|contra)\s+|\s+[–—-]\s+|\t|\s{3,}/i)
      .map(clean)
      .filter(Boolean);
    const usable = pieces.length > 1 ? pieces : [line];
    usable.forEach((piece) => {
      const withoutNoise = clean(
        piece
          .replace(/^(?:jornada|partido)\s*\d*\s*[:.-]?\s*/i, "")
          .replace(/\b\d{1,2}[/:.-]\d{1,2}(?:[/:.-]\d{2,4})?\b/g, ""),
      );
      if (
        teamPattern.test(withoutNoise) &&
        !fieldPattern.test(withoutNoise) &&
        !isOliva(withoutNoise) &&
        !/clasificaci[oó]n|calendario|competici[oó]n/i.test(withoutNoise)
      )
        candidates.push({ index, name: withoutNoise });
    });
  });
  const unique = new Map<string, ImportedRival>();
  candidates.forEach((candidate) => {
    const key = normalize(candidate.name);
    if (!key || unique.has(key)) return;
    const nearby = fields
      .map((field) => ({
        ...field,
        distance: Math.abs(field.index - candidate.index),
      }))
      .filter((field) => field.distance <= 5)
      .sort((a, b) => a.distance - b.distance)[0];
    unique.set(key, { nombre: candidate.name, campo: nearby?.value || "" });
  });
  return [...unique.values()].slice(0, 80);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== "POST") return methodNotAllowed(res);
    const session = await getSession(req);
    if (!session || session.role !== "superadmin") {
      res
        .status(403)
        .json({ error: "Solo el superadmin puede importar calendarios." });
      return;
    }
    const body = jsonBody<{
      action: "extract" | "save";
      fileName?: string;
      mimeType?: string;
      base64?: string;
      accountId?: string;
      rivals?: ImportedRival[];
    }>(req);
    if (body.action === "extract") {
      const text = await extractText(
        body.fileName || "",
        body.mimeType || "",
        body.base64 || "",
      );
      if (!text.trim()) {
        res
          .status(422)
          .json({
            error:
              "El documento no contiene texto legible. Si está escaneado, conviértelo antes a PDF con texto.",
          });
        return;
      }
      const rivals = detectRivals(text);
      if (!rivals.length) {
        res
          .status(422)
          .json({
            error:
              "No se detectaron equipos automáticamente. Prueba con un PDF o Word que contenga texto seleccionable.",
          });
        return;
      }
      res
        .status(200)
        .json({ rivals, lines: text.split(/\r?\n/).filter(Boolean).length });
      return;
    }
    if (body.action === "save") {
      const rivals = (body.rivals || [])
        .map((item) => ({
          nombre: clean(item.nombre || ""),
          campo: clean(item.campo || ""),
        }))
        .filter((item) => item.nombre)
        .slice(0, 80);
      if (!body.accountId || !rivals.length) {
        res
          .status(400)
          .json({ error: "Selecciona un equipo y revisa al menos un rival." });
        return;
      }
      const sql = getSql();
      const coachRows =
        await sql`SELECT id FROM club_accounts WHERE id=${body.accountId} AND role='entrenador' AND active=TRUE LIMIT 1`;
      if (!coachRows.length) {
        res
          .status(404)
          .json({ error: "El entrenador seleccionado ya no está disponible." });
        return;
      }
      const storedRows =
        await sql`SELECT data FROM club_stores WHERE account_id=${body.accountId} AND area='rivals' LIMIT 1`;
      const current = Array.isArray(storedRows[0]?.data)
        ? (storedRows[0].data as Array<{
            id: string;
            nombre: string;
            campo: string;
          }>)
        : [];
      const known = new Set(current.map((item) => normalize(item.nombre)));
      const additions = rivals
        .filter((item) => !known.has(normalize(item.nombre)))
        .map((item) => ({ id: `import-${randomUUID()}`, ...item }));
      const merged = [...current, ...additions];
      await sql`INSERT INTO club_stores (account_id,area,data) VALUES (${body.accountId},'rivals',${JSON.stringify(merged)}::jsonb)
        ON CONFLICT (account_id,area) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`;
      res
        .status(200)
        .json({
          added: additions.length,
          total: merged.length,
          skipped: rivals.length - additions.length,
        });
      return;
    }
    res.status(400).json({ error: "Acción no válida." });
  } catch (error) {
    if (
      error instanceof Error &&
      /archivo|Formato|PDF|Word/i.test(error.message)
    ) {
      res.status(400).json({ error: error.message });
      return;
    }
    fail(res, error);
  }
}
