const path = require('node:path');
const nodemailer = require('nodemailer');
const { createApp } = require('./app.cjs');
const env = process.env;
const port = Number(env.PORT || 4174);
const production = env.NODE_ENV === 'production';
const origin = new URL(env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`).origin;
const passwordHash = env.ADMIN_PASSWORD_HASH || '';
if (passwordHash && !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash)) throw new Error('Invalid ADMIN_PASSWORD_HASH. Run npm run admin:password.');
if (production && (!passwordHash || !origin.startsWith('https://') || !env.PUBLIC_ORIGIN || !env.DATA_DIR)) {
  throw new Error('Production requires ADMIN_PASSWORD_HASH, an HTTPS PUBLIC_ORIGIN and a persistent DATA_DIR.');
}
const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM);
if (env.SMTP_HOST && !smtpConfigured) throw new Error('Complete SMTP_USER, SMTP_PASS and MAIL_FROM before enabling SMTP.');
const transport = smtpConfigured ? nodemailer.createTransport({
  host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === 'true',
  requireTLS: env.SMTP_SECURE !== 'true', auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000
}) : null;
const runtime = createApp({
  dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '../data')), origin,
  adminEmail: env.ADMIN_EMAIL || 'eltonw482@gmail.com', passwordHash,
  secure: production || origin.startsWith('https://'), trustProxyHops: Number(env.TRUST_PROXY_HOPS || 0),
  mailFrom: env.MAIL_FROM, notifyEmail: env.NOTIFY_EMAIL || 'eltonw482@gmail.com',
  sendMail: transport ? mail => transport.sendMail(mail) : null
});
// Persist first, notify separately. Pending notifications survive a server restart.
const timer = setInterval(() => runtime.deliverNotifications().catch(() => console.error('Notification queue unavailable.')), 15000);
timer.unref();
const server = runtime.app.listen(port, env.HOST || (production ? '0.0.0.0' : '127.0.0.1'), () => {
  console.log(`ELTONEX: ${origin}\nEnquiry inbox: ${origin}/admin/`);
  if (!passwordHash) console.log('Admin login is disabled until ADMIN_PASSWORD_HASH is configured.');
  if (!smtpConfigured) console.log('Email notifications are not configured. Enquiries are saved in the database.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  clearInterval(timer);
  server.close(() => process.exit(0));
});
