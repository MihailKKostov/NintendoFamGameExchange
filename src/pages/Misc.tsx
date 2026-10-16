import { Link } from 'react-router-dom';
import { LogOut, ShieldAlert } from 'lucide-react';
import { Logo } from '../components/Logo';
import { EmptyState } from '../components/ui';
import { useAuth } from '../state/auth';

export function NoAccess() {
  const { session, signOut } = useAuth();
  return (
    <div className="login">
      <div className="login-hero" aria-hidden="true" />
      <div className="login-card">
        <div className="login-logo">
          <Logo size="lg" />
        </div>
        <div className="login-form center">
          <ShieldAlert size={48} className="muted" />
          <h1>You’re not on the list</h1>
          <p className="muted">
            <b>{session?.email}</b> isn’t invited to this Game Exchange (or access was removed). Ask a family admin to invite
            you, then sign in again.
          </p>
          <button type="button" className="btn btn-primary btn-lg btn-block" onClick={signOut}>
            <LogOut size={20} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="page">
      <EmptyState title="This page doesn’t exist" action={<Link to="/" className="btn btn-primary">Go home</Link>}>
        Maybe a link was mistyped?
      </EmptyState>
    </div>
  );
}
