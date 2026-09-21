import { createHandler } from './handler.mjs';

function defaultKey(name: string) {
  const value = Deno.env.get(name);
  return value ? JSON.parse(value).default : undefined;
}
const handler = createHandler({
  url: Deno.env.get('SUPABASE_URL'),
  serviceKey: defaultKey('SUPABASE_SECRET_KEYS') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  publicKey: defaultKey('SUPABASE_PUBLISHABLE_KEYS') || Deno.env.get('SUPABASE_ANON_KEY'),
  siteUrl: Deno.env.get('PUBLIC_SITE_URL'),
  allowedOrigins: Deno.env.get('ALLOWED_ORIGINS') || '',
  resendKey: Deno.env.get('RESEND_API_KEY'),
  mailFrom: Deno.env.get('MAIL_FROM'),
  notifyEmail: Deno.env.get('NOTIFY_EMAIL') || 'eltonw482@gmail.com',
});
Deno.serve(handler);
