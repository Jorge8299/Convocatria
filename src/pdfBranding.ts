import { FOOTBALL_PHRASES } from "./motivational";

type JsPdfDoc = import("jspdf").jsPDF;

const CREST_PATH = "/escudo-ud-oliva.jpg";
let cachedCrestDataUrl: string | null | undefined;

export const pdfBrand = {
  navy: [7, 29, 56] as const,
  blue: [29, 105, 181] as const,
  green: [8, 116, 82] as const,
  amber: [226, 166, 43] as const,
  ink: [20, 39, 62] as const,
  muted: [92, 111, 133] as const,
  border: [207, 219, 232] as const,
  surface: [246, 250, 253] as const,
  white: [255, 255, 255] as const,
};

export const pdfCleanText = (value: string) =>
  value.replace(/\s+/g, " ").trim();

export const getDailyFootballPhrase = (seed: string) => {
  const daySeed = new Date().toISOString().slice(0, 10);
  const value = `${daySeed}-${seed}`;
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return FOOTBALL_PHRASES[hash % FOOTBALL_PHRASES.length];
};

export async function getClubCrestDataUrl() {
  if (cachedCrestDataUrl !== undefined) return cachedCrestDataUrl;
  try {
    const response = await fetch(CREST_PATH);
    if (!response.ok) throw new Error("No se pudo cargar el escudo.");
    const blob = await response.blob();
    cachedCrestDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    cachedCrestDataUrl = null;
  }
  return cachedCrestDataUrl;
}

export function drawMagicPdfHeader(
  doc: JsPdfDoc,
  {
    title,
    period,
    scope,
    phrase,
    crestDataUrl,
    width,
    margin,
  }: {
    title: string;
    period: string;
    scope: string;
    phrase: string;
    crestDataUrl?: string | null;
    width: number;
    margin: number;
  },
) {
  doc.setFillColor(...pdfBrand.white);
  doc.rect(0, 0, width, 210, "F");
  doc.setFillColor(...pdfBrand.green);
  doc.rect(0, 0, width, 3.2, "F");
  doc.setFillColor(...pdfBrand.amber);
  doc.rect(0, 3.2, width, 1.1, "F");

  const crestSize = 19;
  const crestX = margin;
  const crestY = 7.5;
  if (crestDataUrl) {
    doc.setDrawColor(226, 233, 241);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(crestX, crestY, crestSize, crestSize, 3, 3, "FD");
    doc.addImage(crestDataUrl, "JPEG", crestX + 1.5, crestY + 1.5, crestSize - 3, crestSize - 3);
  } else {
    doc.setDrawColor(226, 233, 241);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(crestX, crestY, crestSize, crestSize, 3, 3, "FD");
    doc.setTextColor(...pdfBrand.green);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text("UD", crestX + crestSize / 2, crestY + 8.4, { align: "center" });
    doc.text("OLIVA", crestX + crestSize / 2, crestY + 12.3, { align: "center" });
  }

  const textX = margin + crestSize + 8;
  doc.setTextColor(...pdfBrand.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15.5);
  doc.text(pdfCleanText(title), textX, 12.5);
  doc.setTextColor(...pdfBrand.green);
  doc.setFontSize(10.6);
  doc.text(pdfCleanText(period).toUpperCase(), textX, 20.4);
  doc.setTextColor(...pdfBrand.muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.text(pdfCleanText(scope), textX, 26.5);

  const phraseText = `Frase del dia: ${pdfCleanText(phrase)}`;
  const phraseWidth = Math.min(118, width - textX - margin);
  const phraseLines = doc.splitTextToSize(phraseText, phraseWidth) as string[];
  doc.setTextColor(101, 119, 139);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.1);
  doc.text(phraseLines.slice(0, 1), width - margin, 15.3, { align: "right" });

  doc.setDrawColor(222, 231, 240);
  doc.line(margin, 32.2, width - margin, 32.2);
  doc.setDrawColor(...pdfBrand.amber);
  doc.setLineWidth(0.8);
  doc.line(margin, 32.2, margin + 36, 32.2);
  doc.setLineWidth(0.3);
}
