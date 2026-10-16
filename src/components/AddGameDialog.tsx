import { useEffect, useRef, useState } from 'react';
import { Camera, CircleCheck, ClipboardPaste, ImagePlus, PenLine, RefreshCw, Search, Sparkles } from 'lucide-react';
import { api } from '../api';
import { config } from '../config';
import { screenshotDataUrl } from '../lib/image';
import { recognizeWithOpenAi } from '../lib/openai';
import { cleanTitle, hitToGame, matchTitle, type CatalogHit } from '../lib/nintendo';
import { play } from '../lib/sounds';
import { useAction, useFamily } from '../state/data';
import { useToast } from '../state/toast';
import type { DetectedGame, GameCondition, GameFormat, GameInput } from '../types';
import { GameFacts } from './GameFacts';
import { GameIcon } from './GameIcon';
import { GameSearch } from './GameSearch';
import { OpenAiKeyPanel, useOpenAiKey } from './OpenAiKeyPanel';
import { Field, Modal, Segmented, Spinner } from './ui';

type Tab = 'search' | 'scan' | 'manual';

const CONDITIONS: { value: GameCondition | ''; label: string }[] = [
  { value: '', label: '—' },
  { value: 'mint', label: 'Like new' },
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'worn', label: 'Well loved' },
];

