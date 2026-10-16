# 🎮 Family Game Exchange

A website for a group of family and friends to share Nintendo games. Each person keeps a library of the games they own, browses everyone else's, and asks to borrow. Every loan is tracked from the request to the return.

- **Invite-only.** Only email addresses on the invite list can sign in and see any data.
- **Profiles.** Each person sets an account name, nickname, profile picture (a photo or an icon on a colour), status message and Switch friend code.
- **Add games three ways:**
  - **eShop search** with autocomplete over the real Nintendo eShop catalog. The official eShop icon and details are filled in automatically: publisher, developer, release date, genres, player count, local/online/co-op multiplayer, play modes and rating.
  - **Scan a screenshot or photo** (console home screen, game list, shelf of cases). The OpenAI API reads the titles, each one is matched to the eShop catalog, and you tick the ones to add.
  - **Manual entry** for anything that isn't in the eShop.
- **Browse and filter** the whole family library. Filters cover name, genre, platform, publisher, developer, release year, player count, multiplayer, local, online, co-op, owner, availability and format. Filters are kept in the URL, so a filtered view can be shared as a link.
- **Borrowing:**
  - **Request to borrow.** The game shows as *pending* and the owner gets an email. The email has **Accept / Decline / Reply** buttons that open the request on the site.
  - **Owner actions.** The owner can accept with an optional due date, decline, or lend a game directly without a request.
  - **Loans page.** It has separate tabs for incoming and outgoing requests, games you've **lent out**, games you've **borrowed**, and history.
  - **Per-loan activity.** Each loan has a timeline with comments, due-date changes and "mark as returned".
- **Notifications.** There's an in-app notification bell and email alerts. Changes appear live in every open browser.
- **Nintendo-inspired UI:**
  - Joy-Con colours and a dock of round buttons like the console home menu.
  - The pulsing cyan selection frame, a tile row with the title floating above the selected game, and console-style dialogs.
  - Basic White / Basic Black themes and small synthesized menu sounds (you can turn them off).
  - Fully responsive, with bottom sheets on phones.

> Unofficial fan project, not affiliated with Nintendo. Game names, icons and details come from Nintendo's public eShop catalog.

---

## Try it right now (demo mode)

With no backend configured, the app runs in **demo mode**. Sample family data is kept only in your browser, and a banner lets you switch between sample people so you can test the full lending flow.

```bash
npm install
npm run dev        # http://localhost:5173
```

A GitHub Pages deploy without Supabase settings also runs in demo mode.

---

## How it works

```
GitHub Pages (static React app)
   │
   ├── Nintendo eShop catalog (public search index) ── game autocomplete, icons, details
   │
   └── Supabase (free tier)
         ├── Auth ............. email sign-in codes / links (optionally Google)
         ├── Postgres + RLS ... invites, profiles, games, libraries, loans, comments, notifications
         ├── Storage .......... profile pictures
         ├── Realtime ......... live updates
         └── Edge Functions
               ├── recognize-games ...... screenshot → OpenAI API → game titles
               └── send-notifications ... queued notifications → email (Resend or Brevo)
```

**Why "invited emails only" holds even though the site is public:** GitHub Pages only serves the app's code. All data lives in Supabase and is protected by row-level security:

- A database trigger refuses to create an account for any email that isn't in `public.invites`.
- Every table can only be read by a signed-in person whose email is *currently* on the invite list. Removing someone's invite cuts off their access immediately.
- Every loan action (request, accept, decline, lend, return, comment) goes through a database function that checks who is allowed to do it.

Uninvited visitors only ever see the sign-in screen.

---

## Go live: setup guide (about 20 minutes)

### 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) and create a new project (the free tier is plenty).
2. Open **SQL Editor**, paste the contents of [`supabase/migrations/20261016000000_init.sql`](supabase/migrations/20261016000000_init.sql) and **Run** it.
   - Or with the CLI: `npx supabase link --project-ref <ref>` and then `npx supabase db push`.
