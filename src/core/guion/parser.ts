import type { Guion, GuionBlock } from '@/shared/types';

/**
 * Parsea el guion en Markdown que produce el skill de guiones.
 * Extrae la tabla "Guion por tiempos" de forma determinística (sin IA).
 * El resto de la inteligencia (matching con material, B-roll) queda para core/ai.
 */
export function parseGuion(rawMarkdown: string): Guion {
  const blocks = parseTimedTable(rawMarkdown);
  return { rawMarkdown, blocks };
}

/** Convierte "0–2 s" / "35-40 s" en [start, end] en segundos. */
function parseTimeRange(cell: string): [number, number] | null {
  const m = cell.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

function splitRow(line: string): string[] {
  // fila markdown tipo: | a | b | c |
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function parseTimedTable(md: string): GuionBlock[] {
  const lines = md.split(/\r?\n/);
  const blocks: GuionBlock[] = [];
  let inTable = false;
  let headerSeen = false;
  let i = 0;

  for (const line of lines) {
    if (!line.trim().startsWith('|')) {
      if (inTable) break; // la tabla terminó
      continue;
    }
    const cells = splitRow(line);

    // Detectar la tabla por su encabezado (columna "Tiempo").
    if (!inTable) {
      if (/tiempo/i.test(cells[0] ?? '')) {
        inTable = true;
        headerSeen = true;
      }
      continue;
    }
    if (headerSeen && isSeparatorRow(cells)) continue;
    if (cells.length < 5) continue;

    const range = parseTimeRange(cells[0]);
    if (!range) continue;

    blocks.push({
      id: `b${i++}`,
      tStart: range[0],
      tEnd: range[1],
      estructura: cells[1] ?? '',
      locucion: cells[2] ?? '',
      textoPantalla: cells[3] ?? '',
      corte: cells[4] ?? '',
      imagenEdicion: cells[4] ?? '',
    });
  }

  return blocks;
}
