# 🎮 Family Game Exchange

A website for sharing Nintendo games between family and friends. It runs on GitHub Pages with a Firebase backend. Anyone can sign in, **create a family** and **invite people by email**. Each family has its own private library of everyone's games, and tracks who lent what to whom.

- **Families**
  - Sign in with Google or an emailed sign-in link.
  - Create a family with a name, icon and colour, or join one you were invited to. You can belong to several families and switch between them in the top bar.
  - **Roles:** owner, admins and members. Admins invite people by email (or share an invite link), promote or demote members, and remove people. Owners can delete the family.
- **Profiles:** account name, nickname, a photo or an icon on a colour, status message, Switch friend code and email preferences.
- **Add games three ways:**
  - **eShop search** with autocomplete over the real Nintendo eShop catalog. The official eShop icon and details are filled in automatically: publisher, developer, release date, genres, player count, local/online/co-op multiplayer, play modes and rating.
  - **Scan a screenshot or photo** (console home screen, game list, shelf of cases) with the OpenAI API. This is optional, and **each person uses their own API key, stored only in their own browser** (details below).
  - **Manual entry** for anything that isn't in the eShop.
- **Browse and filter** the family library. Filters cover name, genre, platform, publisher, developer, release year, player count, multiplayer, local, online, co-op, owner, availability and format.
- **Borrowing:**
  - **Request to borrow** marks the game *pending* and notifies the owner in the app and by email. The email has **Accept / Decline / Reply** buttons that open the request.
  - **Owner actions:** the owner can accept with an optional due date, decline, or lend a game directly without a request.
  - **Loans page:** tabs for incoming and outgoing requests, games you've **lent out**, games you've **borrowed**, and history.
  - **Per-loan activity:** each loan has a timeline with comments, due-date changes and "mark as returned".
- **Everything updates live** in every open browser.
- **Nintendo-inspired UI:**
  - Joy-Con colours, a dock of round buttons, the pulsing cyan selection frame, and a tile row with the title floating above the selected game.
  - Console-style dialogs and Basic White / Basic Black themes.
  - Small synthesized menu sounds you can turn off.
  - Fully responsive.

> Unofficial fan project, not affiliated with Nintendo. Game names, icons and details come from Nintendo's public eShop catalog.

---

## Try it locally (demo mode)

On your own computer, without a Firebase config, `npm run dev` runs the app in **demo mode**: sample families stored only in your browser, sign in as a sample person (or any email) and switch people from the banner to test lending.

```bash
npm install
npm run dev        # http://localhost:5173
```

The published site never shows demo data: without a usable Firebase config the GitHub workflow stops with an error, and a build made without one shows a "setup needed" page. (To deliberately publish the demo, set a repository variable `DEMO` = `true`.)

---

## How it works

```
GitHub Pages (static React app)
   ├── Nintendo eShop catalog (public search index) ── autocomplete, icons, game details
   ├── OpenAI API (optional, called straight from the browser with YOUR key) ── screenshot scanning
   └── Firebase (your project, Blaze plan)
         ├── Authentication ... Google + passwordless email links
         ├── Firestore ......... families, members, games, libraries, loans, comments, notifications
         ├── Storage ........... profile pictures
         └── Cloud Functions ... every rule-bound action (create family, invite, join, request,
                                 accept, lend, return, comment…) + notification/invite emails
```

**Privacy and security**

- **Families are isolated.** Firestore security rules only let you read a family you are a member of. Everything that changes state goes through Cloud Functions, which check who is allowed to do what: only the owner of a game can accept a request, only admins can invite, and so on. Browsers can only edit their own game copy's notes, format and lendable flag, and mark their own notifications as read.
- **Invites are tied to an email address.** An invite can only be read or accepted by someone signed in with that exact, verified email address, or seen by the family's admins.
- **Removing someone cuts their access immediately.** Their games leave the library and their open requests are cancelled. Loan history is kept.
- **OpenAI keys never leave the person's device.** Each person pastes their own key in *Settings → Screenshot scanning*. It is saved only in that browser's local storage and sent only to `api.openai.com` when that person scans. It is never sent to Firebase, the Cloud Functions or other family members. OpenAI bills that person's own account; a scan typically costs a fraction of a cent. Removing the key (or clearing site data) deletes it.
- **Fast reopening keeps a copy on the device.** So the app opens instantly, each browser keeps the app's files (a service worker) and a copy of what you last saw in your current family: profile, families, games, copies and loans. Firebase's own offline cache already stores the same data there. The copy is replaced by live data as soon as your sign-in is confirmed, and deleted when you sign out or your sign-in is no longer valid. A new release is picked up in the background and used the next time the app opens.

---

## Go live: setup guide

