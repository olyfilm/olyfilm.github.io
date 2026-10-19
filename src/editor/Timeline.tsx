import { useApp } from '@/app/store';
import { clipDuration, totalTimelineDuration } from '@/core/edl';
import { getEntry } from '@/core/media/registry';
import type { OlyfilmProject } from '@/shared/types';

const TRACKS = ['video', 'broll', 'overlay', 'subtitles', 'music'] as const;

export function Timeline({ project }: { project: OlyfilmProject }) {
  const { playhead, setPlayhead, setPlaying } = useApp((s) => ({
    playhead: s.playhead,
    setPlayhead: s.setPlayhead,
    setPlaying: s.setPlaying,
  }));

  const timeline = project.timeline;
  const total = totalTimelineDuration(timeline) || 1;
  const pct = (t: number) => `${(t / total) * 100}%`;

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setPlaying(false);
    setPlayhead(frac * total);
  };

  return (
    <div className="timeline">
      <div className="timeline__grid">
        <div className="timeline__labels">
          {TRACKS.map((t) => (
            <span key={t} className="timeline__label">
              {t}
            </span>
          ))}
        </div>

        <div className="timeline__lanes" onClick={seekFromEvent}>
          {TRACKS.map((track) => (
            <div key={track} className="timeline__lane">
              {track === 'video' &&
                timeline.video.map((c) => (
                  <div
                    key={c.id}
                    className="chunk chunk--video"
                    style={{ left: pct(c.tlStart), width: pct(clipDuration(c)) }}
                    title={`${getEntry(c.assetId)?.file.name ?? c.assetId} · ${clipDuration(c).toFixed(1)}s`}
                  >
                    {getEntry(c.assetId)?.file.name ?? c.assetId}
                  </div>
                ))}
              {track === 'subtitles' &&
                timeline.subtitles.map((c) => (
                  <div
                    key={c.id}
                    className="chunk chunk--subtitles"
                    style={{ left: pct(c.start), width: pct(c.end - c.start) }}
                    title={c.text}
                  >
                    {c.text}
                  </div>
                ))}
              {(track === 'broll' || track === 'overlay' || track === 'music') && (
                <span className="timeline__empty">—</span>
              )}
            </div>
          ))}
          <div className="timeline__playhead" style={{ left: pct(playhead) }} />
        </div>
      </div>

      <div className="timeline__scale">
        <span>0:00</span>
        <span>{fmtTime(total)}</span>
      </div>
    </div>
  );
}

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}
