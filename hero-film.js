(() => {
  const hero = document.querySelector('.hero-launch');
  const film = hero?.querySelector('[data-hero-film]');
  if (!hero || !film) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const sources = [...film.querySelectorAll('source')];
  let observer;
  let active = false;
  let inView = false;
  let sourceLoaded = Boolean(film.getAttribute('src') || sources.some((source) => source.hasAttribute('src')));
  let pending = false;
  let blocked = false;
  let failed = false;
  let attempt = 0;

  film.autoplay = false;
  film.removeAttribute('autoplay');
  film.muted = true;
  film.defaultMuted = true;
  film.playsInline = true;
  film.preload = sourceLoaded ? 'metadata' : 'none';

  const setState = (state) => { film.dataset.filmState = state; };
  const staticPreferred = () => motion.matches || connection?.saveData === true;
  const eligible = () => active && inView && !document.hidden && !staticPreferred();
  const pause = (state) => {
    attempt += 1;
    pending = false;
    film.pause();
    setState(state);
  };
  const onFailure = () => {
    failed = true;
    pause('unavailable');
  };

  const play = async () => {
    if (pending || !eligible() || failed || blocked) return;
    if (!sourceLoaded) {
      sources.forEach((source) => {
        if (source.dataset.src) source.src = source.dataset.src;
      });
      if (!sources.some((source) => source.hasAttribute('src'))) {
        onFailure();
        return;
      }
      sourceLoaded = true;
      film.preload = 'metadata';
      film.load();
    }
    if (!film.paused) return;
    const currentAttempt = ++attempt;
    pending = true;
    setState('loading');
    try {
      await film.play();
      if (currentAttempt !== attempt) return;
      pending = false;
      if (eligible() && !film.paused) setState('playing');
    } catch (error) {
      if (currentAttempt !== attempt) return;
      pending = false;
      if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
        blocked = true;
        setState('poster');
      } else {
        onFailure();
      }
    }
  };

  const sync = () => {
    if (!active) return;
    if (staticPreferred()) {
      pause('poster');
      // The CSS poster remains visible; returning to motion starts at the opening frame.
      if (film.readyState > 0 && film.currentTime !== 0) film.currentTime = 0;
    } else if (!inView || document.hidden) {
      pause(failed ? 'unavailable' : sourceLoaded ? 'paused' : 'poster');
    } else if (failed) {
      setState('unavailable');
    } else if (blocked) {
      setState('poster');
    } else {
      void play();
    }
  };
  const onPlaying = () => {
    if (eligible()) setState('playing');
    else sync();
  };
  const retryAfterInteraction = (event) => {
    if (!event.isTrusted || !blocked || !eligible()) return;
    blocked = false;
    void play();
  };
  const measureVisibility = () => {
    const rect = hero.getBoundingClientRect();
    inView = rect.bottom > 0 && rect.top < window.innerHeight
      && rect.right > 0 && rect.left < window.innerWidth;
    sync();
  };

  const activate = () => {
    if (active) return;
    active = true;
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('pointerdown', retryAfterInteraction, { passive: true });
    document.addEventListener('keydown', retryAfterInteraction);
    motion.addEventListener('change', sync);
    connection?.addEventListener?.('change', sync);
    film.addEventListener('playing', onPlaying);
    film.addEventListener('error', onFailure);
    sources.forEach((source) => source.addEventListener('error', onFailure));
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        sync();
      });
      observer.observe(hero);
    } else {
      window.addEventListener('scroll', measureVisibility, { passive: true });
      window.addEventListener('resize', measureVisibility, { passive: true });
    }
    measureVisibility();
  };
  const deactivate = () => {
    active = false;
    observer?.disconnect();
    observer = undefined;
    document.removeEventListener('visibilitychange', sync);
    document.removeEventListener('pointerdown', retryAfterInteraction);
    document.removeEventListener('keydown', retryAfterInteraction);
    motion.removeEventListener('change', sync);
    connection?.removeEventListener?.('change', sync);
    film.removeEventListener('playing', onPlaying);
    film.removeEventListener('error', onFailure);
    sources.forEach((source) => source.removeEventListener('error', onFailure));
    window.removeEventListener('scroll', measureVisibility);
    window.removeEventListener('resize', measureVisibility);
    pause(staticPreferred() ? 'poster' : failed ? 'unavailable' : sourceLoaded ? 'paused' : 'poster');
  };
  const onPageShow = (event) => {
    if (event.persisted) activate();
  };
  const onPageHide = (event) => {
    deactivate();
    if (!event.persisted) {
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('pagehide', onPageHide);
    }
  };

  setState('poster');
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('pagehide', onPageHide);
  activate();
})();
