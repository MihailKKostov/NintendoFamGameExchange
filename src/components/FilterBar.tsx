import { useState } from 'react';
import { ChevronDown, EyeOff, Search, SlidersHorizontal, X } from 'lucide-react';
import { displayName } from '../lib/format';
import { activeFilterCount, emptyFilters, type FacetOptions, type Filters } from '../lib/library';
import { play } from '../lib/sounds';
import type { Profile } from '../types';

function SelectFilter({
  label, value, onChange, options, anyLabel = 'Any',
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; anyLabel?: string }) {
  return (
    <label className={`select-filter${value ? ' set' : ''}`}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{anyLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </label>
  );
}

export function FilterBar({
  filters, onChange, facets, owners, hideOwner = false, showNotMine = true, resultCount, placeholder = 'Search games, publishers, people…',
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  facets: FacetOptions;
  owners: Profile[];
  hideOwner?: boolean;
  /** Offer the "Games I don't have" filter (not on your own library). */
  showNotMine?: boolean;
  resultCount: number;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(() => activeFilterCount(filters) > 0 && window.innerWidth > 900);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  const toggle = (k: 'multiplayer' | 'local' | 'online' | 'coop' | 'notMine') => {
    play('tick');
    set(k, !filters[k]);
  };
  const count = activeFilterCount(filters);
  const opts = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

  return (
    <div className="filterbar">
      <div className="filterbar-top">
        <div className="search-input">
          <Search size={20} aria-hidden="true" />
          <input
            type="search"
            placeholder={placeholder}
            aria-label="Search"
            value={filters.q}
            onChange={(e) => set('q', e.target.value)}
          />
          {filters.q && (
            <button type="button" className="icon-btn icon-btn-sm" aria-label="Clear search" onClick={() => set('q', '')}>
              <X size={18} />
            </button>
          )}
        </div>
        <button
          type="button"
          className={`btn btn-secondary filter-toggle${open ? ' on' : ''}`}
          aria-expanded={open}
          onClick={() => {
            play(open ? 'back' : 'pop');
            setOpen(!open);
          }}
        >
          <SlidersHorizontal size={18} />
          <span className="hide-xs">Filters</span>
          {count > 0 && <span className="count">{count}</span>}
        </button>
        <label className="sort-select">
          <span className="visually-hidden">Sort by</span>
          <select value={filters.sort} onChange={(e) => set('sort', e.target.value as Filters['sort'])}>
            <option value="recent">Recently added</option>
            <option value="title">Name A–Z</option>
            <option value="release_new">Newest releases</option>
            <option value="release_old">Oldest releases</option>
            <option value="popular">Most copies</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" />
        </label>
      </div>

      <div className="quick-chips" role="group" aria-label="Quick filters">
        <button
          type="button"
          className={`chip${filters.availability === 'available' ? ' on' : ''}`}
          aria-pressed={filters.availability === 'available'}
          onClick={() => {
            play('tick');
            set('availability', filters.availability === 'available' ? '' : 'available');
          }}
        >
          <i className="dot dot-green" /> Available now
        </button>
        {showNotMine && (
          <button
            type="button"
            className={`chip${filters.notMine ? ' on' : ''}`}
            aria-pressed={filters.notMine}
            title="Hide games you already own"
            onClick={() => toggle('notMine')}
          >
            <EyeOff size={15} /> Games I don’t have
          </button>
        )}
        <button type="button" className={`chip${filters.multiplayer ? ' on' : ''}`} aria-pressed={filters.multiplayer} onClick={() => toggle('multiplayer')}>
          Multiplayer
        </button>
        <button type="button" className={`chip${filters.local ? ' on' : ''}`} aria-pressed={filters.local} onClick={() => toggle('local')}>
          Local multiplayer
        </button>
        <button type="button" className={`chip${filters.online ? ' on' : ''}`} aria-pressed={filters.online} onClick={() => toggle('online')}>
          Online
        </button>
        <button type="button" className={`chip${filters.coop ? ' on' : ''}`} aria-pressed={filters.coop} onClick={() => toggle('coop')}>
          Co-op
        </button>
        <button
          type="button"
          className={`chip${filters.players === '4' ? ' on' : ''}`}
          aria-pressed={filters.players === '4'}
          onClick={() => {
            play('tick');
            set('players', filters.players === '4' ? '' : '4');
          }}
        >
          4+ players
        </button>
      </div>

      {open && (
        <div className="filter-panel">
          {facets.genres.length > 0 && (
            <div className="filter-group">
              <span className="filter-label">Genre</span>
              <div className="chips">
                {facets.genres.map((g) => {
                  const on = filters.genres.includes(g);
                  return (
                    <button
                      key={g}
                      type="button"
                      className={`chip${on ? ' on' : ''}`}
                      aria-pressed={on}
                      onClick={() => {
                        play('tick');
                        set('genres', on ? filters.genres.filter((x) => x !== g) : [...filters.genres, g]);
                      }}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="filter-selects">
            {!hideOwner && (
              <SelectFilter
                label="Owner"
                value={filters.owner}
                onChange={(v) => set('owner', v)}
                anyLabel="Anyone"
                options={owners.map((o) => ({ value: o.id, label: displayName(o) }))}
              />
            )}
            <SelectFilter label="Platform" value={filters.platform} onChange={(v) => set('platform', v)} options={opts(facets.platforms)} />
            <SelectFilter label="Publisher" value={filters.publisher} onChange={(v) => set('publisher', v)} options={opts(facets.publishers)} />
            <SelectFilter label="Developer" value={filters.developer} onChange={(v) => set('developer', v)} options={opts(facets.developers)} />
            <SelectFilter label="Release year" value={filters.year} onChange={(v) => set('year', v)} options={opts(facets.years)} />
            <SelectFilter
              label="Players"
              value={filters.players}
              onChange={(v) => set('players', v as Filters['players'])}
              options={[
                { value: 'solo', label: 'Single player only' },
                { value: '2', label: '2+ players' },
                { value: '4', label: '4+ players' },
              ]}
            />
            <SelectFilter
              label="Availability"
              value={filters.availability}
              onChange={(v) => set('availability', v as Filters['availability'])}
              options={[
                { value: 'available', label: 'Available now' },
                { value: 'on_loan', label: 'Currently on loan' },
              ]}
            />
            <SelectFilter
              label="Format"
              value={filters.format}
              onChange={(v) => set('format', v as Filters['format'])}
              options={[
                { value: 'physical', label: 'Game card' },
                { value: 'digital', label: 'Digital' },
              ]}
            />
          </div>
        </div>
      )}

      <div className="filterbar-foot">
        <span className="muted small" aria-live="polite">
          {resultCount} game{resultCount === 1 ? '' : 's'}
        </span>
        {(count > 0 || filters.q) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...emptyFilters, sort: filters.sort })}>
            <X size={14} /> Clear all
          </button>
        )}
      </div>
    </div>
  );
}
