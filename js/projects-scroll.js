// Scroll snap + activation, integrated with FlowFieldPreview
if (history.scrollRestoration) {
  history.scrollRestoration = 'manual';
}

document.addEventListener('DOMContentLoaded', () => {
  window.scrollTo(0, 0);
  const links = Array.from(document.querySelectorAll('.project-link'));
  const projectsSection = document.getElementById('selected-projects');
  const previewPanel = document.querySelector('.project-preview');

  // Initialize preview
  if (window.FlowFieldPreview) window.FlowFieldPreview.init();

  let isAnimating = false;
  let isCoolingDown = false;
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
    const index = links.indexOf(el);
    if (window.FlowFieldPreview) window.FlowFieldPreview.setPattern(index);
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
        currentThreshold = 0;
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
      if (err < 2 || performance.now() - start > 900) { 
        isAnimating = false; 
        currentThreshold = 0;
        isCoolingDown = true; setTimeout(() => { isCoolingDown = false; }, 100);
        return; 
      }
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
        engaged = true;
        setActive(link);
        link.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  // Wheel snapping
  let wheelAccum = 0, wheelTimer = null;
  let currentThreshold = 0; // Start with instant reaction

  function wheelHandler(e) {
    // Keep the session alive if scrolling happens, resetting threshold only on full stop
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => { 
      wheelAccum = 0; 
      currentThreshold = 0; 
    }, 250);

    if (nearTopArea()) {
      wheelAccum += e.deltaY;
      if (wheelAccum > currentThreshold && !isAnimating && !isCoolingDown) {
        e.preventDefault(); 
        snapToIndex(0); 
        wheelAccum = 0;
        currentThreshold = 100; // Sticky after switch
      }
      return;
    }

    if (!inProjectsViewport()) return;
    if (isAnimating || isCoolingDown) { e.preventDefault(); return; }
    if (!engaged) return; // allow native scroll before engagement

    e.preventDefault();
    wheelAccum += e.deltaY;

    const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter();
    
    if (wheelAccum > currentThreshold) { 
      if (idx < links.length - 1) {
        snapToIndex(idx + 1); 
        currentThreshold = 100; // Sticky after switch
      }
      wheelAccum = 0; 
    } else if (wheelAccum < -currentThreshold) { 
      if (idx > 0) {
        snapToIndex(idx - 1); 
        currentThreshold = 100; // Sticky after switch
      } else {
        snapToTop();
        currentThreshold = 100;
      }
      wheelAccum = 0; 
    }
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
    const isNavKey = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' '].includes(e.key);
    if (!isNavKey) return;

    if (!inProjectsViewport() && !nearTopArea()) return;

    if (isAnimating) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      if (nearTopArea()) snapToIndex(0);
      else { const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter(); if (idx < links.length - 1) snapToIndex(idx + 1); }
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter(); if (idx > 0) snapToIndex(idx - 1); else snapToTop();
    }
  });

  // Auto engage when entering the section while scrolling down
  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    if (isAnimating) { lastScrollY = window.scrollY; return; }
    const currY = window.scrollY; const scrollingDown = currY > lastScrollY; lastScrollY = currY;
    
    if (!activeEl && scrollingDown && !engaged) {
      // Snap if we are scrolling down from top OR if we reach the viewport
      if ((nearTopArea() && currY > 10) || inProjectsViewport()) {
        snapToIndex(0);
      }
    }
  }, { passive: true });

  // Keep preview height synced on scroll/resize when active
  window.addEventListener('scroll', () => { if (activeEl) syncPreviewHeight(activeEl); }, { passive: true });
  window.addEventListener('resize', () => { if (activeEl) syncPreviewHeight(activeEl); if (window.FlowFieldPreview) window.FlowFieldPreview.resize(); }, { passive: true });
});
