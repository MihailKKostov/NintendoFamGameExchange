import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, Play } from 'lucide-react';
import type { StoreMedia } from '../lib/nintendo';

/** Trailers and screenshots from the eShop listing: a swipeable stage plus thumbnails. */
export function StoreGallery({ media, title }: { media: StoreMedia[]; title: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState<number | null>(null);
  // Full-size images load only for the current slide and its neighbours.
  const [near, setNear] = useState<Set<number>>(() => new Set([0, 1]));
  useEffect(() => {
    setNear((s) => (s.has(index - 1) && s.has(index) && s.has(index + 1) ? s : new Set([...s, index - 1, index, index + 1])));
  }, [index]);
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  // Moving away from a trailer stops it.
  useEffect(() => {
    if (playing !== null && playing !== index) setPlaying(null);
  }, [index, playing]);

  // Keep the active thumbnail in view (scrolling only the strip, never the page).
  useEffect(() => {
    const strip = thumbsRef.current;
    const thumb = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !thumb) return;
    const left = thumb.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + thumb.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: left - (strip.clientWidth - thumb.offsetWidth) / 2, behavior: 'smooth' });
    }
  }, [index]);

  const goTo = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = Math.max(0, Math.min(media.length - 1, i));
    track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
    setIndex(next);
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== index) setIndex(i);
  };

  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  };

  if (!media.length) return null;
  const videos = media.filter((m) => m.kind === 'video').length;
  const images = media.length - videos;

  return (
    <section className="panel media-panel" aria-label="Trailers and screenshots">
      <div className="section-head">
        <h2>{videos ? 'Trailers & screenshots' : 'Screenshots'}</h2>
        <span className="muted small media-summary">
          {[videos && `${videos} trailer${videos === 1 ? '' : 's'}`, images && `${images} image${images === 1 ? '' : 's'}`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>

      <div
        ref={stageRef}
        className="media-stage"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
          if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
        }}
      >
        <div ref={trackRef} className="media-track" onScroll={onScroll}>
          {media.map((m, i) => (
            <div key={m.src} className="media-slide" aria-hidden={i !== index}>
              {!near.has(i) ? null : m.kind === 'video' ? (
                playing === i ? (
                  <video poster={m.poster} controls autoPlay playsInline>
                    <source src={m.src} type="video/mp4" />
                    <source src={m.webm} type="video/webm" />
                  </video>
                ) : (
                  <button
                    type="button"
                    className="media-play"
                    onClick={() => setPlaying(i)}
                    tabIndex={i === index ? 0 : -1}
                    aria-label={`Play trailer ${media.slice(0, i + 1).filter((x) => x.kind === 'video').length} for ${title}`}
                  >
                    <img src={m.poster} alt="" draggable={false} />
                    <span className="media-play-btn">
                      <Play size={30} fill="currentColor" />
                    </span>
                  </button>
                )
              ) : (
                <img src={m.src} srcSet={`${m.small} 640w, ${m.src} 1280w`} sizes="(max-width: 700px) 100vw, 880px" alt={`${title} screenshot`} draggable={false} />
              )}
            </div>
          ))}
        </div>

        {media.length > 1 && (
          <>
            <button type="button" className="media-nav media-prev" aria-label="Previous" disabled={index === 0} onClick={() => goTo(index - 1)}>
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              className="media-nav media-next"
              aria-label="Next"
              disabled={index === media.length - 1}
              onClick={() => goTo(index + 1)}
            >
              <ChevronRight size={26} />
            </button>
          </>
        )}
        {canFullscreen && playing !== index && (
          <button type="button" className="media-full" aria-label="Full screen" onClick={fullscreen}>
            <Expand size={18} />
          </button>
        )}
        <span className="media-count">
          {index + 1} / {media.length}
        </span>
      </div>

      {media.length > 1 && (
        <div ref={thumbsRef} className="media-thumbs">
          {media.map((m, i) => (
            <button
              key={m.src}
              type="button"
              className={`media-thumb${i === index ? ' on' : ''}`}
              aria-label={`${m.kind === 'video' ? 'Trailer' : 'Screenshot'} ${i + 1}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
            >
              <img src={m.thumb} alt="" loading="lazy" draggable={false} />
              {m.kind === 'video' && (
                <span className="media-thumb-play">
                  <Play size={14} fill="currentColor" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function StoreGallerySkeleton() {
  return (
    <section className="panel media-panel" aria-busy="true" aria-label="Loading trailers and screenshots">
      <div className="section-head">
        <h2>Trailers & screenshots</h2>
      </div>
      <div className="media-stage media-skeleton" />
    </section>
  );
}
