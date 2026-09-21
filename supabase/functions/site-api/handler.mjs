const SERVICES = ['Website', 'iOS / Android app', 'Internal system', 'Custom AI agent'];
const TIMINGS = ['', 'As soon as practical', 'Within 1–2 months', 'Within 3–6 months', 'Still exploring'];
const STATUSES = ['new', 'contacted', 'closed'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENQUIRY_FIELDS = 'id,created_at,name,email,services,message,timing,status,notes,notification';
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2,'0')).join('');
}
function clean(value, min, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length >= min && text.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text) ? text : null;
}
export function validateEnquiry(body) {
  const name = clean(body.name,1,100), email = clean(body.email,3,254), message = clean(body.message,10,5000);
  if (body.website || !name || !email || !/^[^\s@<>,;"()]+@[^\s@<>,;"()]+\.[^\s@<>,;"()]+$/.test(email) || !message ||
    !Array.isArray(body.services) || body.services.length > 4 || body.services.some(s => !SERVICES.includes(s)) ||
    !TIMINGS.includes(body.timing) || !UUID.test(body.requestId || '')) throw new HttpError(400, 'Check your name, email and project details (10–5,000 characters).');
  return {name,email,message,services:[...new Set(body.services)],timing:body.timing,requestId:body.requestId};
}
async function readBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'JSON required.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Invalid request.');
  const chunks = []; let size = 0;
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.length;
    if (size > 20000) { await reader.cancel(); throw new HttpError(413, 'Request too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  try { const result = JSON.parse(new TextDecoder().decode(bytes)); if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error(); return result; }
  catch { throw new HttpError(400, 'Invalid request.'); }
}

export function createHandler(config, fetcher = fetch) {
  const origin = config.siteUrl ? new URL(config.siteUrl).origin : '';
  const allowed = new Set([origin, ...(config.allowedOrigins || '').split(',').map(s=>s.trim()).filter(Boolean)]);
  const emailConfigured = Boolean(config.resendKey && config.mailFrom);
  const reply = (body, status = 200, headers = {}) => Response.json(body, {status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  async function db(resource, options = {}) {
    const headers = {apikey:config.serviceKey,'Content-Type':'application/json',...options.headers};
    // Legacy JWT keys require a bearer header; new secret keys authenticate via apikey.
    if (config.serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${config.serviceKey}`;
    const response = await fetcher(`${config.url}/rest/v1/${resource}`, {...options,headers,signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new HttpError(503, 'The enquiry service is temporarily unavailable. Please try again or email us.');
    const text = await response.text();
    return {data:text ? JSON.parse(text) : null, response};
  }
  const rpc = async (name, body) => (await db(`rpc/${name}`, {method:'POST',body:JSON.stringify(body)})).data;
  async function rate(scope, value, maximum) {
    if (!await rpc('eltonex_rate_limit',{bucket:await hash(`${scope}:${value}`),maximum})) throw new HttpError(429,'Too many attempts. Please try again in 15 minutes.');
  }
  function accessToken(request) { return /(?:^|;\s*)eltonex_access=([A-Za-z0-9_.-]+)(?:;|$)/.exec(request.headers.get('cookie') || '')?.[1] || ''; }
  const cookie = (token, maxAge) => `eltonex_access=${token}; Path=/api/admin; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
  async function isAdmin(id) { return (await db(`eltonex_admins?user_id=eq.${encodeURIComponent(id)}&select=user_id&limit=1`)).data.length === 1; }
  async function admin(request) {
    const token = accessToken(request);
    if (!token) throw new HttpError(401,'Please sign in.');
    const tokenHash = await hash(token);
    const sessions = (await db(`eltonex_sessions?token_hash=eq.${tokenHash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id&limit=1`)).data;
    if (!sessions.length) throw new HttpError(401,'Please sign in.');
    const response = await fetcher(`${config.url}/auth/v1/user`, {headers:{apikey:config.publicKey,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new HttpError(401,'Please sign in.');
    const user = await response.json();
    if (user.id !== sessions[0].user_id || !await isAdmin(user.id)) throw new HttpError(403,'This account does not have access to the enquiry inbox.');
    return {user,tokenHash};
  }
  async function notify(id) {
    if (!emailConfigured) return;
    const lease = crypto.randomUUID();
    const rows = await rpc('eltonex_claim_notification',{enquiry_id:id,lease_id:lease});
    if (!rows.length) return;
    const row = rows[0]; let status = 'failed';
    try {
      const result = await fetcher('https://api.resend.com/emails', {method:'POST',
        headers:{Authorization:`Bearer ${config.resendKey}`,'Content-Type':'application/json','Idempotency-Key':`eltonex-enquiry-${row.id}`},signal:AbortSignal.timeout(5000),
        body:JSON.stringify({from:config.mailFrom,to:[config.notifyEmail],reply_to:row.email,subject:'New ELTONEX project enquiry',
          text:`Name: ${row.name}\nEmail: ${row.email}\nServices: ${row.services.join(', ') || 'Not specified'}\nTiming: ${row.timing || 'Not specified'}\n\n${row.message}\n\nManage this enquiry: ${origin}/admin/`})});
      if (result.ok && (await result.json()).id) status = 'sent';
    } catch { /* An enquiry remains saved even when notification fails. */ }
    await db(`eltonex_enquiries?id=eq.${id}&mail_lease=eq.${lease}`,{method:'PATCH',body:JSON.stringify({notification:status,mail_lease:null,mail_lease_until:null})});
  }
  return async request => {
    try {
      if (!config.url || !config.serviceKey || !config.publicKey || !origin.startsWith('https://')) throw new HttpError(503,'The enquiry service is not configured yet. Please contact us by email.');
      const url = new URL(request.url);
      // The edge gateway may include /functions/v1; local tests use the same suffix.
      const match = url.pathname.match(/\/(?:functions\/v1\/)?site-api(\/.*)?$/);
      const route = match?.[1] || '/';
      if (!['GET','HEAD'].includes(request.method) && !allowed.has(request.headers.get('origin'))) throw new HttpError(403,'Please submit from this website.');
      const body = ['POST','PATCH'].includes(request.method) ? await readBody(request) : {};
      if (request.method === 'GET' && route === '/health') {
        await db('eltonex_enquiries?select=id&limit=0'); return reply({ok:true});
      }
      if (request.method === 'POST' && route === '/enquiries') {
        const input = validateEnquiry(body);
        await rate('enquiry-global','all',100); await rate('enquiry-email',input.email.toLowerCase(),5);
        input.hash = await hash(JSON.stringify([input.name,input.email,input.services,input.message,input.timing]));
        const result = await rpc('eltonex_save_enquiry',{input});
        if (result.conflict) throw new HttpError(409,'Your details have changed. Please try submitting again.');
        try { await notify(result.id); } catch { /* Persistence already succeeded; a retry remains available in Admin. */ }
        return reply({ok:true},result.created ? 201 : 200);
      }
      if (request.method === 'POST' && route === '/admin/login') {
        const email = clean(body.email,3,254);
        if (!email || typeof body.password !== 'string' || body.password.length > 256) throw new HttpError(400,'Enter your email and password.');
        await rate('login-global','all',30); await rate('login-email',email.toLowerCase(),5);
        const response = await fetcher(`${config.url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:config.publicKey,'Content-Type':'application/json'},body:JSON.stringify({email,password:body.password}),signal:AbortSignal.timeout(8000)});
        if (!response.ok) throw new HttpError(401,'Email or password is incorrect.');
        const session = await response.json();
        if (!session.user?.id || !await isAdmin(session.user.id)) throw new HttpError(403,'This account does not have access to the enquiry inbox.');
        const seconds = Math.min(session.expires_in || 3600,3600);
        await db('eltonex_sessions',{method:'POST',body:JSON.stringify({token_hash:await hash(session.access_token),user_id:session.user.id,expires_at:new Date(Date.now()+seconds*1000).toISOString()})});
        return reply({ok:true},200,{'Set-Cookie':cookie(session.access_token,seconds)});
      }
      if (route.startsWith('/admin/')) {
        const session = await admin(request);
        if (request.method === 'GET' && route === '/admin/session') return reply({email:session.user.email,notificationsConfigured:emailConfigured});
        if (request.method === 'POST' && route === '/admin/logout') {
          await db(`eltonex_sessions?token_hash=eq.${session.tokenHash}`,{method:'DELETE'});
          return reply({ok:true},200,{'Set-Cookie':cookie('',0)});
        }
        if (request.method === 'GET' && route === '/admin/enquiries') {
          const page = Math.max(1,Math.min(100000,parseInt(url.searchParams.get('page'),10)||1));
          const query = new URLSearchParams({select:ENQUIRY_FIELDS,order:'created_at.desc,id.desc',limit:'5',offset:String((page-1)*5)});
          const status = url.searchParams.get('status'); if (STATUSES.includes(status)) query.set('status',`eq.${status}`);
          const search = (url.searchParams.get('q')||'').slice(0,100).replace(/[\\%_*]/g,' ').trim();
          if (search) query.set('search_text',`ilike.*${search}*`);
          const result = await db(`eltonex_enquiries?${query}`,{headers:{Prefer:'count=exact'}});
          return reply({items:result.data,total:Number(result.response.headers.get('content-range')?.split('/')[1]||0),page});
        }
        const enquiry = route.match(/^\/admin\/enquiries\/([^/]+)(\/retry)?$/);
        if (enquiry && UUID.test(enquiry[1])) {
          if (request.method === 'DELETE' && !enquiry[2]) {
            const result = await db(`eltonex_enquiries?id=eq.${enquiry[1]}`,{method:'DELETE',headers:{Prefer:'return=representation'}});
            if (!result.data.length) throw new HttpError(404,'Enquiry not found.');
            return reply({ok:true});
          }
          if (request.method === 'PATCH' && !enquiry[2]) {
            const notes = clean(body.notes,0,5000);
            if (!STATUSES.includes(body.status) || notes === null) throw new HttpError(400,'Choose a valid status and notes under 5,000 characters.');
            const result = await db(`eltonex_enquiries?id=eq.${enquiry[1]}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:body.status,notes})});
            if (!result.data.length) throw new HttpError(404,'Enquiry not found.');
            return reply({ok:true});
          }
          if (request.method === 'POST' && enquiry[2]) {
            if (!emailConfigured) throw new HttpError(503,'Configure the email service in Supabase first.');
            await rate('mail-retry',session.user.id,20); await notify(enquiry[1]); return reply({ok:true});
          }
        }
      }
      return reply({error:'Not found.'},404);
    } catch (error) {
      return reply({error:error instanceof HttpError ? error.message : 'The enquiry service is temporarily unavailable. Please try again or email us.'},error instanceof HttpError ? error.status : 503);
    }
  };
}
