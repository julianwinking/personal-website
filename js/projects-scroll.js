// Scroll-driven project timeline, integrated with FlowFieldPreview.
// A single on-demand rAF loop owns activation, pinning, and the slide;
// card expand/collapse is driven by CSS transitions (see style.css).
//
// Layout model: once the first card reaches the viewport center the page
// content is pinned (position: fixed + translateY). Each project owns
// ACTIVE_SCROLL_DISTANCE px of scroll; after the last project an exit band
// slides Other Projects into view, vertically centered — and the document
// ends exactly there (pageWrap min-height), so the page never scrolls into
// reserved empty space. The only unpin path is scrolling back up past the
// first card, which glides back to the natural position before releasing.
if (history.scrollRestoration) {
  history.scrollRestoration = 'manual';
}

function initProjectScroll() {
  if (window.__projectScrollInitialized) return;

  const links = Array.from(document.querySelectorAll('#selected-projects .project-link'));
  if (links.length === 0) return;

  window.__projectScrollInitialized = true;
  window.scrollTo(0, 0);

  const previewPanel = document.querySelector('.project-preview');
  const pageContent = document.querySelector('.page-content');
  const pageWrap = document.querySelector('.page-wrap');
  const otherProjects = document.getElementById('other-projects');

  if (window.FlowFieldPreview) window.FlowFieldPreview.init();

  const ACTIVATION_Y_RATIO = 0.5;
  const ACTIVE_SCROLL_DISTANCE = 440;
  const MIN_ACTIVE_CARD_HEIGHT = 320; // floor; each card's expanded height fits its content
  const COLLAPSED_CARD_HEIGHT = 104;
  const IDLE_PREVIEW_HEIGHT = 260;
  const CARD_TRANSITION_MS = 600; // keep in sync with the height/details transitions in style.css
  const SLIDE_SMOOTHING = 13; // per-second rate of the slide lerp; higher = snappier
  const SETTLE_EPSILON = 0.3; // px; below this the slide snaps and the loop can stop
  const MIN_SWITCH_INTERVAL_MS = 200; // fast scrolls step through cards one at a time
  const mobileQuery = window.matchMedia('(max-width: 768px)');

  let activeEl = null;
  let pinned = false;
  let currentY = 0;
  let targetY = 0;
  let appliedY = null;
  let timelineStart = null;
  let exitDistance = null;
  let expandedHeights = null;
  let rafId = null;
  let lastFrameTs = 0;
  let animateUntil = 0;
  let lastSwitchTs = 0;

  function getElementDocumentTop(element) {
    let top = 0;
    for (let node = element; node; node = node.offsetParent) top += node.offsetTop || 0;
    return top;
  }

  function getElementTopWithin(element, ancestor) {
    let top = 0;
    for (let node = element; node && node !== ancestor; node = node.offsetParent) top += node.offsetTop || 0;
    return top;
  }

  // Total height currently added by expanding/expanded cards. Exact even
  // mid-transition, since offsetHeight reports the live animated height.
  function getExtraCardHeight() {
    let extra = 0;
    for (const link of links) {
      const card = link.querySelector('.project-container');
      if (card) extra += Math.max(0, card.offsetHeight - COLLAPSED_CARD_HEIGHT);
    }
    return extra;
  }

  // Collapsed-baseline geometry of the card stack: top of card 0 (never
  // affected by expansions, which all happen below it) and the uniform
  // card-to-card spacing, compensated for card 0's live height so the
  // result is stable during transitions.
  function getCardBaseline() {
    const card0 = links[0].querySelector('.project-container');
    const top0 = getElementTopWithin(card0, pageContent);
    let spacing = COLLAPSED_CARD_HEIGHT + 50;
    if (links.length > 1) {
      const card1 = links[1].querySelector('.project-container');
      spacing = getElementTopWithin(card1, pageContent) - top0
        - (card0.offsetHeight - COLLAPSED_CARD_HEIGHT);
    }
    return { top0, spacing };
  }

  // Document Y of the first card's collapsed center. Measured via page-wrap
  // (always in normal flow) so the result stays correct while pinned.
  function getTimelineStart() {
    if (timelineStart === null) {
      const card = links[0].querySelector('.project-container');
      if (card && pageWrap && pageContent) {
        timelineStart = getElementDocumentTop(pageWrap)
          + getElementTopWithin(card, pageContent)
          + COLLAPSED_CARD_HEIGHT / 2;
      } else {
        timelineStart = getElementDocumentTop(links[0]) + links[0].offsetHeight / 2;
      }
    }
    return timelineStart;
  }

  // Center of a card in the settled end state (this card expanded, all
  // others collapsed). Anchoring on the collapsed baseline keeps the slide
  // target constant while neighbours are still animating — aiming at live
  // offsets instead is what caused the overshoot-and-return wiggle.
  // Per-card expanded heights: 2.5rem paddings + title block + details content.
  // scrollHeight/offsetHeight report natural sizes even while clipped, so this
  // is measurable in any state. The JS applies these as inline heights; the
  // CSS .is-expanded height is only a no-JS fallback.
  function getExpandedHeights() {
    if (!expandedHeights) {
      expandedHeights = links.map((link) => {
        const spacer = link.querySelector('.project-title-spacer');
        const inner = link.querySelector('.project-details-inner');
        if (!spacer || !inner) return MIN_ACTIVE_CARD_HEIGHT;
        return Math.max(
          MIN_ACTIVE_CARD_HEIGHT,
          80 + spacer.offsetHeight + 8 + inner.scrollHeight + 2
        );
      });
    }
    return expandedHeights;
  }

  function getFinalCardCenterInContent(linkEl) {
    const { top0, spacing } = getCardBaseline();
    const index = links.indexOf(linkEl);
    return top0 + index * spacing + getExpandedHeights()[index] / 2;
  }

  // Center of Other Projects in the settled end state (last card expanded).
  function getOtherProjectsFinalCenter() {
    if (!otherProjects || !pageContent) return 0;
    return getElementTopWithin(otherProjects, pageContent)
      - getExtraCardHeight()
      + (getExpandedHeights()[links.length - 1] - COLLAPSED_CARD_HEIGHT)
      + otherProjects.offsetHeight / 2;
  }

  // Scroll length of the exit band: the 1:1 slide from "last card centered"
  // to "Other Projects centered".
  function getExitDistance() {
    if (exitDistance === null) {
      if (!otherProjects || !pageContent) return 0;
      exitDistance = Math.max(0, Math.round(
        getOtherProjectsFinalCenter() - getFinalCardCenterInContent(links[links.length - 1])
      ));
    }
    return exitDistance;
  }

  // The document ends exactly where the exit band ends, so the pinned
  // sequence is the tail of the page and no reserved blank space is ever
  // reachable. pageWrap's min-height provides the scroll length.
  function syncWrapMinHeight() {
    if (!pageWrap) return;

    if (mobileQuery.matches) {
      pageWrap.style.removeProperty('min-height');
      return;
    }

    const endScrollY = getTimelineStart()
      + links.length * ACTIVE_SCROLL_DISTANCE
      + getExitDistance()
      - window.innerHeight * ACTIVATION_Y_RATIO;
    const requiredHeight = Math.round(endScrollY + window.innerHeight - getElementDocumentTop(pageWrap));
    pageWrap.style.minHeight = `${Math.max(0, requiredHeight)}px`;
  }

  function applyTransform() {
    if (currentY === appliedY) return;
    appliedY = currentY;
    pageContent.style.transform = `translate3d(0, ${currentY.toFixed(2)}px, 0)`;
  }

  // Pin seamlessly: the fixed layer starts exactly where the content sits in
  // normal flow, so nothing shifts on the frame the pin engages. The slide
  // lerp then glides it toward the centered position.
  function pinContent() {
    if (pinned || !pageContent || !pageWrap) return;

    const wrapRect = pageWrap.getBoundingClientRect();
    currentY = wrapRect.top;
    appliedY = null;
    pageContent.classList.add('sequence-pinned');
    pageContent.style.left = `${Math.round(wrapRect.left)}px`;
    pageContent.style.width = `${Math.round(wrapRect.width)}px`;
    applyTransform();
    pinned = true;
  }

  function unpinContent() {
    if (!pinned) return;
    pinned = false;
    appliedY = null;
    pageContent.classList.remove('sequence-pinned');
    pageContent.style.removeProperty('transform');
    pageContent.style.removeProperty('left');
    pageContent.style.removeProperty('width');
  }

  function setActive(linkEl) {
    if (activeEl === linkEl) return;

    if (activeEl) {
      activeEl.classList.remove('active', 'is-expanded');
      const prevCard = activeEl.querySelector('.project-container');
      if (prevCard) prevCard.style.removeProperty('height');
    }
    activeEl = linkEl;
    animateUntil = performance.now() + CARD_TRANSITION_MS + 220;

    if (linkEl) {
      const index = links.indexOf(linkEl);
      const height = getExpandedHeights()[index];
      linkEl.classList.add('active', 'is-expanded');
      const card = linkEl.querySelector('.project-container');
      if (card && !mobileQuery.matches) card.style.height = `${height}px`;
      if (window.FlowFieldPreview) window.FlowFieldPreview.setPattern(index);
      if (previewPanel) previewPanel.style.height = `${height}px`;
    } else {
      if (window.FlowFieldPreview) window.FlowFieldPreview.setIdle();
      if (previewPanel) previewPanel.style.height = `${IDLE_PREVIEW_HEIGHT}px`;
    }
  }

  function frame(ts) {
    rafId = null;
    const dt = lastFrameTs ? Math.min(0.05, (ts - lastFrameTs) / 1000) : 1 / 60;
    lastFrameTs = ts;

    const isMobile = mobileQuery.matches;
    const progress = window.scrollY + window.innerHeight * ACTIVATION_Y_RATIO - getTimelineStart();
    const total = links.length * ACTIVE_SCROLL_DISTANCE;
    const inTimeline = !isMobile && progress >= 0;

    // Desktop: activate the card the scroll position asks for — but never
    // skip cards: a fast fling steps through intermediates one at a time.
    // Mobile is tap-driven (accordion): scrolling must never mutate layout,
    // since iOS Safari has no scroll anchoring and every height change
    // would jump the page under the user's finger.
    if (!isMobile) {
      const desiredLink = inTimeline
        ? links[Math.min(links.length - 1, Math.floor(Math.min(progress, total - 1) / ACTIVE_SCROLL_DISTANCE))]
        : null;
      const desiredIndex = desiredLink ? links.indexOf(desiredLink) : -1;
      const currentIndex = activeEl ? links.indexOf(activeEl) : -1;

      if (desiredIndex === -1) {
        setActive(null);
      } else if (currentIndex === -1) {
        setActive(links[desiredIndex]);
        lastSwitchTs = ts;
      } else if (desiredIndex !== currentIndex) {
        if (ts - lastSwitchTs >= MIN_SWITCH_INTERVAL_MS) {
          setActive(links[currentIndex + Math.sign(desiredIndex - currentIndex)]);
          lastSwitchTs = ts;
        }
        // Keep the loop alive until activation catches up with the scroll.
        animateUntil = Math.max(animateUntil, ts + MIN_SWITCH_INTERVAL_MS + 100);
      }
    }

    if (isMobile) {
      unpinContent();
    } else if (inTimeline) {
      if (!pinned) pinContent();
      if (progress < total) {
        targetY = window.innerHeight / 2 - getFinalCardCenterInContent(activeEl);
      } else {
        // Exit band: slide 1:1 with the scroll until Other Projects is
        // vertically centered; the document ends exactly there.
        const exitProgress = Math.min(progress - total, getExitDistance());
        targetY = window.innerHeight / 2 - getOtherProjectsFinalCenter()
          + (getExitDistance() - exitProgress);
      }
    } else if (pinned) {
      // Glide back to the natural document position before releasing the pin.
      targetY = pageWrap.getBoundingClientRect().top;
    }

    let sliding = false;
    if (pinned) {
      const delta = targetY - currentY;
      if (Math.abs(delta) <= SETTLE_EPSILON) {
        currentY = targetY;
      } else {
        currentY += delta * (1 - Math.exp(-SLIDE_SMOOTHING * dt));
        sliding = true;
      }
      applyTransform();
      if (!inTimeline && !sliding) unpinContent();
    }

    if (sliding || ts < animateUntil) {
      rafId = requestAnimationFrame(frame);
    } else {
      lastFrameTs = 0;
    }
  }

  function requestFrame() {
    if (rafId === null) rafId = requestAnimationFrame(frame);
  }


  function handleResize() {
    timelineStart = null;
    exitDistance = null;
    expandedHeights = null;
    syncWrapMinHeight();

    if (activeEl) {
      const card = activeEl.querySelector('.project-container');
      if (card) {
        if (mobileQuery.matches) {
          card.style.removeProperty('height');
        } else {
          card.style.height = `${getExpandedHeights()[links.indexOf(activeEl)]}px`;
        }
      }
    }

    if (pinned && pageWrap) {
      const wrapRect = pageWrap.getBoundingClientRect();
      pageContent.style.left = `${Math.round(wrapRect.left)}px`;
      pageContent.style.width = `${Math.round(wrapRect.width)}px`;
      appliedY = null;
      applyTransform();
    }

    if (window.FlowFieldPreview) window.FlowFieldPreview.resize();
    animateUntil = performance.now() + 300;
    requestFrame();
  }

  function scrollToProject(index) {
    const top = getTimelineStart()
      + (index + 0.5) * ACTIVE_SCROLL_DISTANCE
      - window.innerHeight * ACTIVATION_Y_RATIO;
    window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: 'smooth' });
  }

  links.forEach((link, index) => {
    link.addEventListener('click', (event) => {
      if (mobileQuery.matches) {
        // Accordion: tap expands in place, no programmatic scrolling. The
        // expanded card's tap follows its URL; cards without one collapse.
        if (link === activeEl) {
          if (!link.hasAttribute('href')) setActive(null);
          return;
        }
        event.preventDefault();
        setActive(link);
        return;
      }

      if (link === activeEl) return; // active card: follow its URL
      event.preventDefault();
      scrollToProject(index);
    });
  });

  // Arrow keys jump directly between project cards.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (mobileQuery.matches) return;
    const focused = event.target;
    if (focused && (focused.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(focused.tagName))) return;

    const progress = window.scrollY + window.innerHeight * ACTIVATION_Y_RATIO - getTimelineStart();
    const total = links.length * ACTIVE_SCROLL_DISTANCE;
    const down = event.key === 'ArrowDown';

    if (progress < 0) {
      // Above the timeline: down enters the first project, up scrolls natively.
      if (!down) return;
      event.preventDefault();
      scrollToProject(0);
      return;
    }

    event.preventDefault();
    if (progress >= total) {
      // Exit band: up returns to the last project, down settles at the page end.
      if (down) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      } else {
        scrollToProject(links.length - 1);
      }
      return;
    }

    const index = Math.min(links.length - 1, Math.floor(progress / ACTIVE_SCROLL_DISTANCE));
    if (down) {
      if (index >= links.length - 1) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      } else {
        scrollToProject(index + 1);
      }
    } else if (index === 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      scrollToProject(index - 1);
    }
  });

  window.addEventListener('scroll', requestFrame, { passive: true });
  window.addEventListener('resize', handleResize, { passive: true });
  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', handleResize);
  }
  if (document.readyState !== 'complete') {
    window.addEventListener('load', handleResize, { once: true });
  }

  syncWrapMinHeight();
  requestFrame();
}

function bootProjectScroll() {
  let attempts = 0;
  const tryInit = () => {
    try {
      initProjectScroll();
    } catch (error) {
      console.error(error);
    }

    if (!window.__projectScrollInitialized && attempts < 80) {
      attempts++;
      setTimeout(tryInit, 50);
    }
  };

  tryInit();
}

window.initProjectScroll = initProjectScroll;
document.addEventListener('projects:rendered', bootProjectScroll, { once: true });

const selectedProjectsContainer = document.querySelector('[data-project-section="selected"]');
if (selectedProjectsContainer) {
  const projectRenderObserver = new MutationObserver(() => {
    bootProjectScroll();
    if (window.__projectScrollInitialized) projectRenderObserver.disconnect();
  });

  projectRenderObserver.observe(selectedProjectsContainer, { childList: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootProjectScroll, { once: true });
} else {
  bootProjectScroll();
}
