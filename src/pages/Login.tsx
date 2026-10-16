import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Mail } from 'lucide-react';
import { api } from '../api';
import { Logo } from '../components/Logo';
import { Spinner } from '../components/ui';
import { config } from '../config';
import { play } from '../lib/sounds';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';

const DEMO_PEOPLE = [
  ['maya@demo.family', 'Maya (Mom) — admin', '🌸', '#e60012'],
  ['alex@demo.family', 'Alex (Dad)', '🐢', '#0ab9e6'],
  ['leo@demo.family', 'Leo', '👾', '#1edc00'],
  ['zoe@demo.family', 'Auntie Zo', '🦊', '#b400e6'],
];

function CodeInput({ value, onChange, onComplete }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');

  const setAt = (i: number, d: string) => {
    const next = (value.slice(0, i) + d + value.slice(i + 1)).replace(/\s/g, '').slice(0, 6);
    onChange(next);
    if (next.length === 6) onComplete(next);
  };

  return (
    <div className="code-input" onPaste={(e) => {
      const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (text) {
        e.preventDefault();
        onChange(text);
        refs.current[Math.min(5, text.length)]?.focus();
        if (text.length === 6) onComplete(text);
      }
    }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          maxLength={1}
          value={d.trim()}
          autoFocus={i === 0}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (!v) return;
            play('tick');
            if (v.length > 1) {
              onChange(v.slice(0, 6));
              if (v.length >= 6) onComplete(v.slice(0, 6));
              return;
            }
            setAt(i, v);
            refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              if (d.trim()) setAt(i, ' ');
              else if (i > 0) {
                refs.current[i - 1]?.focus();
                setAt(i - 1, ' ');
              }
            } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}

export function Login() {
  const toast = useToast();
  const { refresh } = useAuth();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('fge-last-email') ?? '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('error_description');
    if (err) setError(err);
    if (params.has('code')) {
      // A sign-in link only works in the browser it was requested from.
      const t = setTimeout(
        () =>
          setError(
            'That sign-in link was opened in a different browser or app. Enter your email to get a new code, or open the link where you requested it.',
          ),
        2500,
      );
      return () => clearTimeout(t);
    }
  }, []);

  const sendCode = async (e?: React.FormEvent, overrideEmail?: string) => {
    e?.preventDefault();
    const addr = (overrideEmail ?? email).trim().toLowerCase();
    if (!addr) return;
    setBusy(true);
    setError('');
    try {
      await api.sendLoginCode(addr);
      try {
        localStorage.setItem('fge-last-email', addr);
        if (window.location.hash.length > 2) localStorage.setItem('fge-return-to', window.location.hash);
      } catch {
        /* ignore */
      }
      setEmail(addr);
      setStep('code');
      setCode('');
      play('success');
    } catch (err) {
      setError((err as Error).message);
      play('error');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setError('');
    try {
      await api.verifyLoginCode(email, value);
      await refresh();
      play('success');
    } catch (err) {
      setError((err as Error).message);
      setCode('');
      play('error');
    } finally {
      setBusy(false);
    }
  };

  const demoSignIn = async (addr: string) => {
    setBusy(true);
    try {
      await api.verifyLoginCode(addr, '000000');
      await refresh();
      play('success');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-hero" aria-hidden="true">
        <div className="login-tiles">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${(i % 6) * 0.35}s` }} />
          ))}
        </div>
      </div>
      <div className="login-card">
        <div className="login-logo">
          <Logo size="lg" />
        </div>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="login-form">
            <h1>Welcome!</h1>
            <p className="muted">Borrow and lend Nintendo games with your family. This space is invite-only.</p>
            <label className="field">
              <span className="field-label">Email address</span>
              <div className="search-input big">
                <Mail size={20} aria-hidden="true" />
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </label>
            {error && <p className="notice notice-red">{error}</p>}
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? <Spinner size={20} /> : <ArrowRight size={20} />} Send me a sign-in code
            </button>
            {config.enableGoogle && !config.demo && (
              <>
                <div className="or">
                  <span>or</span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-lg btn-block"
                  onClick={() => api.signInWithGoogle().catch((e) => setError(e.message))}
                >
                  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                  </svg>
                  Continue with Google
                </button>
              </>
            )}
            {config.demo && (
              <div className="demo-login">
                <p className="demo-login-title">
                  <span className="demo-tag">DEMO</span> Pick a sample family member:
                </p>
                <div className="demo-people">
                  {DEMO_PEOPLE.map(([addr, label, icon, color]) => (
                    <button key={addr} type="button" className="demo-person" onClick={() => demoSignIn(addr)} disabled={busy}>
                      <span className="avatar ring" style={{ width: 44, height: 44, fontSize: 22, background: color }}>
                        {icon}
                      </span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <p className="muted small">
                  No backend is connected yet, so everything stays in this browser. See the README to go live.
                </p>
              </div>
            )}
          </form>
        ) : (
          <div className="login-form">
            <h1>Check your email</h1>
            <p className="muted">
              We sent a 6-digit code to <b>{email}</b>. Enter it below — or just tap the link in the email.
            </p>
            <CodeInput value={code} onChange={setCode} onComplete={verify} />
            {config.demo && <p className="muted small center">Demo mode: any 6 digits work.</p>}
            {error && <p className="notice notice-red">{error}</p>}
            <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy || code.length !== 6} onClick={() => verify()}>
              {busy ? <Spinner size={20} /> : <ArrowRight size={20} />} Sign in
            </button>
            <div className="row gap center wrap">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStep('email'); setError(''); }}>
                Use a different email
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => sendCode(undefined, email)} disabled={busy}>
                Resend code
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
