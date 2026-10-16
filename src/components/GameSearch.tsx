import { useEffect, useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cleanTitle, iconFromHit, searchCatalog, type CatalogHit } from '../lib/nintendo';
import { play } from '../lib/sounds';
import { GameIcon } from './GameIcon';
import { Spinner } from './ui';

/** Autocomplete over the Nintendo eShop catalog. */
export function GameSearch({
  onSelect, onManual, autoFocus,
}: { onSelect: (hit: CatalogHit) => void; onManual?: (title: string) => void; autoFocus?: boolean }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchCatalog(q, 8, ctrl.signal);
        setHits(res);
        setActive(0);
        setError('');
        setOpen(true);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError('The Nintendo catalog is not responding. You can add the game manually.');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const choose = (hit: CatalogHit) => {
    play('select');
    setOpen(false);
    onSelect(hit);
  };

  return (
    <div className="search-ac">
      <div className="search-input big">
        <Search size={22} aria-hidden="true" />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          type="search"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
          placeholder="Search the Nintendo eShop… e.g. Mario Kart"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!hits.length) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1) % hits.length);
              play('tick');
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a - 1 + hits.length) % hits.length);
              play('tick');
            } else if (e.key === 'Enter' && open) {
              e.preventDefault();
              choose(hits[active]);
            }
          }}
        />
        {loading ? (
          <Spinner size={20} />
        ) : query ? (
          <button
            type="button"
            className="icon-btn icon-btn-sm"
            aria-label="Clear"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        ) : null}
      </div>

      {error && <p className="field-error">{error}</p>}

      {open && query.trim().length >= 2 && !loading && (
        <ul className="ac-list" id={listId} role="listbox">
          {hits.map((h, i) => (
            <li
              key={h.objectID}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`ac-item${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h);
              }}
            >
              <GameIcon game={{ title: h.title, icon_url: iconFromHit(h) }} size={52} />
              <span className="ac-text">
                <span className="ac-title">{cleanTitle(h.title)}</span>
                <span className="ac-meta">
                  {[h.platform, h.releaseDate?.slice(0, 4), h.softwarePublisher].filter(Boolean).join(' · ')}
                </span>
              </span>
            </li>
          ))}
          {hits.length === 0 && <li className="ac-empty">No games found for “{query.trim()}”.</li>}
          {onManual && (
            <li
              className="ac-manual"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                onManual(query.trim());
              }}
            >
              Can’t find it? <b>Add “{query.trim()}” manually</b>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
