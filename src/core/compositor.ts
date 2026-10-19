// Dibujo de un frame 9:16: recorte "cover" del clip + subtítulos quemados.
// Lo usan IDÉNTICAMENTE el preview en vivo (editor) y el render final (export),
// así lo que ves es lo que se exporta (WYSIWYG).

export function drawCover(
  ctx: CanvasRenderingContext2D,
  el: HTMLVideoElement,
  w: number,
  h: number,
): void {
  const vw = el.videoWidth || w;
  const vh = el.videoHeight || h;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(el, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

// ---------- estilos de subtítulos ----------

export interface SubtitleStyle {
  name: string;
  label: string;
  fontScale: number; // tamaño relativo al alto
  centerY: number; // posición vertical del bloque (fracción del alto, 0=arriba)
  textColor: string;
  strokeColor: string;
  box: string | null; // color de caja de fondo, o null
  weight: number;
  uppercase: boolean;
}

export const SUBTITLE_STYLES: Record<string, SubtitleStyle> = {
  default: {
    name: 'default', label: 'Clásico', fontScale: 0.036, centerY: 0.82,
    textColor: '#ffffff', strokeColor: 'rgba(0,0,0,0.85)', box: null, weight: 600, uppercase: false,
  },
  boxed: {
    name: 'boxed', label: 'Caja', fontScale: 0.034, centerY: 0.84,
    textColor: '#ffffff', strokeColor: 'rgba(0,0,0,0)', box: 'rgba(0,0,0,0.6)', weight: 600, uppercase: false,
  },
  yellow: {
    name: 'yellow', label: 'Amarillo', fontScale: 0.04, centerY: 0.8,
    textColor: '#ffd400', strokeColor: 'rgba(0,0,0,0.9)', box: null, weight: 800, uppercase: true,
  },
  center: {
    name: 'center', label: 'Centrado', fontScale: 0.046, centerY: 0.5,
    textColor: '#ffffff', strokeColor: 'rgba(0,0,0,0.85)', box: null, weight: 700, uppercase: false,
  },
};

export function resolveSubtitleStyle(name: string | undefined): SubtitleStyle {
  return SUBTITLE_STYLES[name ?? 'default'] ?? SUBTITLE_STYLES.default;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number,
  style: SubtitleStyle = SUBTITLE_STYLES.default,
): void {
  if (!text) return;
  const shown = style.uppercase ? text.toUpperCase() : text;
  const fontSize = Math.round(h * style.fontScale);
  ctx.font = `${style.weight} ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const maxWidth = w * 0.86;
  const lines = wrapLines(ctx, shown, maxWidth);
  const lineH = fontSize * 1.25;
  const blockH = lines.length * lineH;
  const top = h * style.centerY - blockH / 2;

  // caja de fondo opcional
  if (style.box) {
    const pad = fontSize * 0.4;
    let boxW = 0;
    for (const l of lines) boxW = Math.max(boxW, ctx.measureText(l).width);
    boxW = Math.min(boxW + pad * 2, w * 0.94);
    ctx.fillStyle = style.box;
    roundRect(ctx, (w - boxW) / 2, top - pad * 0.5, boxW, blockH + pad, fontSize * 0.25);
    ctx.fill();
  }

  ctx.lineWidth = Math.max(3, fontSize * 0.14);
  ctx.strokeStyle = style.strokeColor;
  ctx.fillStyle = style.textColor;
  ctx.lineJoin = 'round';
  let y = top + fontSize;
  for (const l of lines) {
    if (style.strokeColor !== 'rgba(0,0,0,0)') ctx.strokeText(l, w / 2, y);
    ctx.fillText(l, w / 2, y);
    y += lineH;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
