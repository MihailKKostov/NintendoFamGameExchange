import { config } from '../config';
import { AuthShell } from '../components/AuthShell';

/** Shown by a published build that has no usable Firebase config. */
export function SetupNeeded() {
  return (
    <AuthShell>
      <div className="login-form center">
        <h1>Almost there!</h1>
        <p className="muted">
          {config.unreadable
            ? 'This site was published with a Firebase config it couldn’t read.'
            : 'This site was published without its Firebase config.'}{' '}
          The site owner needs to add the <b>FIREBASE_CONFIG</b> variable in the GitHub repository (Settings → Secrets and variables →
          Actions → Variables) and publish again.
        </p>
      </div>
    </AuthShell>
  );
}
