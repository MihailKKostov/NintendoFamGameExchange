import { Check, Globe, Handshake, Minus, Monitor, Smartphone, Tablet, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate } from '../lib/format';
import type { GameInput } from '../types';

export function playersText(g: Pick<GameInput, 'player_count' | 'max_players' | 'multiplayer'>): string {
  if (g.max_players === 1 && !g.multiplayer) return 'Single player';
  if (g.player_count && /\d\+$/.test(g.player_count)) return `${g.player_count} players`;
  if (g.max_players && g.max_players > 1) return `Up to ${g.max_players} players`;
  if (g.player_count) return g.player_count;
  return g.multiplayer ? 'Multiplayer' : '—';
}

function YesNo({ on, label, icon }: { on: boolean | null; label: string; icon: ReactNode }) {
  return (
    <span className={`mp-chip${on ? ' on' : ''}`} title={`${label}: ${on ? 'yes' : on === false ? 'no' : 'unknown'}`}>
      {icon}
      {label}
      {on ? <Check size={14} /> : <Minus size={14} />}
    </span>
  );
}

const modeIcon: Record<string, ReactNode> = {
  'TV mode': <Monitor size={16} />,
  'Tabletop mode': <Tablet size={16} />,
  'Handheld mode': <Smartphone size={16} />,
};

export function GameFacts({ game, compact = false }: { game: GameInput; compact?: boolean }) {
  const rows: [string, ReactNode][] = [];
  if (game.platform) rows.push(['Platform', game.platform]);
  if (game.publisher) rows.push(['Publisher', game.publisher]);
  if (game.developer && game.developer !== game.publisher) rows.push(['Developer', game.developer]);
  if (game.release_date) rows.push(['Released', formatDate(game.release_date, { month: 'long' })]);
  rows.push(['Players', playersText(game)]);
  if (!compact && game.esrb_rating) rows.push(['Rating', game.esrb_rating]);

  return (
    <div className="facts">
      <dl className="facts-grid">
        {rows.map(([k, v]) => (
          <div key={k} className="fact">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {game.genres.length > 0 && (
        <div className="facts-chips">
          {game.genres.map((g) => (
            <span key={g} className="tag">
              {g}
            </span>
          ))}
        </div>
      )}
      <div className="facts-chips">
        <YesNo on={game.multiplayer} label="Multiplayer" icon={<Users size={15} />} />
        <YesNo on={game.local_multiplayer} label="Local" icon={<Users size={15} />} />
        <YesNo on={game.online_multiplayer} label="Online" icon={<Globe size={15} />} />
        <YesNo on={game.coop} label="Co-op" icon={<Handshake size={15} />} />
      </div>
      {!compact && game.play_modes.length > 0 && (
        <div className="facts-chips">
          {game.play_modes.map((m) => (
            <span key={m} className="tag tag-soft">
              {modeIcon[m]}
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
