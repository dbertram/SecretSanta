# Secret Santa

A single static HTML page for organizing a Secret Santa exchange and sending personalized assignments through your own Gmail account. No application server, build step, database, or SMTP password is needed. Cloudflare Workers Static Assets can serve the page directly.

The application is entirely in [`public/index.html`](public/index.html), including its CSS, JavaScript, and default email template. It loads Google's authorization library when opened.

## Run locally

Use Node.js 22 or newer and npm:

```sh
npm ci
npm run dev
```

Open `http://localhost:8787`. An HTTP localhost origin or an HTTPS deployment is required for Google authorization; double-clicking the HTML file is insufficient for OAuth. A basic static server also works; there is no dependency on Wrangler at runtime.

## Configure Google authorization

1. Create or select a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Gmail API** in that project.
3. Configure the OAuth consent screen in Google Auth Platform. For a personal Gmail account, use an **External** audience. While the project is in **Testing**, add your sending Gmail address under test users. You do not need to add the recipients as test users; they are not authorizing the application. Broader distribution may require Google's OAuth verification.
4. Configure these scopes under Data Access:
   - `https://www.googleapis.com/auth/gmail.send` — send email, without permission to read or delete mailbox messages.
   - `https://www.googleapis.com/auth/userinfo.email` — identify the connected sending account.
5. Create an OAuth client with application type **Web application**. Add `http://localhost` and `http://localhost:8787` under **Authorized JavaScript origins** for local use. Add the exact HTTPS origin of the deployed Worker or custom domain for production, without a path or trailing slash.
6. Copy the client ID into **Google OAuth settings** in the page and click **Save client ID**, then **Connect with Google**. Allow the popup and grant both permissions.

The client ID is public configuration. It is safe to put it in `DEFAULT_GOOGLE_CLIENT_ID` in the HTML if you prefer a preset. Alternatively, enter it once in the page; it is saved in this browser's local storage. **Never embed a client secret.** The page uses Google's browser token model, so no client secret or backend token exchange is needed. Google does not allow arbitrary website origins just because someone knows the client ID.

The access token remains in memory, expires after roughly an hour, and is not saved in local/session storage or cookies by this application. Reconnect when it expires. Disconnect clears the token and requests revocation from Google. Normal page reloads clear the token without revoking the Google account's grant.

See Google's [OAuth setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), and [sending documentation](https://developers.google.com/workspace/gmail/api/guides/sending).

## Use the page

1. Create a family and add participants' names and email addresses. Each person has a separate identity, so people may share a name or mailbox.
2. Add restrictions. **Block both directions** is checked by default; uncheck it for a one-way restriction. Self-assignments are always forbidden. Removing a participant also removes their restrictions.
3. Customize the sender display name, subject, and plain-text body. Supported placeholders are `{giver}`, `{recipient}`, and `{family}`. The body must contain `{recipient}`. The sender email is always the connected Google account; this page does not support sending as an alias. A display name is supplied in the MIME From header, though Gmail or the recipient's contacts may affect the displayed name.
4. Choose yourself under **I am…**, or choose the nonparticipating organizer option. This choice is separate from the connected Gmail account so shared mailboxes are supported.
5. Inspect the sample email preview, which always uses fictional people and email addresses while reflecting your template and sender display name. Try a dry-run to see every assignment separately. A dry-run sends nothing. Editing participants, rules, or the template invalidates it.
6. Connect Google, then **Draw & send emails**. Confirm the account and participant count. The app clears the dry-run and computes a fresh draw. Sending shows participant delivery statuses without displaying other assignments. After every email is accepted by Gmail, only your own gift recipient is revealed.

A dry-run and a live draw are independent: the new draw can coincidentally produce the same circle, especially with restrictive rules. Every draw is one circular chain, with exactly one gift given and one received per person. The solver uses cryptographically randomized candidate ordering and an exhaustive search with pruning. It does not promise a uniform distribution over all possible circles. It distinguishes impossible restrictions from exceeding its eight-second/two-million-step search budget. Up to 50 people per family are supported.

Each family keeps its own participants, exclusions, organizer selection, and email template. Switch, rename, create, or delete families at any time outside an active mailing. Changes save automatically under the local storage key `secret-santa.v1`. Deleting the last family creates a fresh empty one. Data belongs to the current browser profile and website origin: changing domain or clearing browser storage removes access to those configurations. It is not synced between devices. If saved data is corrupt or storage is unavailable, the page leaves existing data untouched and reports that changes are session-only.

## Sending, retries, and privacy

- Live pairings are never persisted, logged, or shown as a table. They exist in memory only while the mailing is active. Dry-run pairings also remain in memory only.
- Emails are sent sequentially. If one fails, the page pauses and retains the exact draw and delivery statuses in memory. Reconnect the same Google account if necessary and retry. Already accepted emails are skipped.
- A network timeout, interrupted connection, or Gmail server error may mean a message was accepted without confirmation. Such a delivery is marked uncertain. Retrying requires acknowledging that it might send a duplicate, with the **same** assignment. The app never silently generates a replacement draw on failure.
- The page must stay open to resume a partial mailing. Reloading, navigating away, closing the tab, or discarding it loses unsent assignments permanently. A browser leave-page prompt helps, but cannot prevent every shutdown. After a partial mailing, a fresh draw could conflict with emails already received. Coordinate with participants before doing that. Use one tab for sending.
- After every email is accepted, all pairing objects are discarded; the page retains only delivery statuses and, if participating, the organizer's recipient until the mailing is closed. Gmail acceptance is not proof of inbox delivery.
- This prevents accidental spoilers in the page, not inspection by the account owner. Gmail automatically keeps sent messages in **Sent**, and browser developer tools can inspect requests and memory. Recipients replying or sharing a mailbox may also reveal assignments. There is no way to enforce secrecy from the sending account owner with this architecture.
- Google receives authorization requests and email content for delivery. Family configurations and templates are stored only in this browser by the application; the Worker only serves static files. Anyone using the same browser profile and origin can access local storage.

## Cloudflare Worker deployment

`wrangler.jsonc` uses [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/) and serves **only `public/`**. Files outside that directory are not uploaded as assets. There is no Worker application code or API route. `public/_headers` allows Google's popup to communicate with the page and supplies basic response headers.

```sh
npx wrangler login
npm run check:deploy
npm run deploy
```

Authenticate to your Cloudflare account first. Change `name` in `wrangler.jsonc` if desired. After deployment, add the resulting `https://secret-santa.<your-subdomain>.workers.dev` origin (or custom domain) to the Google OAuth client's authorized origins. A public Worker does not publish your family data; configurations stay in each visitor's browser.

This repository has not been deployed automatically. No real emails are sent by tests or deployment checks.

## Verification

```sh
npm run test
npm run test:browser
npm run check:deploy
```

Core tests run the actual inline application core and cover circular matching, impossible constraints, an independent exhaustive oracle, validation, Unicode MIME encoding, and local storage schema handling. Browser tests use mocked Google authorization and Gmail responses; they never contact Google or send real mail. They cover family persistence, restriction editing, previews, dry-runs, private live sending, reconnection and retries, uncertain delivery, and unavailable storage.

Browser tests use an installed Google Chrome by default (`/usr/bin/google-chrome` on this development machine). Set `CHROME_PATH` to another Chromium executable, or install Playwright's Chromium with `npx playwright install chromium` and set `PLAYWRIGHT_CHROMIUM=1`.
