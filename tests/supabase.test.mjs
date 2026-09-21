import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createHandler } from '../supabase/functions/site-api/handler.mjs';

const origin = 'https://eltonex-test.vercel.app';
const userId = 'c9c8d114-98a4-4e65-a8c5-dd7949af884f';
const enquiry = () => ({name:'Sample client',email:'client@example.test',message:'Build an iOS and Android app.',services:['iOS / Android app'],timing:'Still exploring',requestId:crypto.randomUUID(),website:''});
function setup(overrides = {}) {
  const rows = [], sessions = [], calls = [];
  let allowAdmin = true, authValid = true, mailFails = false;
  const config = {url:'https://test.supabase.co',siteUrl:origin,publicKey:'public-test-key',serviceKey:'secret-test-key',notifyEmail:'owner@example.test',...overrides};
  const fetcher = async (url, options = {}) => {
    calls.push({url,options});
    const body = options.body ? JSON.parse(options.body) : {};
    if (url.includes('/auth/v1/token')) return body.password === 'correct-test-password' ? Response.json({access_token:'test.jwt.token',expires_in:3600,user:{id:userId,email:'owner@example.test'}}) : Response.json({}, {status:400});
    if (url.endsWith('/auth/v1/user')) return authValid ? Response.json({id:userId,email:'owner@example.test'}) : Response.json({}, {status:401});
    if (url === 'https://api.resend.com/emails') return Response.json(mailFails ? {error:'test failure'} : {id:'test-message'}, {status:mailFails ? 500 : 200});
    const resource = url.split('/rest/v1/')[1];
    if (resource === 'rpc/eltonex_rate_limit') return Response.json(true);
    if (resource === 'rpc/eltonex_save_enquiry') {
      const existing = rows.find(row=>row.requestId===body.input.requestId);
      if (existing) return Response.json(existing.hash !== body.input.hash ? {conflict:true} : {id:existing.id,created:false});
      const row = {...body.input,id:crypto.randomUUID(),notification:'pending'}; rows.push(row);
      return Response.json({id:row.id,created:true});
    }
    if (resource === 'rpc/eltonex_claim_notification') {
      const row = rows.find(row=>row.id===body.enquiry_id);
      if (!row || row.notification==='sent' || row.notification==='sending') return Response.json([]);
      row.notification='sending'; row.mail_lease=body.lease_id; return Response.json([row]);
    }
    if (resource?.startsWith('eltonex_admins?')) return Response.json(allowAdmin ? [{user_id:userId}] : []);
    if (resource?.startsWith('eltonex_sessions')) {
      if (options.method==='POST') {sessions.push(body);return new Response(null,{status:201});}
      if (options.method==='DELETE') {sessions.length=0;return new Response(null,{status:204});}
      return Response.json(sessions.filter(row=>resource.includes(row.token_hash) && Date.parse(row.expires_at)>Date.now()));
    }
    if (resource?.startsWith('eltonex_enquiries?')) {
      if (options.method==='PATCH') { Object.assign(rows[0],body); return options.headers.Prefer ? Response.json([rows[0]]) : new Response(null,{status:204}); }
      return Response.json(rows, {headers:{'content-range':`0-${rows.length-1}/${rows.length}`}});
    }
    throw new Error(`Unexpected test request ${resource}`);
  };
  const handler = createHandler(config,fetcher);
  const request = (route,method='GET',body,cookie='',source=origin) => handler(new Request(`https://test.supabase.co/functions/v1/site-api${route}`,{method,headers:{Origin:source,'Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  return {request,rows,sessions,calls,setAdmin:value=>allowAdmin=value,setAuth:value=>authValid=value,setMailFailure:value=>mailFails=value};
}

test('edge public submission validates origin and input, persists without email, deduplicates retries', async()=>{
  const f=setup(); const body=enquiry();
  assert.equal((await f.request('/enquiries','POST',body,'','https://attacker.test')).status,403);
  assert.equal((await f.request('/enquiries','POST',{...body,website:'spam'})).status,400);
  assert.equal((await f.request('/enquiries','POST',{...body,message:'x'.repeat(21000)})).status,413);
  assert.equal((await f.request('/enquiries','POST',body)).status,201);
  assert.equal((await f.request('/enquiries','POST',body)).status,200);
  assert.equal((await f.request('/enquiries','POST',{...body,message:'A changed request.'})).status,409);
  assert.equal(f.rows.length,1); assert.equal(f.rows[0].notification,'pending');
  assert.equal(f.calls.filter(call=>call.url.includes('resend.com')).length,0);
});

test('edge admin requires Auth, allowlist and active session; cookies are private and logout revokes access',async()=>{
  const f=setup();
  assert.equal((await f.request('/admin/enquiries')).status,401);
  assert.equal((await f.request('/admin/login','POST',{email:'owner@example.test',password:'wrong'})).status,401);
  f.setAdmin(false);
  assert.equal((await f.request('/admin/login','POST',{email:'owner@example.test',password:'correct-test-password'})).status,403);
  f.setAdmin(true);
  const login=await f.request('/admin/login','POST',{email:'owner@example.test',password:'correct-test-password'});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie');
  for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/api/admin']) assert.ok(cookie.includes(flag));
  assert.equal((await f.request('/admin/session','GET',undefined,cookie)).status,200);
  assert.equal((await f.request('/admin/session','GET',undefined,'eltonex_access=forged.jwt.token')).status,401);
  await f.request('/enquiries','POST',enquiry());
  const listing = await (await f.request('/admin/enquiries?page=1','GET',undefined,cookie)).json();
  assert.equal(listing.total,1);
  assert.equal((await f.request(`/admin/enquiries/${listing.items[0].id}`,'PATCH',{status:'contacted',notes:'Follow up tomorrow'},cookie)).status,200);
  assert.equal(f.rows[0].notes,'Follow up tomorrow');
  f.setAdmin(false); assert.equal((await f.request('/admin/enquiries','GET',undefined,cookie)).status,403); f.setAdmin(true);
  f.setAuth(false); assert.equal((await f.request('/admin/enquiries','GET',undefined,cookie)).status,401); f.setAuth(true);
  assert.equal((await f.request('/admin/logout','POST',{},cookie)).status,200);
  assert.equal((await f.request('/admin/session','GET',undefined,cookie)).status,401);
});

test('Vercel build and edge configuration isolate private source and point to the requested project',async()=>{
  const { existsSync } = await import('node:fs');
  const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(config.outputDirectory,'dist');
  assert.equal(config.rewrites[0].destination,'https://gssdsqqjzqbosrswytak.supabase.co/functions/v1/site-api/:path*');
  const {execFileSync}=await import('node:child_process');
  execFileSync(process.execPath,['scripts/build-static.cjs'],{cwd:new URL('..',import.meta.url)});
  for(const file of ['index.html','admin/index.html','contact.js','assets/wordmark-dark.svg']) assert.ok(existsSync(new URL(`../dist/${file}`,import.meta.url)));
  for(const file of ['.env','server','supabase','output','tests','package.json']) assert.equal(existsSync(new URL(`../dist/${file}`,import.meta.url)),false);
});

test('Resend failure never loses a saved enquiry and retries reuse the idempotency key',async()=>{
  const f=setup({resendKey:'resend-test-key',mailFrom:'site@example.test'}); const body=enquiry(); f.setMailFailure(true);
  assert.equal((await f.request('/enquiries','POST',body)).status,201);
  assert.equal(f.rows[0].notification,'failed');
  f.setMailFailure(false); assert.equal((await f.request('/enquiries','POST',body)).status,200);
  assert.equal(f.rows[0].notification,'sent');
  const sends=f.calls.filter(call=>call.url==='https://api.resend.com/emails');
  assert.equal(sends.length,2); assert.equal(sends[0].options.headers['Idempotency-Key'],sends[1].options.headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(sends[1].options.body).to,['owner@example.test']);
});

test('Postgres migration executes, RLS blocks direct visitors, RPCs enforce idempotency and email claims',async()=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);');
    await db.exec(readFileSync(new URL('../supabase/migrations/202609210001_enquiry_backend.sql',import.meta.url),'utf8'));
    const input={...enquiry(),hash:'test-payload-hash'};
    const save=()=>db.query('select public.eltonex_save_enquiry($1::jsonb) as result',[JSON.stringify(input)]);
    const first=(await save()).rows[0].result; assert.equal(first.created,true);
    assert.equal((await save()).rows[0].result.created,false);
    input.hash='different'; assert.equal((await save()).rows[0].result.conflict,true);
    const claim=()=>db.query('select * from public.eltonex_claim_notification($1::uuid,$2::uuid)',[first.id,crypto.randomUUID()]);
    assert.equal((await claim()).rows.length,1); assert.equal((await claim()).rows.length,0);
    await db.exec("update public.eltonex_enquiries set mail_lease_until=now()-interval '1 minute'");
    assert.equal((await claim()).rows.length,1);
    for (const expected of [true,true,false]) assert.equal((await db.query("select public.eltonex_rate_limit('test-bucket',2) as allowed")).rows[0].allowed,expected);
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from public.eltonex_enquiries'),/permission denied/);
      await assert.rejects(db.query("select public.eltonex_rate_limit('test',2)"),/permission denied/);
      await db.exec('reset role');
    }
    const policies=(await db.query("select relrowsecurity from pg_class where relname in ('eltonex_admins','eltonex_enquiries','eltonex_sessions','eltonex_limits')")).rows;
    assert.equal(policies.length,4); assert.ok(policies.every(row=>row.relrowsecurity));
  } finally {await db.close();}
});
