(() => {
  const form = document.querySelector('[data-project-form]');
  if (!form) return;
  const button = form.querySelector('[type="submit"]');
  const status = form.querySelector('[data-form-status]');
  let requestId, lastPayload;
  function feedback(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }
  fetch('/api/health', { signal: AbortSignal.timeout(8000) })
    .then(async response => { if (!response.ok || !(await response.json()).ok) throw new Error(); })
    .then(() => { button.disabled = false; feedback('Send your project details to start a conversation.'); })
    .catch(() => feedback('The enquiry form is temporarily unavailable. Please email eltonw482@gmail.com.', true));
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled || !form.reportValidity()) return;
    const data = new FormData(form);
    const payload = { name: data.get('name'), email: data.get('email'), services: data.getAll('service'), message: data.get('message'), timing: data.get('timing'), website: data.get('website') };
    const serialized = JSON.stringify(payload);
    if (!requestId || serialized !== lastPayload) requestId = crypto.randomUUID();
    lastPayload = serialized;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    feedback('Sending your enquiry…');
    try {
      const response = await fetch('/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, requestId }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (response.status === 409) requestId = null;
        throw new Error(result.error || 'Your enquiry could not be saved. Please try again.');
      }
      form.reset(); requestId = null; lastPayload = null;
      feedback('Thank you. Your enquiry has been received. I’ll reply within 1–2 business days.');
    } catch (error) {
      feedback(error.name === 'TimeoutError' || error instanceof TypeError ? 'We could not confirm your submission. Please retry, or email eltonw482@gmail.com.' : error.message, true);
    } finally { button.disabled = false; form.removeAttribute('aria-busy'); }
  });
})();
