import { useMemo, useState } from 'react';
import { Camera, Plus, Search } from 'lucide-react';
import { AddGameDialog } from '../components/AddGameDialog';
import { LibraryBrowser } from '../components/LibraryBrowser';
import { PageLoader } from '../components/ui';
import { buildEntries } from '../lib/library';
import { useFamily } from '../state/data';

export function Library() {
  const family = useFamily();
  const [adding, setAdding] = useState<null | 'search' | 'scan'>(null);
  const mine = useMemo(
    () => buildEntries(family.games, family.items.filter((i) => i.owner_id === family.meId), family.loans, family.profileById, family.meId),
    [family],
  );
  const lent = family.loans.filter((l) => l.lender_id === family.meId && l.status === 'active').length;
  const myItems = family.items.filter((i) => i.owner_id === family.meId).length;

  if (family.loading) return <PageLoader />;
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>My Games</h1>
          <p className="muted">
            {myItems} game{myItems === 1 ? '' : 's'} in your library{lent ? ` · ${lent} lent out` : ''}
          </p>
        </div>
        <div className="row gap wrap">
          <button type="button" className="btn btn-secondary" onClick={() => setAdding('scan')}>
            <Camera size={20} /> <span className="hide-xs">Scan screenshot</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setAdding('search')}>
            <Plus size={20} /> Add game
          </button>
        </div>
      </header>
      <LibraryBrowser
        entries={mine}
        fixedOwner={family.meId}
        emptyText="Your library is empty"
        emptyAction={
          <div className="row gap wrap center">
            <button type="button" className="btn btn-primary" onClick={() => setAdding('search')}>
              <Search size={20} /> Search the eShop
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAdding('scan')}>
              <Camera size={20} /> Scan a screenshot
            </button>
          </div>
        }
      />
      <AddGameDialog open={adding !== null} initialTab={adding ?? 'search'} onClose={() => setAdding(null)} />
    </div>
  );
}