You'll need a Firebase project on the **Blaze** (pay-as-you-go) plan. Cloud Functions and Storage require it. Family-sized usage stays within the free quotas.

### 1. Firebase project

1. In the [Firebase console](https://console.firebase.google.com), open your project or create one, and make sure it is on **Blaze**.
   - Tip: under *Usage and billing → Details & settings* create a **budget alert** (e.g. $5).
2. **Add a web app** (*Project settings → General → Your apps → </>*) and copy the `firebaseConfig` object.
3. **Authentication → Sign-in method:**
   - **Google:** enable it.
   - **Email/Password:** enable it **and** turn on **Email link (passwordless sign-in)**.
   - **Authentication → Settings → Authorized domains:** add `<your-github-user>.github.io`.
4. **Firestore Database:** create a database in production mode. The functions are set up for **eur3 (Europe)**; see the region note below if you pick a US location.
5. **Storage:** click *Get started* to create the default bucket.

### 2. Deploy the rules and Cloud Functions

```bash
npm install
npm --prefix functions install
npx firebase-tools@15 login
npx firebase-tools@15 use --add          # pick your project (updates .firebaserc)
npm run deploy:firebase                  # Firestore rules + indexes, Storage rules, Cloud Functions
```

The first deploy asks for a few settings and saves them to `functions/.env.<project-id>`:

| Setting | What to enter |
| --- | --- |
| `SITE_URL` | `https://<your-github-user>.github.io/NintendoFamGameExchange/` (used for links in emails) |
| `EMAIL_PROVIDER` | `resend`, `brevo`, or `none` to skip notification emails |
| `EMAIL_FROM` | Sender, e.g. `Family Game Exchange <games@yourdomain.com>` |
| `EMAIL_API_KEY` (secret) | Your Resend or Brevo API key. Type `none` if you chose `none` above. |

- **Resend** needs a domain you own.
- **Brevo** can send from a single verified address if you don't have a domain.
- Without email, everything still works with in-app notifications, and admins can **copy invite links** to send in any messenger.
- Sign-in emails are sent by Firebase itself. Customize them in *Authentication → Templates*.

> The Cloud Functions run in `europe-west1`, next to a Europe (`eur3`) Firestore database. If your database is in the US (`nam5`), change `REGION` in `functions/src/common.ts` to `us-central1` and set the GitHub variable `FIREBASE_FUNCTIONS_REGION` to `us-central1` in step 3.

### 3. Publish on GitHub Pages

1. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. Go to **Settings → Secrets and variables → Actions → Variables** and add:
   - `FIREBASE_CONFIG`: the web config from step 1.2. Paste the console's whole snippet, the `firebaseConfig = {…}` object, or JSON like:
     ```json
     {"apiKey":"…","authDomain":"your-project.firebaseapp.com","projectId":"your-project","storageBucket":"your-project.firebasestorage.app","messagingSenderId":"…","appId":"…"}
     ```
     The Firebase web config is meant to be public. Access is controlled by the security rules.
   - `FIREBASE_FUNCTIONS_REGION` *(optional)*: only if you changed the region.
3. Push to `main` or run the **Deploy to GitHub Pages** workflow. The site appears at `https://<your-github-user>.github.io/NintendoFamGameExchange/`.

### 4. Use it

Sign in, create your family, then open **Family settings → Invite people**. Invitees get an email (or the invite link you share), sign in with that address and tap **Join**.

---

## Local development

```bash
npm run dev                  # demo mode, no backend
```

To develop against the real Firebase emulators (Auth, Firestore, Functions, Storage):

```bash
cp .env.example .env.local   # put your web config in VITE_FIREBASE_CONFIG and set VITE_USE_FIREBASE_EMULATORS=true
npm --prefix functions install
npm run emulators            # emulator UI at http://localhost:4000 (sign-in links appear in the Auth tab)
npm run dev
```

`npm run build` type-checks and builds the site to `dist/`. `npm run functions:build` compiles the Cloud Functions.

## Project layout

```
src/
  api/          backend interface + Firebase implementation + in-browser demo implementation
  components/   UI building blocks (dialogs, game cards, filters, add-game flow, layout, family switcher)
  lib/          eShop catalog search, OpenAI (browser-only key), filtering, formatting, images, sounds
  pages/        Home, Browse, Game, My Games, Loans, Loan detail, Family, Family settings,
                Onboarding / Join, Profile settings
  state/        auth, families (current family, roles), data hooks with live updates, toasts, theme
  styles/       design tokens and styles (light + dark)
functions/      Cloud Functions (families, invites, library, loans, notification emails)
firestore.rules, storage.rules, firestore.indexes.json, firebase.json
.github/workflows/deploy.yml   builds and publishes to GitHub Pages
```
