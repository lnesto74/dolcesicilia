import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BUSINESS_MEMORY_PATH = path.join(__dirname, '..', 'data', 'business-memory.md');

const MAX_MEMORY_CHARS = 12_000;

function ensureMemoryFile() {
  const dir = path.dirname(BUSINESS_MEMORY_PATH);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(BUSINESS_MEMORY_PATH)) {
    fs.writeFileSync(
      BUSINESS_MEMORY_PATH,
      '# Dolce Sicilia — Business Memory\n\n',
      'utf8',
    );
  }
}

export function readBusinessMemory() {
  ensureMemoryFile();
  const raw = fs.readFileSync(BUSINESS_MEMORY_PATH, 'utf8');
  const marker = '## Learnings';
  const idx = raw.indexOf(marker);
  const header = idx >= 0 ? raw.slice(0, idx + marker.length) : raw;
  const learnings = idx >= 0 ? raw.slice(idx + marker.length).trim() : '';
  return { raw, header, learnings, path: BUSINESS_MEMORY_PATH };
}

export function appendBusinessInsight({ text, source = 'unknown', category = 'insight' }) {
  ensureMemoryFile();
  const line = text?.trim();
  if (!line) throw new Error('Insight text is required');

  const ts = new Date().toISOString();
  const entry = `\n### ${ts} · ${source} · ${category}\n${line}\n`;
  fs.appendFileSync(BUSINESS_MEMORY_PATH, entry, 'utf8');

  const { raw } = readBusinessMemory();
  if (raw.length > MAX_MEMORY_CHARS) {
    const { header, learnings } = readBusinessMemory();
    const trimmed = learnings.slice(-(MAX_MEMORY_CHARS - header.length - 200));
    fs.writeFileSync(
      BUSINESS_MEMORY_PATH,
      `${header}\n\n${trimmed}\n`,
      'utf8',
    );
  }

  return { saved: true, at: ts, source, category };
}

export function memoryForPrompt() {
  const { raw } = readBusinessMemory();
  if (!raw.trim()) return '';
  return raw.length > 6000 ? raw.slice(-6000) : raw;
}

const BRIEF_START = '<<<DAILY_BRIEF>>>';
const BRIEF_END = '<<<END_DAILY_BRIEF>>>';

/** Parse the most recent daily brief JSON block from business-memory.md */
export function parseLatestDailyBrief() {
  const { raw } = readBusinessMemory();
  let lastStart = -1;
  let pos = 0;
  while (true) {
    const idx = raw.indexOf(BRIEF_START, pos);
    if (idx < 0) break;
    lastStart = idx;
    pos = idx + BRIEF_START.length;
  }
  if (lastStart < 0) return null;

  const endIdx = raw.indexOf(BRIEF_END, lastStart);
  if (endIdx < 0) return null;

  const jsonStr = raw.slice(lastStart + BRIEF_START.length, endIdx).trim();
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    console.warn('Daily brief JSON parse failed:', err.message);
    return null;
  }
}
