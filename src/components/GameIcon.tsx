import { useState } from 'react';
import { sizedImage } from '../lib/nintendo';
import type { Game } from '../types';

const PALETTE = ['#e60012', '#0ab9e6', '#ff3c28', '#1aa34a', '#8b3cf7', '#ff8c00', '#00a7a7', '#d6249f'];

function hue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/** Square eShop-style icon with a friendly fallback for manual entries. */
export function GameIcon({
  game, size = 160, className = '',
}: { game: Pick<Game, 'title' | 'icon_url'>; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = sizedImage(game.icon_url, Math.min(1024, Math.round(size * 2)));
  if (!src || failed) {
    const initials = game.title
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 || /\d/.test(w))
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || game.title.charAt(0).toUpperCase();
    return (
      <span className={`game-icon game-icon-fallback ${className}`} style={{ background: hue(game.title) }} aria-hidden="true">
        <span style={{ fontSize: Math.max(14, size * 0.3) }}>{initials}</span>
      </span>
    );
  }
  return (
    <span className={`game-icon ${className}`}>
      <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    </span>
  );
}
