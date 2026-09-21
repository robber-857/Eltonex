const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { verifyPassword } = require('./password.cjs');

const SERVICES = ['Website', 'iOS / Android app', 'Internal system', 'Custom AI agent'];
const TIMINGS = ['', 'As soon as practical', 'Within 1–2 months', 'Within 3–6 months', 'Still exploring'];
const STATUSES = ['new', 'contacted', 'closed'];
const digest = value => createHash('sha256').update(value).digest('hex');

function createApp(config) {
  const root = path.resolve(__dirname, '..');
  mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(config.dataDir, 'enquiries.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS enquiries (
      id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
      services TEXT NOT NULL, message TEXT NOT NULL, timing TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '',
      notification TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
  `);
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxyHops) app.set('trust proxy', config.trustProxyHops);
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' });
    if (config.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    if (req.path.startsWith('/api/') || req.path.startsWith('/admin')) {
      res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    }
    next();
  });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.headers.origin !== config.origin) return res.status(403).json({ error: 'Please submit from this website.' });
      if (req.method !== 'DELETE' && !req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
    }
    next();
  }, express.json({ limit: '20kb' }));

  function limit(scope, maximum) {
    return (req, res, next) => {
      const now = Date.now();
      db.prepare('DELETE FROM limits WHERE expires < ?').run(now);
      const key = digest(`${scope}:${req.ip}`);
      db.prepare('INSERT INTO limits VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1').run(key, now + 15 * 60_000);
      const record = db.prepare('SELECT * FROM limits WHERE key = ?').get(key);
      if (record.count > maximum) return res.status(429).set('Retry-After', String(Math.ceil((record.expires - now) / 1000))).json({ error: 'Too many attempts. Please try again in 15 minutes.' });
      next();
    };
  }
  function cookie(req) { return /(?:^|;\s*)eltonex_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || ''; }
  function auth(req, res, next) {
    const session = db.prepare('SELECT expires FROM sessions WHERE token = ?').get(digest(cookie(req)));
    if (!session || session.expires <= Date.now()) return res.status(401).json({ error: 'Please sign in.' });
    next();
  }
  function clean(value, max, min = 0) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed)) return null;
    return trimmed;
  }
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.post('/api/enquiries', limit('enquiry', 10), (req, res) => {
    const body = req.body || {};
    if (body.website) return res.status(400).json({ error: 'Unable to submit this enquiry. Please contact us by email.' });
    const name = clean(body.name, 100, 1), email = clean(body.email, 254, 3), message = clean(body.message, 5000, 10);
    if (!name || !email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || !message ||
      !Array.isArray(body.services) || body.services.length > SERVICES.length || body.services.some(s => !SERVICES.includes(s)) ||
      !TIMINGS.includes(body.timing) || !/^[a-f0-9-]{36}$/.test(body.requestId || '')) {
      return res.status(400).json({ error: 'Check your name, email and project details (10–5,000 characters).' });
    }
    const services = JSON.stringify([...new Set(body.services)]);
    const hash = digest(JSON.stringify([name, email, services, message, body.timing]));
    const previous = db.prepare('SELECT id, payload_hash FROM enquiries WHERE request_id = ?').get(body.requestId);
    if (previous) {
      if (previous.payload_hash !== hash) return res.status(409).json({ error: 'Your details have changed. Please try submitting again.' });
      return res.json({ ok: true });
    }
    db.prepare('INSERT INTO enquiries (id, request_id, payload_hash, created_at, name, email, services, message, timing) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), body.requestId, hash, new Date().toISOString(), name, email, services, message, body.timing);
    res.status(201).json({ ok: true });
  });

  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: config.secure, path: '/api/admin' };
  app.post('/api/admin/login', limit('login', 5), (req, res) => {
    if (!config.passwordHash) return res.status(503).json({ error: 'Admin access is not configured. Set ADMIN_PASSWORD_HASH on the server.' });
    const { email, password } = req.body || {};
    if (typeof password !== 'string' || password.length > 256 || !verifyPassword(password, config.passwordHash) || typeof email !== 'string' || email.toLowerCase() !== config.adminEmail.toLowerCase()) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires < ? OR token = ?').run(Date.now(), digest(cookie(req)));
    db.prepare('INSERT INTO sessions VALUES (?, ?)').run(digest(token), Date.now() + 8 * 60 * 60_000);
    res.cookie('eltonex_admin', token, { ...cookieOptions, maxAge: 8 * 60 * 60_000 }).json({ ok: true });
  });
  app.use('/api/admin', auth);
  app.get('/api/admin/session', (req, res) => res.json({ email: config.adminEmail, notificationsConfigured: Boolean(config.sendMail) }));
  app.post('/api/admin/logout', (req, res) => {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(digest(cookie(req)));
    res.clearCookie('eltonex_admin', cookieOptions).json({ ok: true });
  });
  app.get('/api/admin/enquiries', (req, res) => {
    const status = typeof req.query.status === 'string' && STATUSES.includes(req.query.status) ? req.query.status : '';
    const search = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
    const where = "WHERE (? = '' OR status = ?) AND (? = '' OR instr(lower(name || ' ' || email || ' ' || message), lower(?)) > 0)";
    const args = [status, status, search, search];
    const total = db.prepare(`SELECT count(*) AS count FROM enquiries ${where}`).get(...args).count;
    const items = db.prepare(`SELECT id, created_at, name, email, services, message, timing, status, notes, notification FROM enquiries ${where} ORDER BY created_at DESC, id DESC LIMIT 5 OFFSET ?`).all(...args, (page - 1) * 5);
    res.json({ items: items.map(row => ({ ...row, services: JSON.parse(row.services) })), total, page });
  });
  app.patch('/api/admin/enquiries/:id', (req, res) => {
    const { status, notes } = req.body || {};
    if (!STATUSES.includes(status) || clean(notes, 5000) === null) return res.status(400).json({ error: 'Choose a valid status and notes under 5,000 characters.' });
    const result = db.prepare('UPDATE enquiries SET status = ?, notes = ? WHERE id = ?').run(status, notes.trim(), req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Enquiry not found.' });
    res.json({ ok: true });
  });
  app.delete('/api/admin/enquiries/:id', (req, res) => {
    const result = db.prepare('DELETE FROM enquiries WHERE id = ?').run(req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Enquiry not found.' });
    res.json({ ok: true });
  });
  app.post('/api/admin/enquiries/:id/retry', (req, res) => {
    if (!config.sendMail) return res.status(503).json({ error: 'Configure SMTP on the server first.' });
    const existing = db.prepare('SELECT notification FROM enquiries WHERE id = ?').get(req.params.id);
    if (existing?.notification === 'pending') return res.json({ ok: true });
    const result = db.prepare("UPDATE enquiries SET notification = 'pending', attempts = 0, next_attempt = 0 WHERE id = ? AND notification = 'failed'").run(req.params.id);
    if (!result.changes) return res.status(409).json({ error: 'Only a failed notification can be retried.' });
    res.json({ ok: true });
  });

  // Only intentional public files are served; source, credentials and data stay private.
  const publicFiles = ['index.html', 'about.html', 'contact.html', 'services.html', 'styles.css', 'layout.css', 'hero.css', 'about.css', 'contact.css', 'footer.css', 'services.css', 'capability-ticker.css', 'script.js', 'contact.js', 'services.js', 'hero-film.js', 'hero-scene.js', 'capability-ticker.js'];
  app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));
  for (const file of publicFiles) app.get(`/${file}`, (req, res) => res.sendFile(path.join(root, file)));
  app.use('/assets', express.static(path.join(root, 'assets'), { dotfiles: 'deny', index: false }));
  app.get(['/admin', '/admin/'], (req, res) => res.sendFile(path.join(root, 'admin/index.html')));
  app.get('/admin/admin.css', (req, res) => res.sendFile(path.join(root, 'admin/admin.css')));
  app.get('/admin/admin.js', (req, res) => res.sendFile(path.join(root, 'admin/admin.js')));
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, req, res, next) => {
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ error: status === 500 ? 'Unable to save right now. Please try again or email us.' : 'Invalid request.' });
  });

  let notifying = false;
  async function deliverNotifications() {
    if (notifying || !config.sendMail) return;
    notifying = true;
    try {
      const rows = db.prepare("SELECT * FROM enquiries WHERE notification = 'pending' AND next_attempt <= ? ORDER BY created_at LIMIT 10").all(Date.now());
      for (const row of rows) {
        try {
          await config.sendMail({
            from: config.mailFrom, to: config.notifyEmail, replyTo: row.email,
            messageId: `<enquiry-${row.id}@${new URL(config.origin).hostname}>`,
            subject: 'New ELTONEX project enquiry',
            text: `Name: ${row.name}\nEmail: ${row.email}\nServices: ${JSON.parse(row.services).join(', ') || 'Not specified'}\nTiming: ${row.timing || 'Not specified'}\n\n${row.message}\n\nManage this enquiry: ${config.origin}/admin/`
          });
          db.prepare("UPDATE enquiries SET notification = 'sent', attempts = attempts + 1 WHERE id = ?").run(row.id);
        } catch {
          const attempts = row.attempts + 1;
          db.prepare('UPDATE enquiries SET notification = ?, attempts = ?, next_attempt = ? WHERE id = ?')
            .run(attempts >= 5 ? 'failed' : 'pending', attempts, Date.now() + 60_000 * 2 ** attempts, row.id);
        }
      }
    } finally { notifying = false; }
  }
  return { app, db, deliverNotifications, close: () => db.close() };
}
module.exports = { createApp };
