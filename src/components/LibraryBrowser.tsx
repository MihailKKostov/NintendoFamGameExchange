import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { applyFilters, emptyFilters, facetOptions, filtersFromParams, filtersToParams, type Filters, type GameEntry } from '../lib/library';
import { useFamily } from '../state/data';
import { FilterBar } from './FilterBar';
import { GameGrid } from './GameCard';
import { EmptyState } from './ui';

/** Search + filters + grid, with the filter state kept in the URL. */
export function LibraryBrowser({
  entries, fixedOwner, emptyAction, emptyText,
}: { entries: GameEntry[]; fixedOwner?: string; emptyAction?: ReactNode; emptyText?: string }) {
  const family = useFamily();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const facets = useMemo(() => facetOptions(entries), [entries]);
  const effective = useMemo<Filters>(() => (fixedOwner ? { ...filters, owner: fixedOwner } : filters), [filters, fixedOwner]);
  const results = useMemo(() => applyFilters(entries, effective), [entries, effective]);

  const setFilters = (f: Filters) => {
    const p = filtersToParams(f);
    const tab = params.get('tab');
    if (tab) p.set('tab', tab);
    setParams(p, { replace: true });
  };

  if (!entries.length) {
    return <EmptyState icon={<SearchX size={40} />} title={emptyText ?? 'No games yet'} action={emptyAction} />;
  }

  return (
    <>
      <FilterBar
        filters={filters}
        onChange={setFilters}
        facets={facets}
        owners={family.members}
        hideOwner={!!fixedOwner}
        resultCount={results.length}
      />
      {results.length ? (
        <GameGrid entries={results} meId={family.meId} showOwners={!fixedOwner} />
      ) : (
        <EmptyState
          icon={<SearchX size={40} />}
          title="No games match"
          action={
            <button type="button" className="btn btn-secondary" onClick={() => setFilters({ ...emptyFilters, sort: filters.sort })}>
              Clear filters
            </button>
          }
        >
          Try removing a filter or searching for something else.
        </EmptyState>
      )}
    </>
  );
}
