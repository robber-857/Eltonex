(() => {
  const body = document.body;
  const header = document.querySelector('[data-header]');
  const progress = document.querySelector('[data-scroll-progress]');
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const heroVideo = document.querySelector('[data-hero-video]');
  const videoControl = document.querySelector('[data-video-control]');

  document.querySelectorAll('[data-year]').forEach((node) => {
    node.textContent = new Date().getFullYear();
  });

  const activePage = body.dataset.page;
  const activeNav = document.querySelector(`[data-nav="${activePage}"]`);
  if (activeNav) activeNav.classList.add('active');

  const syncScroll = () => {
    const y = window.scrollY;
    if (header) header.classList.toggle('scrolled', y > 24);
    if (progress) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    }
  };
  syncScroll();
  window.addEventListener('scroll', syncScroll, { passive: true });

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
      const open = menuToggle.getAttribute('aria-expanded') !== 'true';
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      mobileMenu.classList.toggle('open', open);
      mobileMenu.setAttribute('aria-hidden', String(!open));
      body.classList.toggle('menu-open', open);
    });
  }

  if (heroVideo) {
    if (reduceMotion) heroVideo.pause();
    heroVideo.addEventListener('canplay', () => body.classList.add('video-ready'), { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) heroVideo.pause();
      else if (!reduceMotion && videoControl?.getAttribute('aria-pressed') !== 'true') heroVideo.play().catch(() => {});
    });
  }

  if (heroVideo && videoControl) {
    videoControl.addEventListener('click', () => {
      const paused = !heroVideo.paused;
      if (paused) heroVideo.pause();
      else heroVideo.play().catch(() => {});
      videoControl.setAttribute('aria-pressed', String(paused));
      videoControl.setAttribute('aria-label', paused ? 'Play background motion' : 'Pause background motion');
      const label = videoControl.querySelector('span');
      if (label) label.textContent = paused ? 'Play motion' : 'Pause motion';
    });
  }

  const reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach((node) => node.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .12, rootMargin: '0px 0px -7% 0px' });
    reveals.forEach((node) => observer.observe(node));
  }

  const typeNode = document.querySelector('[data-typewriter]');
  if (typeNode && !reduceMotion) {
    let words;
    try { words = JSON.parse(typeNode.dataset.words); } catch { words = ['websites.', 'apps.', 'systems.', 'AI workflows.']; }
    let wordIndex = 0;
    let charIndex = words[0].length;
    let deleting = true;
    const tick = () => {
      const current = words[wordIndex];
      charIndex += deleting ? -1 : 1;
      typeNode.textContent = current.slice(0, charIndex);
      let delay = deleting ? 42 : 72;
      if (!deleting && charIndex === current.length) {
        deleting = true;
        delay = 1500;
      } else if (deleting && charIndex === 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % words.length;
        delay = 260;
      }
      window.setTimeout(tick, delay);
    };
    window.setTimeout(tick, 2200);
  }

  const portraitScene = document.querySelector('[data-portrait-scene]');
  if (portraitScene && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    portraitScene.addEventListener('pointermove', (event) => {
      const rect = portraitScene.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      const frame = portraitScene.querySelector('.portrait-frame');
      if (frame) frame.style.transform = `rotate(${1.5 + x * 2}deg) translate3d(${x * 8}px, ${y * 8}px, 0)`;
    });
    portraitScene.addEventListener('pointerleave', () => {
      const frame = portraitScene.querySelector('.portrait-frame');
      if (frame) frame.style.transform = '';
    });
  }

  const form = document.querySelector('[data-project-form]');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const status = form.querySelector('[data-form-status]');
      const name = new FormData(form).get('name');
      if (status) {
        status.textContent = `Thanks${name ? `, ${name}` : ''}. This is the preview interaction—connect your preferred inbox before launch.`;
        status.classList.add('success');
      }
      form.querySelector('button[type="submit"]')?.setAttribute('disabled', 'true');
    });
  }
})();
