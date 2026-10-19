import { useApp } from '@/app/store';

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Badge fijo arriba a la derecha con el uso de tokens del proyecto (PLAN.md §7). */
export function TokenBadge() {
  const usage = useApp((s) => s.usage);
  const total = usage.totalIn + usage.totalOut;

  const tooltip = [
    `Entrada: ${usage.totalIn}`,
    `Salida: ${usage.totalOut}`,
    '—',
    `Cocinado: ${usage.byStage.cocinado}`,
    `Prompts: ${usage.byStage.prompts}`,
    `Transcripción: ${usage.byStage.transcribe}`,
  ].join('\n');

  return (
    <div className="token-badge" title={tooltip} aria-label={`Tokens usados: ${total}`}>
      <span className="token-badge__coin">🪙</span>
      <span className="token-badge__value">{fmt(total)} tok</span>
    </div>
  );
}