function CopyOptions({
  format, setFormat, condition, setCondition, notes, setNotes,
}: {
  format: GameFormat; setFormat: (f: GameFormat) => void;
  condition: GameCondition | ''; setCondition: (c: GameCondition | '') => void;
  notes: string; setNotes: (n: string) => void;
}) {
  return (
    <div className="copy-options">
      <Field label="Format">
        <Segmented
          label="Format"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'physical', label: 'Game card' },
            { value: 'digital', label: 'Digital' },
          ]}
        />
      </Field>
      {format === 'physical' && (
        <Field label="Condition">
          <select className="input" value={condition} onChange={(e) => setCondition(e.target.value as GameCondition | '')}>
            {CONDITIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Notes for borrowers" hint="Optional — e.g. “includes the map”, “save file on slot 2”.">
        <input className="input" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to know?" />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SearchTab({ onPicked, onManual }: { onPicked: (g: GameInput) => void; onManual: (title: string) => void }) {
  return (
    <div className="tab-pane">
      <GameSearch autoFocus onSelect={(hit) => onPicked(hitToGame(hit))} onManual={onManual} />
      <p className="muted small center">
        Icons and details come from the Nintendo eShop catalog.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface ScanRow {
  detected: DetectedGame;
  candidates: CatalogHit[];
  choice: number; // index into candidates, -1 = skip
}

/** Demo mode without a key: pretend we recognised a few games. */
async function simulatedScan(): Promise<DetectedGame[]> {
  await new Promise((r) => setTimeout(r, 1600));
  return [
    { title: 'Mario Kart 8 Deluxe', platform: 'Nintendo Switch', confidence: 0.97 },
    { title: 'Celeste', platform: 'Nintendo Switch', confidence: 0.88 },
    { title: 'Super Mario Party Jamboree', platform: 'Nintendo Switch', confidence: 0.81 },
  ];
}

function ScanTab({ onDone }: { onDone: () => void }) {
  const family = useFamily();
  const key = useOpenAiKey();
  const toast = useToast();
  const { run, busy } = useAction();
  const [image, setImage] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'matching' | 'results'>('idle');
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [format, setFormat] = useState<GameFormat>('physical');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const myNsuids = new Set(
    family.items.filter((i) => i.owner_id === family.meId).map((i) => family.gameById.get(i.game_id)?.nsuid).filter(Boolean),
  );

  const takeFile = async (file: File | Blob | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image (PNG, JPG or WebP).');
      return;
    }
    try {
      setImage(await screenshotDataUrl(file));
      setRows([]);
      setPhase('idle');
      play('select');
    } catch (e) {
      toast.error(e);
    }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        void takeFile(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scan = async () => {
    if (!image) return;
    setPhase('scanning');
    try {
      const detected: DetectedGame[] = key
        ? await recognizeWithOpenAi(image)
        : await simulatedScan();
      setPhase('matching');
      const matched = await Promise.all(
        detected.map(async (d) => {
          const candidates = await matchTitle(d.title, d.platform).catch(() => []);
          return { detected: d, candidates, choice: candidates.length ? 0 : -1 };
        }),
      );
      setRows(matched);
      setPhase('results');
      play(matched.length ? 'success' : 'error');
    } catch (e) {
      toast.error(e);
      setPhase('idle');
    }
  };

  const chosen = rows.filter((r) => r.choice >= 0);

  const addAll = async () => {
    const res = await run(
      async () => {
        for (const r of chosen) await api.addToLibrary(hitToGame(r.candidates[r.choice]), { format });
      },
      { success: `Added ${chosen.length} game${chosen.length === 1 ? '' : 's'} to your library!` },
    );
    if (res.ok) onDone();
  };

  if (phase === 'results') {
    return (
      <div className="tab-pane">
        <div className="scan-head">
          <img src={image!} alt="Your screenshot" className="scan-thumb" />
          <div>
            <h3>
              {rows.length ? `Found ${rows.length} game${rows.length === 1 ? '' : 's'}` : 'No games found'}
            </h3>
            <p className="muted small">
              {rows.length ? 'Check the matches, untick anything that’s wrong, then add them.' : 'Try a clearer screenshot, or search by name instead.'}
            </p>
          </div>
        </div>
        <ul className="scan-list">
          {rows.map((r, idx) => {
            const hit = r.candidates[r.choice];
            const owned = hit && myNsuids.has(hit.nsuid ?? hit.objectID);
            return (
              <li key={idx} className={`scan-row${r.choice < 0 ? ' skipped' : ''}`}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={r.choice >= 0}
                    disabled={!r.candidates.length}
                    onChange={(e) =>
                      setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, choice: e.target.checked ? 0 : -1 } : x)))
                    }
                  />
                  <span className="check-box" />
                </label>
                {hit ? (
                  <GameIcon game={{ title: hit.title, icon_url: hitToGame(hit).icon_url }} size={56} />
                ) : (
                  <GameIcon game={{ title: r.detected.title, icon_url: null }} size={56} />
                )}
                <div className="scan-row-main">
                  {r.candidates.length > 1 ? (
                    <select
                      className="input input-sm"
                      value={Math.max(0, r.choice)}
                      onChange={(e) => setRows((rs) => rs.map((x, i) => (i === idx ? { ...x, choice: Number(e.target.value) } : x)))}
                    >
                      {r.candidates.map((c, ci) => (
                        <option key={c.objectID} value={ci}>
                          {cleanTitle(c.title)} ({c.platform?.replace('Nintendo ', '')})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <b>{hit ? cleanTitle(hit.title) : r.detected.title}</b>
                  )}
                  <span className="muted small">
                    Saw “{r.detected.title}” · {Math.round(r.detected.confidence * 100)}% sure
                    {!r.candidates.length && ' · not found in the eShop'}
                    {owned && ' · already in your library'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {rows.length > 0 && (
          <Field label="Format for these games">
            <Segmented
              label="Format"
              value={format}
              onChange={setFormat}
              options={[
                { value: 'physical', label: 'Game card' },
                { value: 'digital', label: 'Digital' },
              ]}
            />
          </Field>
        )}
        <div className="row gap end wrap">
          <button type="button" className="btn btn-secondary" onClick={() => { setImage(null); setPhase('idle'); setRows([]); }}>
            <RefreshCw size={18} /> Scan another
          </button>
          {rows.length > 0 && (
            <button type="button" className="btn btn-primary" disabled={!chosen.length || busy} onClick={addAll}>
              {busy ? <Spinner size={18} /> : <CircleCheck size={18} />} Add {chosen.length} game{chosen.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!key && !config.demo) {
    return (
      <div className="tab-pane">
        <div className="scan-setup">
          <span className="dropzone-icon">
            <Sparkles size={30} />
          </span>
          <h3>Scan screenshots with AI</h3>
          <p className="muted">Snap your console’s game list or a shelf of cases, and we’ll find the games for you. This uses your own OpenAI API key.</p>
        </div>
        <OpenAiKeyPanel compact />
      </div>
    );
  }

  return (
    <div className="tab-pane">
      {!key && <OpenAiKeyPanel compact />}
      {image ? (
        <div className="scan-preview">
          <img src={image} alt="Your screenshot" />
          {phase !== 'idle' && (
            <div className="scan-overlay">
              <div className="scan-beam" />
              <Spinner size={42} />
              <span>{phase === 'scanning' ? 'Looking for games…' : 'Matching with the eShop…'}</span>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className={`dropzone${dragging ? ' dragging' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void takeFile(e.dataTransfer.files[0]);
          }}
        >
          <span className="dropzone-icon">
            <ImagePlus size={34} />
          </span>
          <b>Drop a screenshot or photo here</b>
          <span className="muted small">
            Your console’s home screen or game list, a photo of your shelf of game cases… <br />
            <ClipboardPaste size={13} /> You can also paste an image.
          </span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void takeFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className="row gap end wrap">
        <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={phase !== 'idle'}>
          <Camera size={18} /> {image ? 'Choose another' : 'Choose image'}
        </button>
        <button type="button" className="btn btn-primary" onClick={scan} disabled={!image || phase !== 'idle'}>
          <Sparkles size={18} /> Scan for games
        </button>
      </div>
      <p className="muted small center">
        {key
          ? 'Your image goes straight from this browser to OpenAI with your own key — nothing is stored.'
          : 'Demo mode: this is a simulated scan. Add your OpenAI key above for real recognition.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

const GENRES = ['Action', 'Adventure', 'Fighting', 'Music', 'Party', 'Platformer', 'Puzzle', 'Racing', 'Role playing', 'Shooting', 'Simulation', 'Sports', 'Strategy'];

function ManualTab({ initialTitle, onPicked }: { initialTitle: string; onPicked: (g: GameInput) => void }) {
  const [title, setTitle] = useState(initialTitle);
  const [platform, setPlatform] = useState('Nintendo Switch');
  const [publisher, setPublisher] = useState('');
  const [developer, setDeveloper] = useState('');
  const [year, setYear] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [maxPlayers, setMaxPlayers] = useState('1');
  const [local, setLocal] = useState(false);
  const [online, setOnline] = useState(false);
  const [coop, setCoop] = useState(false);
  const [icon, setIcon] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const players = Math.max(1, Math.min(100, Number(maxPlayers) || 1));
    onPicked({
      nsuid: null,
      title: title.trim(),
      icon_url: /^https:\/\//.test(icon.trim()) ? icon.trim() : null,
      hero_url: null,
      platform,
      publisher: publisher.trim() || null,
      developer: developer.trim() || null,
      release_date: /^\d{4}$/.test(year) ? `${year}-01-01` : null,
      genres,
      player_count: players === 1 ? 'Single player' : `${players}+`,
      max_players: players,
      multiplayer: players > 1 || local || online,
      local_multiplayer: local,
      online_multiplayer: online,
      coop,
      play_modes: [],
      features: [],
      ways_to_play: [],
      esrb_rating: null,
      description: null,
      store_url: null,
    });
  };

  return (
    <form className="tab-pane manual-form" onSubmit={submit}>
      <Field label="Game title *">
        <input className="input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      <div className="grid-2">
        <Field label="Platform">
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option>Nintendo Switch</option>
            <option>Nintendo Switch 2</option>
            <option>Nintendo 3DS</option>
            <option>Wii U</option>
            <option>Other</option>
          </select>
        </Field>
        <Field label="Release year">
          <input className="input" inputMode="numeric" pattern="\d{4}" placeholder="2024" value={year} onChange={(e) => setYear(e.target.value.slice(0, 4))} />
        </Field>
        <Field label="Publisher">
          <input className="input" value={publisher} onChange={(e) => setPublisher(e.target.value)} />
        </Field>
        <Field label="Developer">
          <input className="input" value={developer} onChange={(e) => setDeveloper(e.target.value)} />
        </Field>
      </div>
      <Field label="Genres">
        <div className="chips">
          {GENRES.map((g) => (
            <button
              key={g}
              type="button"
              className={`chip${genres.includes(g) ? ' on' : ''}`}
              aria-pressed={genres.includes(g)}
              onClick={() => setGenres((gs) => (gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g]))}
            >
              {g}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid-2">
        <Field label="Max players">
          <input className="input" type="number" min={1} max={100} value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} />
        </Field>
        <Field label="Multiplayer">
          <div className="chips">
            <button type="button" className={`chip${local ? ' on' : ''}`} aria-pressed={local} onClick={() => setLocal(!local)}>Local</button>
            <button type="button" className={`chip${online ? ' on' : ''}`} aria-pressed={online} onClick={() => setOnline(!online)}>Online</button>
            <button type="button" className={`chip${coop ? ' on' : ''}`} aria-pressed={coop} onClick={() => setCoop(!coop)}>Co-op</button>
          </div>
        </Field>
      </div>
      <Field label="Icon image URL" hint="Optional — paste an https:// link to a square image.">
        <input className="input" type="url" placeholder="https://…" value={icon} onChange={(e) => setIcon(e.target.value)} />
      </Field>
      <div className="row end">
        <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
          Continue
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

export function AddGameDialog({ open, onClose, initialTab = 'search' }: { open: boolean; onClose: () => void; initialTab?: Tab }) {
  const family = useFamily();
  const { run, busy } = useAction();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [picked, setPicked] = useState<GameInput | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [format, setFormat] = useState<GameFormat>('physical');
  const [condition, setCondition] = useState<GameCondition | ''>('good');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setPicked(null);
      setManualTitle('');
      setFormat('physical');
      setCondition('good');
      setNotes('');
    }
  }, [open, initialTab]);

  const alreadyOwned =
    picked?.nsuid &&
    family.items.some((i) => i.owner_id === family.meId && family.gameById.get(i.game_id)?.nsuid === picked.nsuid);

  const add = async () => {
    if (!picked) return;
    const res = await run(
      () => api.addToLibrary(picked, { format, condition: format === 'physical' ? condition || null : null, notes }),
      { success: `${picked.title} was added to your library!` },
    );
    if (res.ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={picked ? 'Add to your library' : 'Add a game'} size="lg">
      {picked ? (
        <div className="picked">
          <div className="picked-head">
            <GameIcon game={picked} size={132} />
            <div className="picked-info">
              <h3>{picked.title}</h3>
              <GameFacts game={picked} compact />
            </div>
          </div>
          {alreadyOwned && <p className="notice notice-amber">You already have this game in your library — this will add a second copy.</p>}
          <CopyOptions format={format} setFormat={setFormat} condition={condition} setCondition={setCondition} notes={notes} setNotes={setNotes} />
          <div className="row gap end wrap">
            <button type="button" className="btn btn-secondary" onClick={() => setPicked(null)}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={add} disabled={busy}>
              {busy ? <Spinner size={18} /> : <CircleCheck size={18} />} Add to library
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="tabs tabs-pill" role="tablist">
            {(
              [
                ['search', <Search size={17} key="i" />, 'Search eShop'],
                ['scan', <Camera size={17} key="i" />, 'Scan screenshot'],
                ['manual', <PenLine size={17} key="i" />, 'Enter manually'],
              ] as const
            ).map(([id, icon, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
          {tab === 'search' && (
            <SearchTab
              onPicked={setPicked}
              onManual={(t) => {
                setManualTitle(t);
                setTab('manual');
              }}
            />
          )}
          {tab === 'scan' && <ScanTab onDone={onClose} />}
          {tab === 'manual' && <ManualTab initialTitle={manualTitle} onPicked={setPicked} />}
        </>
      )}
    </Modal>
  );
}
