import type { ReactNode } from 'react';
import { Logo } from './Logo';

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
