import { useState, type ReactNode } from 'react';
import { ArrowUpDown, ChevronDown, EyeOff, Search, SlidersHorizontal, Star, ThumbsUp, X } from 'lucide-react';
import { displayName } from '../lib/format';
import { activeFilterCount, emptyFilters, sortLabels, SORTS, type FacetOptions, type Filters, type SortKey } from '../lib/library';
import { play } from '../lib/sounds';
import type { Profile } from '../types';
import { Avatar } from './Avatar';
import { Modal } from './ui';

type Toggle = 'multiplayer' | 'local' | 'online' | 'coop' | 'notMine' | 'recommended';

const RATING: { value: Filters['rating']; label: string }[] = [
  { value: '3', label: '3+ stars' },
  { value: '4', label: '4+ stars' },
  { value: '4.5', label: '4.5+ stars' },
  { value: 'unrated', label: 'Not rated yet' },
];
const AVAILABILITY: { value: Filters['availability']; label: string }[] = [
  { value: 'available', label: 'Available now' },
  { value: 'on_loan', label: 'On loan' },
];
const FORMAT: { value: Filters['format']; label: string }[] = [
  { value: 'physical', label: 'Game card' },
  { value: 'digital', label: 'Digital' },
];
const PLAYERS: { value: Filters['players']; label: string }[] = [
  { value: 'solo', label: 'Single player' },
  { value: '2', label: '2+ players' },
  { value: '4', label: '4+ players' },
];
const TOGGLE_LABELS: Record<Toggle, string> = {
  recommended: 'Recommended',
  notMine: 'Games I don’t have',
  multiplayer: 'Multiplayer',
  local: 'Local multiplayer',
  online: 'Online',
  coop: 'Co-op',
};
const labelOf = <T extends string>(list: { value: T; label: string }[], v: T) => list.find((o) => o.value === v)?.label ?? v;

function Chip({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      className={`chip${on ? ' on' : ''}`}
      aria-pressed={on}
      title={title}
      onClick={() => {
        play('tick');
        onClick();
      }}
    >
      {children}
    </button>
  );
}

