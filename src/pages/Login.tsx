import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Mail, MailCheck } from 'lucide-react';
import { api } from '../api';
import { rememberedLoginEmail } from '../api/firebaseApi';
import { Logo } from '../components/Logo';
import { Spinner } from '../components/ui';
import { config } from '../config';
import { play } from '../lib/sounds';

const DEMO_PEOPLE = [
  ['maya@demo.family', 'Maya (Mom)', '🌸', '#e60012'],
  ['alex@demo.family', 'Alex (Dad)', '🐢', '#0ab9e6'],
  ['leo@demo.family', 'Leo', '👾', '#1edc00'],
  ['zoe@demo.family', 'Auntie Zo', '🦊', '#b400e6'],
];

export function AuthShell({ children }: { children: ReactNode }) {
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
        {children}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function Login() {
  const linkInUrl = api.isLoginLink();
  const [step, setStep] = useState<'email' | 'sent' | 'confirm' | 'completing'>(linkInUrl ? 'completing' : 'email');
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('fge-last-email') ?? '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Arriving from the emailed link: finish signing in.
  useEffect(() => {
    if (!linkInUrl) return;
    const remembered = rememberedLoginEmail();
    if (!remembered) {
      setStep('confirm');
      return;
    }
    api.completeLoginLink(remembered).catch((e) => {
      setError((e as Error).message);
      setStep('email');
    });
  }, [linkInUrl]);

  const remember = (addr: string) => {
    try {
      localStorage.setItem('fge-last-email', addr);
      // Come back to the page that asked for sign-in (e.g. an invite link).
      if (window.location.hash.length > 2) localStorage.setItem('fge-return-to', window.location.hash);
    } catch {
      /* ignore */
    }
  };

  const sendLink = async (e?: FormEvent, override?: string) => {
    e?.preventDefault();
    const addr = (override ?? email).trim().toLowerCase();
    if (!addr) return;
    setBusy(true);
    setError('');
    try {
      remember(addr);
      await api.sendLoginLink(addr);
      setEmail(addr);
      if (!config.demo) setStep('sent');
      play('success');
    } catch (err) {
      setError((err as Error).message);
      play('error');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.completeLoginLink(email);
    } catch (err) {
      setError((err as Error).message);
      setStep('email');
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError('');
    try {
      if (window.location.hash.length > 2) localStorage.setItem('fge-return-to', window.location.hash);
      await api.signInWithGoogle();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (step === 'completing') {
    return (
      <AuthShell>
        <div className="login-form center">
          <Spinner size={44} />
          <p className="muted">Signing you in…</p>
        </div>
      </AuthShell>
    );
  }

  if (step === 'confirm') {
    return (
      <AuthShell>
        <form className="login-form" onSubmit={confirm}>
          <h1>One more step</h1>
          <p className="muted">This link was opened on a different device or browser. Confirm your email address to finish signing in.</p>
          <div className="search-input big">
            <Mail size={20} aria-hidden="true" />
            <input type="email" required autoFocus autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="notice notice-red">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? <Spinner size={20} /> : <ArrowRight size={20} />} Sign in
          </button>
        </form>
      </AuthShell>
    );
  }

  if (step === 'sent') {
    return (
      <AuthShell>
        <div className="login-form center">
          <span className="sent-icon">
            <MailCheck size={40} />
          </span>
          <h1>Check your email</h1>
          <p className="muted">
            We sent a sign-in link to <b>{email}</b>. Open it on this device to continue. It can take a minute — check your spam folder
            too.
          </p>
          {error && <p className="notice notice-red">{error}</p>}
          <div className="row gap center wrap">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('email')}>
              Use a different email
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sendLink(undefined, email)} disabled={busy}>
              Send it again
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={sendLink} className="login-form">
        <h1>Welcome!</h1>
        <p className="muted">Share Nintendo games with your family. Sign in, then create a family or join one you’ve been invited to.</p>
        {!config.demo && (
          <>
            <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={google}>
              <GoogleIcon /> Continue with Google
            </button>
            <div className="or">
              <span>or use your email</span>
            </div>
          </>
        )}
        <label className="field">
          <span className="field-label">Email address</span>
          <div className="search-input big">
            <Mail size={20} aria-hidden="true" />
            <input type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </label>
        {error && <p className="notice notice-red">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? <Spinner size={20} /> : <ArrowRight size={20} />} {config.demo ? 'Continue' : 'Email me a sign-in link'}
        </button>
        {config.demo && (
          <div className="demo-login">
            <p className="demo-login-title">
              <span className="demo-tag">DEMO</span> Pick a sample family member:
            </p>
            <div className="demo-people">
              {DEMO_PEOPLE.map(([addr, label, icon, color]) => (
                <button key={addr} type="button" className="demo-person" onClick={() => sendLink(undefined, addr)} disabled={busy}>
                  <span className="avatar ring" style={{ width: 44, height: 44, fontSize: 22, background: color }}>
                    {icon}
                  </span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <p className="muted small">
              …or type any email above to start fresh and create your own family. No backend is connected yet, so everything stays in this browser.
            </p>
          </div>
        )}
      </form>
    </AuthShell>
  );
}
