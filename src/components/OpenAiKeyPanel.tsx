import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { DEFAULT_MODEL, getOpenAiKey, getOpenAiModel, keyHint, looksLikeKey, saveOpenAi, testOpenAiKey } from '../lib/openai';
import { useToast } from '../state/toast';
import { Spinner } from './ui';

/** Current local OpenAI key (re-renders when it changes in any tab). */
export function useOpenAiKey() {
  const [key, setKey] = useState(getOpenAiKey);
  useEffect(() => {
    const update = () => setKey(getOpenAiKey());
    window.addEventListener('fge-openai-changed', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('fge-openai-changed', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return key;
}

/** Add, test or remove your personal OpenAI key — stored only in this browser. */
export function OpenAiKeyPanel({ compact = false, onSaved }: { compact?: boolean; onSaved?: () => void }) {
  const key = useOpenAiKey();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [model, setModel] = useState(getOpenAiModel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const k = value.trim();
    if (!looksLikeKey(k)) {
      setError('That doesn’t look like an OpenAI API key (they start with “sk-”).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await testOpenAiKey(k);
      saveOpenAi(k, model);
      setValue('');
      toast.success('Key saved on this device. Screenshot scanning is on!');
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const privacy = (
    <p className="key-privacy">
      <ShieldCheck size={16} />
      <span>
        Your key is saved <b>only in this browser</b> and sent only to OpenAI when you scan. It never goes to the Game Exchange, Firebase or
        your family. Each person who wants to scan adds their own key; OpenAI bills your account (a scan costs a fraction of a cent).
      </span>
    </p>
  );

  if (key) {
    return (
      <div className="key-panel">
        <div className="setting">
          <span className="toggle-text">
            <span className="toggle-label">
              <KeyRound size={16} /> OpenAI key on this device
            </span>
            <span className="toggle-desc">
              {keyHint(key)} · model {getOpenAiModel()}
            </span>
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-danger-text"
            onClick={() => {
              saveOpenAi(null, null);
              toast.success('Key removed from this device.');
            }}
          >
            <Trash2 size={18} /> Remove
          </button>
        </div>
        {!compact && privacy}
      </div>
    );
  }

  return (
    <form className="key-panel" onSubmit={save}>
      {privacy}
      <div className="invite-form-row">
        <div className="search-input">
          <KeyRound size={18} aria-hidden="true" />
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            aria-label="OpenAI API key"
            placeholder="sk-…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !value.trim()}>
          {busy ? <Spinner size={18} /> : <KeyRound size={18} />} Save key
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="row gap wrap key-extra">
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="section-link small">
          Get a key from OpenAI <ExternalLink size={14} />
        </a>
        {!compact && (
          <label className="key-model">
            <span className="muted small">Model</span>
            <input className="input input-sm" value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL} />
          </label>
        )}
      </div>
    </form>
  );
}
