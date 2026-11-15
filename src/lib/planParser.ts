/**
 * Reads workout plans from PDFs (PDF.js) and photos (Tesseract OCR, runs in the browser)
 * and turns the text into rows the user reviews before anything is saved.
 */
import type { Exercise } from '../types';
import { bestMatch } from './match';

export interface ParsedRow {
  raw: string;
  day: string;
  name: string;
  sets: number | null;
  reps: string;
  rest: number | null;
  exercise_id: string | null;
  /** 0–1 – how sure the name match is. */
  score: number;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const item of content.items as { str?: string; transform?: number[] }[]) {
      if (!item.str || !item.str.trim() || !item.transform) continue;
      const y = Math.round(item.transform[5] / 3);
      const row = rows.get(y) ?? [];
      row.push({ x: item.transform[4], s: item.str });
      rows.set(y, row);
    }
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, r]) => lines.push(r.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ')));
  }
  return lines.join('\n');
}

/** OCR for photos/screenshots. Downloads the language data on first use (needs internet once). */
export async function extractImageText(file: File, lang: string): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const langs = lang === 'de' ? 'eng+deu' : lang === 'hr' ? 'eng+hrv' : 'eng';
  const worker = await createWorker(langs);
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

const RE_X = /(\d{1,2})\s*[x×*]\s*(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)/i;
const RE_WORDS = /(\d{1,2})\s*(?:sets?|sätze|saetze|satz|serij[aeu]?)\b[^\d]{0,12}(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)\s*(?:reps?|wdh\.?|wiederholungen|ponavljanj[ae]|pon\.?)?/i;
const RE_TABLE = /^(.*?[a-zA-ZäöüßčćšžđÄÖÜČĆŠŽĐ)])\s+(\d{1,2})\s+(\d{1,3}(?:\s*[-–]\s*\d{1,3})?)(?:\s+(\d{1,3})\s*(s|sec|sek|min|m|")?)?\s*$/i;
const RE_REST = /(?:rest|pause|odmor)\D{0,8}(\d{1,3}(?:[.,]\d)?)\s*(s|sec|sek|sekunden|seconds|sekundi|min|minuten|minutes|minut[ae]?|m|")?/i;
const RE_REST_TAIL = /(\d{1,3})\s*(s|sec|sek|sekunden|seconds|min|minuten|")\s*(?:rest|pause|odmor)?\s*$/i;
const RE_DAY = /^(?:day|tag|dan|workout|training|trening|einheit)\s*[\dA-Da-d]\b.*$|^(?:push|pull|legs?|beine|noge|upper|lower|oberkörper|unterkörper|full\s*body|ganzkörper|gornji\s+dio|donji\s+dio|monday|tuesday|wednesday|thursday|friday|saturday|sunday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|ponedjeljak|utorak|srijeda|četvrtak|petak|subota|nedjelja)\b.{0,30}$/i;

const toSeconds = (value: string, unit: string | undefined) => {
  const n = Number(value.replace(',', '.'));
  return /^m/i.test(unit ?? '') ? Math.round(n * 60) : Math.round(n);
};
const cleanName = (s: string) => s.replace(/^[\s\-–•*·\d.)]+/, '').replace(/[\s\-–:|,;]+$/, '').trim();

export function parsePlanText(text: string, exercises: Exercise[]): ParsedRow[] {
  const rows: ParsedRow[] = [];
  let day = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (line.length < 3) continue;
    let name = '', sets: number | null = null, reps = '', rest: number | null = null;

    const restM = line.match(RE_REST);
    if (restM) rest = toSeconds(restM[1], restM[2]);
    const body = restM ? line.replace(restM[0], ' ').trim() : line;

    const x = body.match(RE_X) ?? body.match(RE_WORDS);
    if (x && x.index != null) {
      name = cleanName(body.slice(0, x.index));
      sets = Number(x[1]);
      reps = x[2].replace(/\s/g, '').replace('–', '-');
      if (rest == null) { const tail = body.slice(x.index + x[0].length).match(RE_REST_TAIL); if (tail) rest = toSeconds(tail[1], tail[2]); }
    } else {
      const t = body.match(RE_TABLE);
      if (t) {
        name = cleanName(t[1]);
        sets = Number(t[2]);
        reps = t[3].replace(/\s/g, '').replace('–', '-');
        if (rest == null && t[4]) rest = toSeconds(t[4], t[5]);
      }
    }
    if (!name || sets == null || sets < 1 || sets > 20) {
      if (RE_DAY.test(line) && line.length <= 40) day = line;
      continue;
    }
    const match = bestMatch(name, exercises, (e) => [e.name, e.names?.en, e.names?.de, e.names?.hr]);
    rows.push({ raw: line, day, name, sets, reps, rest, exercise_id: match?.item.id ?? null, score: match?.score ?? 0 });
  }
  return rows;
}
