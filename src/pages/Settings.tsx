import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ImagePlus, LogOut, Moon, Monitor, ShieldCheck, Sun, Trash2 } from 'lucide-react';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { Field, PageLoader, Segmented, Spinner, Toggle } from '../components/ui';
import { config } from '../config';
import { squareAvatar } from '../lib/image';
import { play } from '../lib/sounds';
import { useAuth } from '../state/auth';
import { useAction, useFamily } from '../state/data';
import { useSettings, type ThemePref } from '../state/settings';
import { useToast } from '../state/toast';

const ICONS = ['🍄', '⭐', '🐢', '👾', '🎮', '🌸', '🦊', '🐙', '🦖', '🐸', '🐧', '🦄', '🐱', '🐶', '🐼', '🦁', '🍒', '🍕', '🌈', '⚡', '🔥', '👻', '🚀', '🏆', '🎸', '🧸', '🐝', '🦋', '🌵', '🍩'];
const COLORS = ['#e60012', '#ff3c28', '#ff8c00', '#ffdc00', '#1edc00', '#00b894', '#0ab9e6', '#1f6feb', '#b400e6', '#d6249f', '#8d6e63', '#545454'];

function normalizeFriendCode(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 12);
  if (!digits) return '';
  const parts = digits.match(/.{1,4}/g) ?? [];
  return 'SW-' + parts.join('-');
}

