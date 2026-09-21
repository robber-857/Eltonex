(() => {
  const $ = selector => document.querySelector(selector);
  const PAGE_SIZE = 5;
  let page = 1, selectedId = null, items = [], notificationsConfigured = false, loading = false;
  function message(text, error = false) { $('#status').textContent = text; $('#status').dataset.error = String(error); }
  function loginView() { $('#login-panel').hidden = false; $('#inbox').hidden = true; $('#logout').hidden = true; $('#enquiries').replaceChildren(); $('#detail').replaceChildren(); items = []; }
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000) });
    const result = await response.json();
    if (!response.ok) { if (response.status === 401) loginView(); throw new Error(result.error || 'Please try again.'); }
    return result;
  }
  function element(tag, text, className) { const el = document.createElement(tag); el.textContent = text; if (className) el.className = className; return el; }
  function date(value) { return new Date(value).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }); }
  function detail(row) {
    selectedId = row.id;
    for (const button of $('#enquiries').children) button.setAttribute('aria-pressed', String(button.dataset.id === row.id));
    const panel = $('#detail'); panel.replaceChildren();
    panel.append(element('h2', row.name));
    const email = element('a', row.email); email.href = `mailto:${encodeURIComponent(row.email)}`; panel.append(email);
    const dl = document.createElement('dl');
    for (const [key, value] of [['Received', date(row.created_at)], ['Services', row.services.join(', ') || 'Not specified'], ['Timing', row.timing || 'Not specified'], ['Notification', row.notification === 'pending' && !notificationsConfigured ? 'Waiting for email setup' : row.notification]]) dl.append(element('dt', key), element('dd', value));
    panel.append(dl, element('p', row.message, 'message'));
    if (['pending', 'failed', 'sending'].includes(row.notification) && notificationsConfigured) {
      const retry = element('button', 'Send / retry email notification');
      retry.addEventListener('click', async () => { retry.disabled = true; try { await api(`/api/admin/enquiries/${row.id}/retry`, {method: 'POST', body: '{}'}); await load(); message('Notification requested. Check its delivery status.'); } catch (error) { message(error.message, true); } finally { retry.disabled = false; } });
      panel.append(retry);
    }
    const form = document.createElement('form'), statusLabel = element('label', 'Follow-up status'), select = document.createElement('select');
    for (const value of ['new', 'contacted', 'closed']) { const option = element('option', value[0].toUpperCase() + value.slice(1)); option.value = value; select.append(option); } select.value = row.status; statusLabel.append(select);
    const notesLabel = element('label', 'Private notes'), notes = document.createElement('textarea'); notes.rows = 4; notes.maxLength = 5000; notes.value = row.notes; notesLabel.append(notes);
    const actions = element('div', '', 'detail-actions'), save = element('button', 'Save changes', 'primary'); save.type = 'submit';
    const reply = element('a', 'Reply by email ↗'); reply.href = `mailto:${encodeURIComponent(row.email)}?subject=${encodeURIComponent('Re: Your ELTONEX project enquiry')}`;
    actions.append(save, reply); form.append(statusLabel, notesLabel, actions); panel.append(form);
    const remove = element('button', 'Delete enquiry', 'delete-enquiry');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (loading || !window.confirm(`Delete the enquiry from ${row.name}? This permanently removes its details and notes and cannot be undone.`)) return;
      remove.disabled = true;
      try {
        await api(`/api/admin/enquiries/${row.id}`, { method: 'DELETE' });
        selectedId = null;
        panel.replaceChildren(element('p', 'Enquiry deleted.', 'muted'));
        await load();
        message('Enquiry deleted.');
      } catch (error) { message(error.message, true); }
      finally { remove.disabled = false; }
    });
    panel.append(remove);
    form.addEventListener('submit', async event => { event.preventDefault(); save.disabled = true; try { await api(`/api/admin/enquiries/${row.id}`, { method: 'PATCH', body: JSON.stringify({status: select.value, notes: notes.value}) }); await load(); message('Changes saved.'); } catch (error) { message(error.message, true); } finally { save.disabled = false; } });
  }
  async function load() {
    if (loading) return;
    loading = true;
    try {
      const params = new URLSearchParams(new FormData($('#filters'))); params.set('page', page);
      let result = await api(`/api/admin/enquiries?${params}`);
      const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (page > lastPage) {
        page = lastPage; params.set('page', page);
        result = await api(`/api/admin/enquiries?${params}`);
      }
      items = result.items;
      $('#count').textContent = `${result.total} ${result.total === 1 ? 'enquiry' : 'enquiries'}`;
      $('#page-number').textContent = `Page ${page} of ${Math.max(1, Math.ceil(result.total / PAGE_SIZE))}`;
      $('#previous').disabled = page <= 1; $('#next').disabled = page * PAGE_SIZE >= result.total;
      $('#enquiries').replaceChildren();
      if (!items.length) $('#enquiries').append(element('p', 'No enquiries match this view.', 'muted'));
      for (const row of items) {
        const button = element('button', '', 'enquiry'); button.dataset.id = row.id; button.setAttribute('aria-pressed', 'false');
        const top = element('span', '', 'enquiry-top'); top.append(element('strong', row.name), element('span', row.status, 'badge'));
        button.append(top, element('small', date(row.created_at)), element('span', row.message, 'excerpt'));
        button.addEventListener('click', () => { detail(row); if (innerWidth <= 800) $('#detail').scrollIntoView({behavior: 'instant', block: 'start'}); }); $('#enquiries').append(button);
      }
      const selected = items.find(row => row.id === selectedId);
      if (selected) detail(selected); else { selectedId = null; $('#detail').replaceChildren(element('p', 'Select an enquiry to view the details.', 'muted')); }
    } finally { loading = false; }
  }
  async function workspace() {
    const session = await api('/api/admin/session'); notificationsConfigured = session.notificationsConfigured;
    $('#login-panel').hidden = true; $('#inbox').hidden = false; $('#logout').hidden = false;
    $('#notification-note').textContent = notificationsConfigured ? 'New enquiries trigger email notifications. Check delivery status here and retry any pending or failed notifications.' : 'Enquiries are saved here. Email notifications are not configured yet.';
    await load(); message('');
  }
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
    try { const data = new FormData(event.target); await api('/api/admin/login', {method: 'POST', body: JSON.stringify(Object.fromEntries(data))}); event.target.reset(); await workspace(); } catch (error) { message(error.message, true); } finally { button.disabled = false; }
  });
  $('#logout').addEventListener('click', async () => { try { await api('/api/admin/logout', {method: 'POST', body: '{}'}); loginView(); message('Signed out.'); } catch (error) { message(error.message, true); } });
  $('#filters').addEventListener('submit', event => { event.preventDefault(); if (loading) return; page = 1; load().catch(error => message(error.message, true)); });
  $('#refresh').addEventListener('click', () => load().catch(error => message(error.message, true)));
  $('#previous').addEventListener('click', () => { if (loading) return; if (page > 1) page--; load().catch(error => message(error.message, true)); });
  $('#next').addEventListener('click', () => { if (loading) return; page++; load().catch(error => message(error.message, true)); });
  workspace().catch(error => { loginView(); message(error.message === 'Please sign in.' ? '' : error.message, error.message !== 'Please sign in.'); });
})();
