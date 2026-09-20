(() => {
  const navigation = document.querySelector('[data-service-tabs]');
  if (!navigation) return;
  const tabs = Array.from(navigation.querySelectorAll('[data-service-tab]'));
  const panels = Array.from(document.querySelectorAll('[data-service-panel]'));
  const validIds = new Set(panels.map(panel => panel.id));

  // Without JavaScript every service remains readable and anchor links still work.
  navigation.setAttribute('role', 'tablist');
  tabs.forEach(tab => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', tab.dataset.serviceTab);
  });
  panels.forEach(panel => {
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'tab-' + panel.id);
    panel.tabIndex = 0;
  });

  const activate = (id) => {
    if (!validIds.has(id)) return;
    tabs.forEach(tab => {
      const selected = tab.dataset.serviceTab === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.id !== id; });
  };
  const select = (id) => {
    activate(id);
    if (window.location.hash !== '#' + id) history.pushState(null, '', '#' + id);
  };
  const syncHash = () => activate(window.location.hash.slice(1) || panels[0].id);
  document.body.classList.add('services-interactive');
  activate(validIds.has(window.location.hash.slice(1)) ? window.location.hash.slice(1) : panels[0].id);

  navigation.addEventListener('click', event => {
    const tab = event.target.closest('[data-service-tab]');
    if (!tab) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    select(tab.dataset.serviceTab);
  });
  navigation.addEventListener('keydown', event => {
    const tab = event.target.closest('[data-service-tab]');
    if (!tab) return;
    const index = tabs.indexOf(tab);
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (event.key === ' ') {
      event.preventDefault();
      select(tab.dataset.serviceTab);
      return;
    } else return;
    event.preventDefault();
    select(tabs[next].dataset.serviceTab);
    tabs[next].focus({ preventScroll: true });
  });
  document.querySelectorAll('[data-service-jump]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      select(link.dataset.serviceJump);
      navigation.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      tabs.find(tab => tab.dataset.serviceTab === link.dataset.serviceJump).focus({ preventScroll: true });
    });
  });
  window.addEventListener('hashchange', syncHash);
  window.addEventListener('popstate', syncHash);
})();
