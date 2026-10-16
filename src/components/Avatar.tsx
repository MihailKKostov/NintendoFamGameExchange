import { Link } from 'react-router-dom';
import { displayName } from '../lib/format';
import type { Profile } from '../types';

type AvatarProfile = Pick<Profile, 'id' | 'display_name' | 'nickname' | 'avatar_url' | 'avatar_icon' | 'accent_color'>;

export function Avatar({
  profile, size = 40, link = false, ring = true, title,
}: { profile?: AvatarProfile | null; size?: number; link?: boolean; ring?: boolean; title?: string }) {
  const name = displayName(profile);
  const style = { width: size, height: size, fontSize: size * 0.5, background: profile?.accent_color ?? '#9a9a9a' };
  const inner = profile?.avatar_url ? (
    <img src={profile.avatar_url} alt="" loading="lazy" />
  ) : (
    <span aria-hidden="true">{profile?.avatar_icon || name.charAt(0).toUpperCase()}</span>
  );
  const cls = `avatar${ring ? ' ring' : ''}`;
  if (link && profile) {
    return (
      <Link to={`/members/${profile.id}`} className={`${cls} selectable-soft`} style={style} title={title ?? name} aria-label={name}>
        {inner}
      </Link>
    );
  }
  return (
    <span className={cls} style={style} title={title ?? name} role="img" aria-label={name}>
      {inner}
    </span>
  );
}

export function AvatarStack({ profiles, size = 26, max = 4 }: { profiles: AvatarProfile[]; size?: number; max?: number }) {
  const shown = profiles.slice(0, max);
  const extra = profiles.length - shown.length;
  return (
    <span className="avatar-stack">
      {shown.map((p) => (
        <Avatar key={p.id} profile={p} size={size} />
      ))}
      {extra > 0 && (
        <span className="avatar ring avatar-more" style={{ width: size, height: size, fontSize: size * 0.42 }}>
          +{extra}
        </span>
      )}
    </span>
  );
}
