# Contact backend

Customer submits → server validates → SQLite saves the enquiry → customer sees confirmation. The separate notification queue emails the site owner when SMTP is configured. `/admin/` is the source of truth even when notification delivery fails. Replies use your mail app; the admin does not send messages to customers automatically.

## Local setup

1. Use Node.js 24.14+ and run `npm install` from the repository root.
2. Copy `.env.example` to `.env`. Run `npm run admin:password`, enter a unique password of at least 14 characters, and put the resulting hash in `ADMIN_PASSWORD_HASH`. The command masks input; the plaintext password is not stored by the application.
3. Run `npm start`. Open `http://127.0.0.1:4174/contact.html` and `http://127.0.0.1:4174/admin/`. Sign in using `ADMIN_EMAIL` and your password.
4. Data is stored in `data/enquiries.sqlite` by default. Do not commit `.env`, database files, logs or customer data.

Port 4173 is a static visual preview, not the backend. Its form stays disabled with a direct-email fallback. The full site and API must be served from the same configured origin. The contact page never shows successful receipt when saving has failed.

## Email notifications

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` using credentials from your email provider. `NOTIFY_EMAIL` defaults to `eltonw482@gmail.com`. Use an authorized sender address for `MAIL_FROM`; the visitor's email is used only as Reply-To. Never put SMTP credentials in frontend files.

SMTP port 465 normally uses `SMTP_SECURE=true`; port 587 uses `SMTP_SECURE=false` with STARTTLS required. See [Nodemailer SMTP configuration](https://nodemailer.com/smtp). The SMTP service may require verification of your sending address or domain. Use the provider's application credentials, not your normal Gmail account password.

The worker runs every 15 seconds. Failed sends retry with increasing delays up to five attempts, then show `failed` in the inbox with a retry button. Pending notifications survive restarts and begin sending when SMTP is configured, including previously queued enquiries. Review any local test enquiries before enabling real email. `sent` means the SMTP server accepted the message, not proof that it reached the recipient's inbox. A process crash after SMTP acceptance but before the local status update can result in a duplicate notification; the same Message-ID is reused.

## Deployment

This implementation needs a long-running Node service and a persistent writable disk, with one application instance. A static GitHub Pages upload or a serverless deployment with an ephemeral filesystem will not persist these enquiries. Once the hosting platform is chosen, configure its runtime or adapt storage before launch.

- Set `NODE_ENV=production`, `PUBLIC_ORIGIN=https://your-domain`, `HOST=0.0.0.0`, a strong admin password hash and `DATA_DIR` to the mounted persistent disk. Start with `npm start`.
- Terminate HTTPS at your reverse proxy. Set `TRUST_PROXY_HOPS` only to the exact number of trusted proxies. Never expose a direct route that bypasses that proxy when proxy trust is enabled.
- Sessions use HttpOnly, SameSite cookies and an 8-hour expiry. Production cookies are Secure. API responses are not cached. Admin mutations and public submissions require the configured origin. Rate limiting, body limits, a honeypot and parameterized SQL protect the basic enquiry flow.
- Public serving is restricted to intentional assets; `.env`, database files, source, test output and Git files are not served. Protect the persistent disk with the hosting account's access controls.
- To rotate the password, change the hash and restart. Revoke existing sessions by stopping the service and deleting rows from the SQLite `sessions` table.
- Before public launch, verify a real enquiry, admin login, restart persistence and actual receipt at the notification mailbox. Add stronger bot protection if public traffic requires it.

## Backups and tests

Back up the persistent data directory regularly to private storage. For a consistent manual copy, stop the application, copy the entire data directory (including any WAL/SHM files), then restart. Test restoring into an isolated directory before relying on a backup. Avoid copying only the main SQLite file while the application is running.

Run `npm test` for persistence, duplicate retry, authorization, origin, validation, rate limiting and notification failure tests. Tests use isolated SQLite files under ignored `output/server-tests/` and a fake mail sender; no real emails are sent. Local browser fixtures also belong under ignored `output/` and must not be used as production enquiries.

SQLite uses [Node's built-in SQLite API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html), which carries an experimental warning in the current Node 24 runtime. For multi-instance hosting or serverless platforms, move the repository layer to a managed database rather than sharing a local SQLite file.