3. Still in the SQL editor, **invite yourself as the first admin**:

   ```sql
   insert into public.invites (email, is_admin) values ('you@example.com', true);
   ```

   Everyone else can then be invited from the app (**Family → Invite people**).

### 2. Configure sign-in

In **Authentication**:

1. **URL Configuration**
   - **Site URL:** `https://<your-github-user>.github.io/NintendoFamGameExchange/`
   - **Redirect URLs:** add the same URL, plus `http://localhost:5173/` for local development.
2. **Email templates.** In both **Magic Link** and **Confirm signup**, add the code so people can type it in. This works across devices, for example when the email is opened on a phone:

   ```html
   <h2>Your sign-in code: {{ .Token }}</h2>
   <p>Or <a href="{{ .ConfirmationURL }}">click here to sign in</a>.</p>
   ```

3. **SMTP Settings.** Turn on custom SMTP. Supabase's built-in mailer only delivers to your own team's addresses and a few emails per hour. Use the same provider as in step 4:
   - **Resend:** host `smtp.resend.com`, port `465`, user `resend`, password = API key.
   - **Brevo:** host `smtp-relay.brevo.com`, port `587`, login and SMTP key from Brevo.
4. *(Optional)* **Google sign-in.** Enable the Google provider and set `ENABLE_GOOGLE=true` in step 5. Uninvited Google accounts are still refused.

### 3. Deploy the Edge Functions

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase functions deploy recognize-games
npx supabase functions deploy send-notifications
```

### 4. Add the function secrets

Set these in **Project Settings → Edge Functions → Secrets**, or with `npx supabase secrets set NAME=value`.

| Secret | Required | Example / notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | for screenshot scanning | from [platform.openai.com](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | optional | defaults to `gpt-5-mini` (any vision-capable chat model works) |
| `SITE_URL` | for emails | `https://<your-github-user>.github.io/NintendoFamGameExchange/` |
| `EMAIL_FROM` | for emails | `Family Game Exchange <games@yourdomain.com>` |
| `RESEND_API_KEY` **or** `BREVO_API_KEY` | for emails | Resend needs a verified domain. Brevo can send from a single verified address if you have no domain. |

If the email secrets are missing, notifications still appear in the app's bell and are emailed once you add them. They're kept for 2 days.

### 5. Publish on GitHub Pages

1. In the GitHub repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. Go to **Settings → Secrets and variables → Actions → Variables** and add:
   - `SUPABASE_URL`: from Supabase **Project Settings → API** (`https://xxxx.supabase.co`).
   - `SUPABASE_ANON_KEY`: the **anon / publishable** key. It's designed to be public; row-level security protects the data.
   - `ENABLE_GOOGLE` *(optional)*: `true` to show the Google button.
3. Push to `main` or run the **Deploy to GitHub Pages** workflow manually. The site appears at `https://<your-github-user>.github.io/NintendoFamGameExchange/`.

> GitHub Pages on a private repository requires a paid GitHub plan. The repo can safely be public: it contains no secrets.

### 6. Invite the family

Sign in with your admin email, then go to **Family → Invite people**. Each invite sends an email with a link to the site. Invitees sign in with the same address.

---

## Local development against Supabase

```bash
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

`npm run build` type-checks and builds to `dist/`.

## Project layout

```
src/
  api/            backend interface + Supabase implementation + in-browser demo implementation
  components/     UI building blocks (dialogs, game cards, filters, add-game flow, layout/dock)
  lib/            Nintendo catalog search, filtering, formatting, image resizing, menu sounds
  pages/          Home, Browse, Game, My Games, Loans, Loan detail, Family, Profile, Settings, Admin
  state/          auth, data fetching (TanStack Query + realtime), toasts, theme/sound settings
  styles/         design tokens and styles (light + dark)
supabase/
  migrations/     database schema, row-level security and loan functions
  functions/      recognize-games (OpenAI) and send-notifications (email)
.github/workflows/deploy.yml   builds and publishes to GitHub Pages
```
