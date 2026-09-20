(() => {
  const body = document.body;
  const header = document.querySelector('[data-header]');
  const progress = document.querySelector('[data-scroll-progress]');
  const menuToggle = document.querySelector('[data-menu-toggle]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = motionPreference.matches;

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
    mobileMenu.id ||= 'mobile-navigation';
    menuToggle.setAttribute('aria-controls', mobileMenu.id);
    const setMenuOpen = (open, restoreFocus = false) => {
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      mobileMenu.classList.toggle('open', open);
      mobileMenu.setAttribute('aria-hidden', String(!open));
      mobileMenu.inert = !open;
      body.classList.toggle('menu-open', open);
      if (open) mobileMenu.querySelector('a[href]')?.focus();
      else if (restoreFocus) menuToggle.focus();
    };
    setMenuOpen(false);
    menuToggle.addEventListener('click', () => {
      setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true');
    });
    mobileMenu.addEventListener('click', (event) => {
      if (event.target.closest('a[href]')) setMenuOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (menuToggle.getAttribute('aria-expanded') !== 'true') return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false, true);
      } else if (event.key === 'Tab') {
        const controls = [menuToggle, ...mobileMenu.querySelectorAll('a[href], button:not([disabled])')];
        const index = controls.indexOf(document.activeElement);
        const nextIndex = event.shiftKey
          ? (index <= 0 ? controls.length - 1 : index - 1)
          : (index + 1) % controls.length;
        event.preventDefault();
        controls[nextIndex]?.focus();
      }
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', (event) => {
      if (event.matches) setMenuOpen(false);
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
  const typeReserve = typeNode?.querySelector('.type-reserve');
  const typeContent = typeNode?.querySelector('[data-type-content]');
  if (typeNode && typeReserve && typeContent) {
    // The complete, accessible copy also reserves the paragraph's final layout.
    const characters = Array.from(typeReserve.textContent.trim());
    let charIndex = 0;
    let timer = null;
    let visible = !('IntersectionObserver' in window);
    let complete = false;
    let typeObserver;
    const stop = () => {
      window.clearTimeout(timer);
      timer = null;
    };
    const finish = () => {
      stop();
      complete = true;
      typeContent.textContent = characters.join('');
      typeNode.classList.remove('is-typing');
      typeNode.classList.add('is-typed');
      typeObserver?.disconnect();
      document.removeEventListener('visibilitychange', syncTyping);
      motionPreference.removeEventListener('change', syncTyping);
    };
    const tick = () => {
      timer = null;
      if (complete || document.hidden || !visible) return;
      charIndex += 1;
      typeContent.textContent = characters.slice(0, charIndex).join('');
      if (charIndex >= characters.length) {
        finish();
        return;
      }
      const lastCharacter = characters[charIndex - 1];
      const delay = /[.!?]/.test(lastCharacter) ? 170 : /[,;:]/.test(lastCharacter) ? 70 : 26;
      timer = window.setTimeout(tick, delay);
    };
    const syncTyping = () => {
      if (complete) return;
      if (motionPreference.matches) {
        finish();
      } else if (document.hidden || !visible) {
        stop();
      } else if (timer === null) {
        typeNode.classList.add('is-typing');
        tick();
      }
    };
    if (!visible) {
      typeObserver = new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        syncTyping();
      }, { threshold: .15 });
      typeObserver.observe(typeNode);
    }
    document.addEventListener('visibilitychange', syncTyping);
    motionPreference.addEventListener('change', syncTyping);
    syncTyping();
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
