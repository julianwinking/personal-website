// Scroll snap + activation, integrated with FlowFieldPreview
document.addEventListener('DOMContentLoaded', () => {
  const links = Array.from(document.querySelectorAll('.project-link'));
  const projectsSection = document.getElementById('projects');
  const previewPanel = document.querySelector('.project-preview');

  // Initialize preview
  if (window.FlowFieldPreview) window.FlowFieldPreview.init();

  let isAnimating = false;
  let engaged = false;
  let activated = false;
  let activeEl = null;

  function syncPreviewHeight(linkEl) {
    if (!previewPanel || !linkEl) return;
    const container = linkEl.querySelector('.project-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const target = Math.max(260, Math.round(rect.height));
    previewPanel.style.height = target + 'px';
    if (window.FlowFieldPreview) window.FlowFieldPreview.resize();
  }

  function setActive(el) {
    if (activeEl === el) return;
    if (activeEl) activeEl.classList.remove('active');
    el.classList.add('active');
    activeEl = el;
    const title = el.querySelector('h3')?.textContent?.trim() || '';
    if (window.FlowFieldPreview) window.FlowFieldPreview.setPattern(title);
    syncPreviewHeight(el);
  }

  function deactivateActive() {
    if (!activeEl) return;
    activeEl.classList.remove('active');
    activeEl = null;
    if (window.FlowFieldPreview) window.FlowFieldPreview.setIdle();
    if (previewPanel) previewPanel.style.height = '260px';
    if (window.FlowFieldPreview) window.FlowFieldPreview.resize();
  }

  function nearTopArea() {
    if (!projectsSection) return true;
    const r = projectsSection.getBoundingClientRect();
    const centerY = window.innerHeight / 2;
    return centerY < r.top - 30;
  }

  function inProjectsViewport() {
    if (!projectsSection) return false;
    const r = projectsSection.getBoundingClientRect();
    const centerY = window.innerHeight / 2;
    return centerY >= r.top - 20 && centerY <= r.bottom + 20;
  }

  function centerScrollTo(linkEl) {
    const rect = linkEl.getBoundingClientRect();
    const CENTER_OFFSET = 50;
    const targetTop = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2 + CENTER_OFFSET;
    window.scrollTo({ top: targetTop, behavior: 'smooth' });
  }

  function getActiveIndex() { return links.indexOf(activeEl); }
  function getNearestIndexToCenter() {
    const viewportMid = window.scrollY + window.innerHeight / 2;
    let bestIdx = 0, bestDist = Infinity;
    links.forEach((l, i) => {
      const r = l.getBoundingClientRect();
      const mid = window.scrollY + r.top + r.height / 2;
      const d = Math.abs(mid - viewportMid);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    return bestIdx;
  }

  function snapToTop() {
    activated = true;
    isAnimating = true;
    deactivateActive();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const start = performance.now();
    const check = () => {
      if (window.scrollY <= 2 || performance.now() - start > 900) {
        isAnimating = false;
        engaged = false;
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }

  function snapToIndex(idx) {
    if (idx < 0 || idx >= links.length) return;
    activated = true; isAnimating = true; engaged = true;
    const link = links[idx];
    setActive(link);
    centerScrollTo(link);
    const start = performance.now();
    const targetCheck = () => {
      const r = link.getBoundingClientRect();
      const err = Math.abs((r.top + r.height / 2) - window.innerHeight / 2);
      if (err < 2 || performance.now() - start > 900) { isAnimating = false; return; }
      requestAnimationFrame(targetCheck);
    };
    requestAnimationFrame(targetCheck);
  }

  // Click: only navigate when already active; otherwise activate + scroll
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      if (link !== activeEl) {
        e.preventDefault();
        activated = true;
        setActive(link);
        link.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  // Wheel snapping
  let wheelAccum = 0, wheelTimer = null;
  function wheelHandler(e) {
    const threshold = 120;
    if (nearTopArea()) {
      wheelAccum += e.deltaY; clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelAccum = 0; }, 250);
      if (wheelAccum > threshold && !isAnimating) {
        e.preventDefault(); snapToIndex(0); wheelAccum = 0;
      }
      return;
    }
    if (!inProjectsViewport()) return;
    if (isAnimating) { e.preventDefault(); return; }
    if (!engaged) return; // allow native scroll before engagement
    e.preventDefault();
    wheelAccum += e.deltaY; clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { wheelAccum = 0; }, 250);
    const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter();
    if (wheelAccum > threshold) { if (idx < links.length - 1) snapToIndex(idx + 1); wheelAccum = 0; }
    else if (wheelAccum < -threshold) { if (idx > 0) snapToIndex(idx - 1); else snapToTop(); wheelAccum = 0; }
  }
  window.addEventListener('wheel', wheelHandler, { passive: false });

  // Touch snapping
  let touchStartY = 0;
  window.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchend', (e) => {
    const threshold = 80;
    if (nearTopArea()) {
      const dyTop = e.changedTouches[0].clientY - touchStartY;
      if (dyTop < -threshold && !isAnimating) { snapToIndex(0); }
      return;
    }
    if (!inProjectsViewport() || isAnimating || !engaged) return;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dy) < threshold) return;
    const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter();
    if (dy < 0) { if (idx < links.length - 1) snapToIndex(idx + 1); }
    else { if (idx > 0) snapToIndex(idx - 1); else snapToTop(); }
  }, { passive: true });

  // Keyboard snapping
  document.addEventListener('keydown', (e) => {
    if (!inProjectsViewport() || isAnimating || (!engaged && !nearTopArea())) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      if (nearTopArea()) snapToIndex(0);
      else { const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter(); if (idx < links.length - 1) snapToIndex(idx + 1); }
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault(); const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter(); if (idx > 0) snapToIndex(idx - 1); else snapToTop();
    }
  });

  // Auto engage when entering the section while scrolling down
  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    if (isAnimating) { lastScrollY = window.scrollY; return; }
    const currY = window.scrollY; const scrollingDown = currY > lastScrollY; lastScrollY = currY;
    if (!activeEl && scrollingDown && inProjectsViewport() && !engaged) { snapToIndex(0); }
  }, { passive: true });

  // Keep preview height synced on scroll/resize when active
  window.addEventListener('scroll', () => { if (activeEl) syncPreviewHeight(activeEl); }, { passive: true });
  window.addEventListener('resize', () => { if (activeEl) syncPreviewHeight(activeEl); if (window.FlowFieldPreview) window.FlowFieldPreview.resize(); }, { passive: true });
});