/** One-of-several choice, with "Any" first. */
function Choice<T extends string>({
  label, value, options, onChange, anyLabel = 'Any',
}: { label: string; value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; anyLabel?: string }) {
  const all = [{ value: '' as T, label: anyLabel as ReactNode }, ...options];
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {all.map((o) => (
        <button
          key={o.value || 'any'}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`chip${value === o.value ? ' on' : ''}`}
          onClick={() => {
            play('tick');
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SelectFilter({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className={`select-filter${value ? ' set' : ''}`}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="filter-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** Each active filter as a removable pill. */
function activePills(f: Filters, owners: Profile[]): { key: string; label: ReactNode; clear: Partial<Filters> }[] {
  const pills: { key: string; label: ReactNode; clear: Partial<Filters> }[] = [];
  if (f.recommended) pills.push({ key: 'rec', label: <><ThumbsUp size={14} /> Recommended</>, clear: { recommended: false } });
  if (f.rating) pills.push({ key: 'rating', label: f.rating === 'unrated' ? 'Not rated yet' : <><Star size={14} fill="currentColor" strokeWidth={0} /> {f.rating}+</>, clear: { rating: '' } });
  if (f.availability) pills.push({ key: 'avail', label: labelOf(AVAILABILITY, f.availability), clear: { availability: '' } });
  if (f.notMine) pills.push({ key: 'notmine', label: TOGGLE_LABELS.notMine, clear: { notMine: false } });
  if (f.format) pills.push({ key: 'format', label: labelOf(FORMAT, f.format), clear: { format: '' } });
  if (f.players) pills.push({ key: 'players', label: labelOf(PLAYERS, f.players), clear: { players: '' } });
  for (const k of ['multiplayer', 'local', 'online', 'coop'] as const) if (f[k]) pills.push({ key: k, label: TOGGLE_LABELS[k], clear: { [k]: false } });
  for (const g of f.genres) pills.push({ key: 'genre-' + g, label: g, clear: { genres: f.genres.filter((x) => x !== g) } });
  if (f.owner) {
    const o = owners.find((x) => x.id === f.owner);
    pills.push({ key: 'owner', label: `Owner: ${o ? displayName(o) : 'someone'}`, clear: { owner: '' } });
  }
  if (f.platform) pills.push({ key: 'platform', label: f.platform, clear: { platform: '' } });
  if (f.publisher) pills.push({ key: 'publisher', label: `Publisher: ${f.publisher}`, clear: { publisher: '' } });
  if (f.developer) pills.push({ key: 'developer', label: `Developer: ${f.developer}`, clear: { developer: '' } });
  if (f.year) pills.push({ key: 'year', label: `Released ${f.year}`, clear: { year: '' } });
  return pills;
}

export function FilterBar({
  filters, onChange, facets, owners, hideOwner = false, showNotMine = true, resultCount, totalCount,
  placeholder = 'Search games, publishers, people…',
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  facets: FacetOptions;
  owners: Profile[];
  hideOwner?: boolean;
  /** Offer the "Games I don't have" filter (not on your own library). */
  showNotMine?: boolean;
  resultCount: number;
  totalCount: number;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const flip = (k: Toggle) => set({ [k]: !filters[k] });
  const count = activeFilterCount(filters) - (hideOwner && filters.owner ? 1 : 0);
  const pills = activePills(hideOwner ? { ...filters, owner: '' } : filters, owners);
  const clearAll = () => onChange({ ...emptyFilters, sort: filters.sort, q: filters.q });
  const games = (n: number) => `${n} game${n === 1 ? '' : 's'}`;

  return (
    <div className="filterbar">
      <div className="filterbar-top">
        <div className="search-input">
          <Search size={20} aria-hidden="true" />
          <input type="search" placeholder={placeholder} aria-label="Search" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
          {filters.q && (
            <button type="button" className="icon-btn icon-btn-sm" aria-label="Clear search" onClick={() => set({ q: '' })}>
              <X size={18} />
            </button>
          )}
        </div>
        <button type="button" className={`btn btn-secondary filter-toggle${count ? ' on' : ''}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <SlidersHorizontal size={18} />
          Filters
          {count > 0 && <span className="count">{count}</span>}
        </button>
        <label className="sort-select">
          <ArrowUpDown size={16} aria-hidden="true" className="sort-icon" />
          <span className="visually-hidden">Sort by</span>
          <select value={filters.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {sortLabels[s]}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
      </div>

      <div className="quick-chips" role="group" aria-label="Quick filters">
        <Chip on={filters.availability === 'available'} onClick={() => set({ availability: filters.availability === 'available' ? '' : 'available' })}>
          <i className="dot dot-green" /> Available now
        </Chip>
        <Chip on={filters.recommended} onClick={() => flip('recommended')} title="Games someone in the family recommends">
          <ThumbsUp size={15} /> Recommended
        </Chip>
        <Chip on={filters.rating === '4'} onClick={() => set({ rating: filters.rating === '4' ? '' : '4' })} title="Family rating of 4 stars or more">
          <Star size={15} fill="currentColor" strokeWidth={0} className="chip-star" /> 4+ stars
        </Chip>
        {showNotMine && (
          <Chip on={filters.notMine} onClick={() => flip('notMine')} title="Hide games you already own">
            <EyeOff size={15} /> Games I don’t have
          </Chip>
        )}
        <Chip on={filters.multiplayer} onClick={() => flip('multiplayer')}>
          Multiplayer
        </Chip>
        <Chip on={filters.coop} onClick={() => flip('coop')}>
          Co-op
        </Chip>
      </div>

      <div className="filterbar-foot">
        <span className="muted small" aria-live="polite">
          {resultCount === totalCount ? games(totalCount) : `${resultCount} of ${games(totalCount)}`}
        </span>
        {pills.length > 0 && (
          <div className="active-filters" aria-label="Active filters">
            {pills.map((p) => (
              <button
                key={p.key}
                type="button"
                className="active-pill"
                aria-label={`Remove filter: ${typeof p.label === 'string' ? p.label : p.key}`}
                onClick={() => {
                  play('back');
                  set(p.clear);
                }}
              >
                {p.label}
                <X size={14} />
              </button>
            ))}
            {pills.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Filters"
        size="lg"
        className="filter-sheet"
        focusField={false}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={clearAll} disabled={!count}>
              Clear all
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
              Show {games(resultCount)}
            </button>
          </>
        }
      >
        <Section title="Rating">
          <Choice label="Family rating" value={filters.rating} options={RATING} onChange={(v) => set({ rating: v })} />
          <div className="chips">
            <Chip on={filters.recommended} onClick={() => flip('recommended')}>
              <ThumbsUp size={15} /> Recommended by someone in the family
            </Chip>
          </div>
        </Section>

        <Section title="Availability">
          <Choice label="Availability" value={filters.availability} options={AVAILABILITY} onChange={(v) => set({ availability: v })} />
          <Choice label="Format" value={filters.format} options={FORMAT} onChange={(v) => set({ format: v })} anyLabel="Any format" />
          {showNotMine && (
            <div className="chips">
              <Chip on={filters.notMine} onClick={() => flip('notMine')}>
                <EyeOff size={15} /> Games I don’t have
              </Chip>
            </div>
          )}
        </Section>

        <Section title="Players">
          <Choice label="Number of players" value={filters.players} options={PLAYERS} onChange={(v) => set({ players: v })} />
          <div className="chips">
            {(['multiplayer', 'local', 'online', 'coop'] as const).map((k) => (
              <Chip key={k} on={filters[k]} onClick={() => flip(k)}>
                {TOGGLE_LABELS[k]}
              </Chip>
            ))}
          </div>
        </Section>

        {facets.genres.length > 0 && (
          <Section title="Genre">
            <div className="chips">
              {facets.genres.map((g) => {
                const on = filters.genres.includes(g);
                return (
                  <Chip key={g} on={on} onClick={() => set({ genres: on ? filters.genres.filter((x) => x !== g) : [...filters.genres, g] })}>
                    {g}
                  </Chip>
                );
              })}
            </div>
          </Section>
        )}

        {!hideOwner && owners.length > 1 && (
          <Section title="Owner">
            <Choice
              label="Owner"
              value={filters.owner}
              anyLabel="Anyone"
              onChange={(v) => set({ owner: v })}
              options={owners.map((o) => ({
                value: o.id,
                label: (
                  <>
                    <Avatar profile={o} size={22} ring={false} /> {displayName(o)}
                  </>
                ),
              }))}
            />
          </Section>
        )}

        <Section title="More details">
          <div className="filter-selects">
            <SelectFilter label="Platform" value={filters.platform} onChange={(v) => set({ platform: v })} options={facets.platforms} />
            <SelectFilter label="Publisher" value={filters.publisher} onChange={(v) => set({ publisher: v })} options={facets.publishers} />
            <SelectFilter label="Developer" value={filters.developer} onChange={(v) => set({ developer: v })} options={facets.developers} />
            <SelectFilter label="Release year" value={filters.year} onChange={(v) => set({ year: v })} options={facets.years} />
          </div>
        </Section>
      </Modal>
    </div>
  );
}
