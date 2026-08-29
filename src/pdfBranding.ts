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
  doc.setFillColor(...pdfBrand.surface);
  doc.rect(0, 0, width, 210, "F");
  doc.setFillColor(...pdfBrand.navy);
  doc.rect(0, 0, width, 28, "F");
  doc.setFillColor(...pdfBrand.green);
  doc.rect(0, 27, width, 1.2, "F");
  doc.setFillColor(...pdfBrand.amber);
  doc.roundedRect(margin, 7, 1.8, 15, 0.8, 0.8, "F");

  doc.setTextColor(...pdfBrand.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(pdfCleanText(title), margin + 5, 10.8);
  doc.setFontSize(8.4);
  doc.setTextColor(213, 232, 248);
  doc.text(pdfCleanText(period), margin + 5, 17.2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.3);
  doc.setTextColor(186, 219, 207);
  doc.text(pdfCleanText(scope).toUpperCase(), margin + 5, 22.7);

  const crestSize = 18;
  const crestX = width - margin - crestSize;
  if (crestDataUrl) {
    doc.setFillColor(...pdfBrand.white);
    doc.roundedRect(crestX - 1.2, 4.2, crestSize + 2.4, crestSize + 2.4, 2.6, 2.6, "F");
    doc.addImage(crestDataUrl, "JPEG", crestX, 5.4, crestSize, crestSize);
  } else {
    doc.setDrawColor(255, 255, 255);
    doc.setFillColor(255, 255, 255);
    doc.circle(crestX + crestSize / 2, 14.4, crestSize / 2, "FD");
    doc.setTextColor(...pdfBrand.navy);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.text("UD", crestX + crestSize / 2, 13.7, { align: "center" });
    doc.text("OLIVA", crestX + crestSize / 2, 17.2, { align: "center" });
  }

  const quoteX = width - margin - crestSize - 121;
  const quoteWidth = 112;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(quoteX, 6.2, quoteWidth, 17.2, 3, 3, "F");
  doc.setTextColor(...pdfBrand.green);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5);
  doc.text("FRASE DEL DIA", quoteX + 4, 11);
  doc.setTextColor(...pdfBrand.ink);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const phraseLines = doc.splitTextToSize(pdfCleanText(phrase), quoteWidth - 8) as string[];
  doc.text(phraseLines.slice(0, 2), quoteX + 4, 16);
}