function ProfileEditor() {
  const family = useFamily();
  const toast = useToast();
  const { run, busy } = useAction();
  const me = family.me!;
  const [displayNameV, setDisplayName] = useState(me.display_name);
  const [nickname, setNickname] = useState(me.nickname ?? '');
  const [bio, setBio] = useState(me.bio ?? '');
  const [friendCode, setFriendCode] = useState(me.friend_code ?? '');
  const [icon, setIcon] = useState(me.avatar_icon ?? '⭐');
  const [color, setColor] = useState(me.accent_color);
  const [photo, setPhoto] = useState<string | null>(me.avatar_url);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayName(me.display_name);
    setNickname(me.nickname ?? '');
    setBio(me.bio ?? '');
    setFriendCode(me.friend_code ?? '');
    setIcon(me.avatar_icon ?? '⭐');
    setColor(me.accent_color);
    setPhoto(me.avatar_url);
  }, [me]);

  const preview = { ...me, display_name: displayNameV || me.display_name, nickname: nickname || null, avatar_icon: icon, accent_color: color, avatar_url: photo };
  const fcValid = !friendCode || /^SW-\d{4}-\d{4}-\d{4}$/.test(friendCode);
  const dirty =
    displayNameV !== me.display_name || nickname !== (me.nickname ?? '') || bio !== (me.bio ?? '') ||
    friendCode !== (me.friend_code ?? '') || icon !== me.avatar_icon || color !== me.accent_color || photo !== me.avatar_url;

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await squareAvatar(file);
      const url = await api.uploadAvatar(blob);
      setPhoto(url);
      play('select');
    } catch (e) {
      toast.error(e);
    } finally {
      setUploading(false);
    }
  };

  const save = () =>
    run(
      () =>
        api.updateMyProfile({
          display_name: displayNameV.trim(),
          nickname: nickname.trim() || null,
          bio: bio.trim() || null,
          friend_code: friendCode || null,
          avatar_icon: icon,
          accent_color: color,
          avatar_url: photo,
        }),
      { success: 'Profile saved!' },
    );

  return (
    <section className="panel settings-profile">
      <div className="profile-preview" style={{ ['--accent' as string]: color }}>
        <div className="profile-preview-band" />
        <Avatar profile={preview} size={112} />
        <b className="profile-preview-name">{nickname || displayNameV || 'Your name'}</b>
        {nickname && <span className="muted small">{displayNameV}</span>}
        {bio && <p className="profile-preview-bio">{bio}</p>}
        {friendCode && fcValid && <span className="tag tag-soft">{friendCode}</span>}
      </div>

      <div className="settings-form">
        <h2 className="panel-title">Your profile</h2>

        <Field label="Profile picture">
          <div className="avatar-editor">
            <div className="row gap wrap">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Spinner size={16} /> : <ImagePlus size={16} />} Upload photo
              </button>
              {photo && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhoto(null)}>
                  <Trash2 size={16} /> Use an icon instead
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            {!photo && (
              <div className="icon-grid" role="radiogroup" aria-label="Icon">
                {ICONS.map((i) => (
                  <button
                    key={i}
                    type="button"
                    role="radio"
                    aria-checked={icon === i}
                    className={`icon-choice${icon === i ? ' on' : ''}`}
                    style={{ background: icon === i ? color : undefined }}
                    onClick={() => {
                      play('tick');
                      setIcon(i);
                    }}
                  >
                    {i}
                  </button>
                ))}
              </div>
            )}
            <div className="color-row" role="radiogroup" aria-label="Color">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color.toLowerCase() === c}
                  aria-label={c}
                  className={`color-choice${color.toLowerCase() === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => {
                    play('tick');
                    setColor(c);
                  }}
                >
                  {color.toLowerCase() === c && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
        </Field>

        <div className="grid-2">
          <Field label="Account name">
            <input className="input" maxLength={40} value={displayNameV} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Nickname" hint="What the family calls you — shown around the app.">
            <input className="input" maxLength={30} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Grandma" />
          </Field>
        </div>
        <Field label="Status message">
          <textarea className="input" rows={2} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Currently playing… / favourite games…" />
        </Field>
        <Field label="Nintendo Switch friend code" error={!fcValid ? 'Friend codes look like SW-1234-5678-9012' : undefined}>
          <input className="input" inputMode="numeric" value={friendCode} placeholder="SW-0000-0000-0000" onChange={(e) => setFriendCode(normalizeFriendCode(e.target.value))} />
        </Field>
        <div className="row end">
          <button type="button" className="btn btn-primary" disabled={!dirty || !displayNameV.trim() || !fcValid || busy} onClick={save}>
            {busy ? <Spinner size={18} /> : <Check size={18} />} Save profile
          </button>
        </div>
      </div>
    </section>
  );
}

export function Settings() {
  const family = useFamily();
  const { signOut, isAdmin, session } = useAuth();
  const { theme, setTheme, sounds, setSounds } = useSettings();
  const { run } = useAction();

  if (family.loading || !family.me) return <PageLoader />;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Make it yours.</p>
        </div>
      </header>

      <ProfileEditor />

      <section className="panel settings-list">
        <h2 className="panel-title">Preferences</h2>
        <div className="setting">
          <span className="toggle-text">
            <span className="toggle-label">Theme</span>
            <span className="toggle-desc">Basic White or Basic Black — or follow your device.</span>
          </span>
          <Segmented<ThemePref>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: <><Sun size={16} /> White</> },
              { value: 'dark', label: <><Moon size={16} /> Black</> },
              { value: 'system', label: <><Monitor size={16} /> Auto</> },
            ]}
          />
        </div>
        <Toggle checked={sounds} onChange={setSounds} label="Menu sounds" description="Little clicks and chimes as you move around." />
        <Toggle
          checked={family.me.email_notifications}
          onChange={(v) => run(() => api.updateMyProfile({ email_notifications: v }), { success: v ? 'Email notifications on.' : 'Email notifications off.' })}
          label="Email notifications"
          description={`Requests, answers and comments are emailed to ${session?.email}.`}
        />
      </section>

      <section className="panel settings-list">
        <h2 className="panel-title">Account</h2>
        <div className="setting">
          <span className="toggle-text">
            <span className="toggle-label">Signed in as</span>
            <span className="toggle-desc">{session?.email}</span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={signOut}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
        {isAdmin && (
          <div className="setting">
            <span className="toggle-text">
              <span className="toggle-label">Family admin</span>
              <span className="toggle-desc">Invite or remove people.</span>
            </span>
            <Link to="/admin" className="btn btn-secondary">
              <ShieldCheck size={18} /> Manage invites
            </Link>
          </div>
        )}
        {config.demo && <p className="muted small">Demo mode: data is stored only in this browser.</p>}
      </section>
    </div>
  );
}
