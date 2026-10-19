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

export function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number,
): void {
  if (!text) return;
  const fontSize = Math.round(h * 0.036);
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  // word-wrap a ~86% del ancho
  const maxWidth = w * 0.86;
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

  const lineH = fontSize * 1.25;
  // subtítulos lejos de los controles de plataforma (≈18% desde abajo)
  let y = h - h * 0.18 - (lines.length - 1) * lineH;
  ctx.lineWidth = Math.max(3, fontSize * 0.14);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.fillStyle = '#fff';
  for (const l of lines) {
    ctx.strokeText(l, w / 2, y + lineH);
    ctx.fillText(l, w / 2, y + lineH);
    y += lineH;
  }
}
