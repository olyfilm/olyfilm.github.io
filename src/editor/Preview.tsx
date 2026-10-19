import { useEffect, useMemo, useRef } from 'react';
import { useApp } from '@/app/store';
import { drawCover, drawSubtitle } from '@/core/compositor';
import {
  activeSubtitle,
  activeVideoClip,
  clipTlEnd,
  srcTimeFor,
  totalTimelineDuration,
} from '@/core/edl';
import { getVideoEl } from '@/core/media/registry';
import type { OlyfilmProject, VideoClip } from '@/shared/types';

function seekVideo(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const dur = v.duration || t;
    const target = Math.min(Math.max(t, 0), Math.max(0, dur - 1e-3));
    if (v.readyState >= 2 && Math.abs(v.currentTime - target) < 0.03) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      v.removeEventListener('seeked', finish);
      clearTimeout(to);
      resolve();
    };
    const to = setTimeout(finish, 1500); // no colgar si el seek no dispara
    v.addEventListener('seeked', finish);
    v.currentTime = target;
  });
}

/** Espera a que el <video> tenga datos suficientes para dibujar un frame. */
function whenDrawable(v: HTMLVideoElement): Promise<void> {
  if (v.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const on = () => {
      v.removeEventListener('loadeddata', on);
      resolve();
    };
    v.addEventListener('loadeddata', on);
  });
}

export function Preview({ project }: { project: OlyfilmProject }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { playing, playhead, setPlayhead, setPlaying } = useApp((s) => ({
    playing: s.playing,
    playhead: s.playhead,
    setPlayhead: s.setPlayhead,
    setPlaying: s.setPlaying,
  }));

  const timeline = project.timeline;
  const clips = timeline.video;
  const total = useMemo(() => totalTimelineDuration(timeline), [timeline]);

  const [mw, mh] = project.meta.resolution;
  const w = 540;
  const h = Math.round((w * mh) / mw);

  const drawFrameAt = (t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const clip = activeVideoClip(timeline, t);
    if (clip) {
      const vid = getVideoEl(clip.assetId);
      if (vid.readyState >= 2) drawCover(ctx, vid, w, h);
    }
    drawSubtitle(ctx, activeSubtitle(timeline, t), w, h);
  };

  // Scrub / frame estático cuando NO se está reproduciendo.
  useEffect(() => {
    if (playing) return;
    let cancelled = false;
    (async () => {
      const clip = activeVideoClip(timeline, playhead);
      if (clip) {
        const vid = getVideoEl(clip.assetId);
        vid.muted = true;
        await whenDrawable(vid);
        await seekVideo(vid, srcTimeFor(clip, playhead));
      }
      if (!cancelled) drawFrameAt(playhead);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playhead, playing, project]);

  // Reproducción: el <video> del clip activo marca el reloj (video + audio sincronizados).
  useEffect(() => {
    if (!playing) return;
    if (clips.length === 0) {
      setPlaying(false);
      return;
    }
    let raf = 0;
    let cancelled = false;

    const pauseAll = () => {
      for (const c of clips) getVideoEl(c.assetId).pause();
    };

    const prepare = async (c: VideoClip, startT: number) => {
      const vid = getVideoEl(c.assetId);
      vid.muted = false;
      await seekVideo(vid, srcTimeFor(c, startT));
      try {
        await vid.play();
      } catch {
        /* autoplay bloqueado: el frame igual avanza por seek */
      }
      return vid;
    };

    (async () => {
      let t = useApp.getState().playhead;
      if (t >= total - 1e-3) t = 0;
      let clip = activeVideoClip(timeline, t) ?? clips[0];
      let vid = await prepare(clip, t);

      const loop = () => {
        if (cancelled) return;
        let tt = clip.tlStart + (vid.currentTime - clip.srcIn);
        if (vid.ended || tt >= clipTlEnd(clip) - 1e-3) {
          vid.pause();
          const next = clips[clips.indexOf(clip) + 1];
          if (!next) {
            setPlayhead(total);
            setPlaying(false);
            return;
          }
          clip = next;
          vid = getVideoEl(clip.assetId);
          void prepare(clip, clip.tlStart);
          tt = clip.tlStart;
        }
        setPlayhead(tt);
        drawFrameAt(tt);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      pauseAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  return (
    <div className="preview">
      <canvas ref={canvasRef} width={w} height={h} className="preview__canvas" />
    </div>
  );
}
