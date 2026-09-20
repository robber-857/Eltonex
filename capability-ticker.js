(() => {
  const ticker = document.querySelector('.capability-ticker');
  const track = ticker?.querySelector('.ticker-track');
  if (!ticker || !track || ticker.dataset.tickerReady) return;

  const items = [...track.children].filter(item => item.matches('.ticker-item'));
  if (!items.length) return;
  ticker.dataset.tickerReady = 'true';

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const requestedSpeed = Number(ticker.dataset.tickerSpeed);
  const speed = Number.isFinite(requestedSpeed) && requestedSpeed > 0 ? requestedSpeed : 32;
  const segments = items.map(item => ({ item, copy: null, width: 0, start: 0 }));
  let circumference = 0;
  let viewportWidth = 0;
  let offset = 0;
  let previousTime = null;
  let frame = null;
  let measureFrame = null;
  let inView = false;
  let pageActive = true;

  const canMove = () => pageActive && inView && !document.hidden && !motion.matches && circumference > 0;
  const stop = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    previousTime = null;
    ticker.dataset.tickerState = motion.matches ? 'static' : 'paused';
  };
  const wrapCopy = (segment) => {
    if (segment.copy) return segment.copy;
    const copy = segment.item.cloneNode(true);
    copy.classList.add('ticker-wrap-copy');
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    track.append(copy);
    segment.copy = copy;
    return copy;
  };
  const render = () => {
    if (!circumference) return;
    segments.forEach(segment => {
      const x = ((segment.start - offset + segment.width) % circumference + circumference) % circumference - segment.width;
      segment.item.style.transform = `translate3d(${x.toFixed(3)}px, 0, 0)`;
      // Only the part already clipped at the left edge is allowed to enter at the right.
      const mirrorX = x + circumference;
      const fragmentVisible = x < 0 && x + segment.width > 0 && mirrorX < viewportWidth;
      if (fragmentVisible) {
        const copy = wrapCopy(segment);
        copy.style.transform = `translate3d(${mirrorX.toFixed(3)}px, 0, 0)`;
        copy.hidden = false;
      } else if (segment.copy) {
        segment.copy.hidden = true;
      }
    });
  };
  const animate = (time) => {
    frame = null;
    if (!canMove()) {
      stop();
      return;
    }
    if (previousTime !== null) {
      offset = (offset + Math.min(time - previousTime, 64) * speed / 1000) % circumference;
    }
    previousTime = time;
    render();
    frame = window.requestAnimationFrame(animate);
  };
  const sync = () => {
    if (!canMove()) {
      stop();
    } else if (frame === null) {
      ticker.dataset.tickerState = 'playing';
      previousTime = null;
      frame = window.requestAnimationFrame(animate);
    }
  };
  const staticLayout = () => {
    stop();
    ticker.classList.remove('is-looping');
    track.style.height = '';
    segments.forEach(segment => {
      segment.item.style.transform = '';
      if (segment.copy) segment.copy.hidden = true;
    });
  };
  const measure = () => {
    measureFrame = null;
    if (motion.matches) {
      staticLayout();
      return;
    }
    ticker.classList.add('is-looping');
    viewportWidth = track.clientWidth;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 32;
    let totalWidth = 0;
    let height = 0;
    segments.forEach(segment => {
      const rect = segment.item.getBoundingClientRect();
      segment.width = rect.width;
      totalWidth += rect.width;
      height = Math.max(height, rect.height);
    });
    const nextCircumference = Math.max(viewportWidth, totalWidth + gap * segments.length);
    offset = circumference > 0 ? offset / circumference * nextCircumference : 0;
    circumference = nextCircumference;
    const spacing = (circumference - totalWidth) / segments.length;
    let start = spacing / 2;
    segments.forEach(segment => {
      segment.start = start;
      start += segment.width + spacing;
    });
    track.style.height = `${Math.ceil(height)}px`;
    render();
    sync();
  };
  const queueMeasure = () => {
    if (measureFrame === null) measureFrame = window.requestAnimationFrame(measure);
  };
  const measureVisibility = () => {
    const rect = ticker.getBoundingClientRect();
    inView = rect.bottom > 0 && rect.top < window.innerHeight;
    sync();
  };

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(queueMeasure);
    resizeObserver.observe(ticker);
  } else {
    window.addEventListener('resize', queueMeasure, { passive: true });
  }
  if ('IntersectionObserver' in window) {
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && entry.intersectionRatio > 0;
      sync();
    }, { threshold: [0, .001] });
    intersectionObserver.observe(ticker);
  } else {
    window.addEventListener('scroll', measureVisibility, { passive: true });
    window.addEventListener('resize', measureVisibility, { passive: true });
  }
  document.addEventListener('visibilitychange', sync);
  motion.addEventListener('change', measure);
  document.fonts?.ready.then(queueMeasure);
  document.fonts?.addEventListener('loadingdone', queueMeasure);
  window.addEventListener('pagehide', () => {
    pageActive = false;
    stop();
  });
  window.addEventListener('pageshow', () => {
    pageActive = true;
    measureVisibility();
    queueMeasure();
  });

  measureVisibility();
  measure();
})();
