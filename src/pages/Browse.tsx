import { useState } from 'react';
import { Plus } from 'lucide-react';
import { AddGameDialog } from '../components/AddGameDialog';
import { LibraryBrowser } from '../components/LibraryBrowser';
import { PageLoader } from '../components/ui';
import { useFamily } from '../state/data';

export function Browse() {
  const family = useFamily();
  const [adding, setAdding] = useState(false);
  if (family.loading) return <PageLoader />;
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Browse</h1>
          <p className="muted">Every game in the family library. Find one you like and ask to borrow it.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={20} /> Add game
        </button>
      </header>
      <LibraryBrowser
        entries={family.entries}
        emptyText="The family library is empty — be the first to add a game!"
        emptyAction={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
            <Plus size={20} /> Add a game
          </button>
        }
      />
      <AddGameDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
