// Scroll-activated project highlight and preview
document.addEventListener('DOMContentLoaded', () => {
    const links = Array.from(document.querySelectorAll('.project-link'));
    const preview = document.querySelector('.preview-content');
    const previewPanel = document.querySelector('.project-preview');
    const fixedPreview = document.querySelector('.fixed-preview');
    const projectsSection = document.getElementById('projects');

    // Canvas-based generative preview: grid of points with rotating lines
    const canvas = document.createElement('canvas');
    canvas.className = 'preview-canvas';
    if (fixedPreview) {
        fixedPreview.innerHTML = '';
        fixedPreview.appendChild(canvas);
    } else if (preview) {
        preview.innerHTML = '';
        preview.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    const CENTER_OFFSET = 50; // px vertical offset from exact center when snapping

    const state = {
        currentPattern: 'idle',
        targetPattern: 'idle',
        prevPattern: 'idle',
        transitioning: false,
        trans: 1, // 0..1
    transitionDuration: 2000, // ms
        spacing: 16,       // pixel spacing between grid points
        lineLength: 14,    // line length in pixels
        dotRadius: 1.5,    // dot radius
        t: 0,
        lastTs: 0
    };

    const patterns = {
        idle: (x, y, t, W, H) => 0.5 * Math.sin(0.01 * (x + y) + t * 0.8),
        'Bachelor Thesis': (x, y, t, W, H) => {
            const u = x / W, v = y / H;
            const C = [ { cx: 0.28, cy: 0.35 }, { cx: 0.62, cy: 0.55 }, { cx: 0.45, cy: 0.20 } ];
            let vx = 0, vy = 0;
            const sig = 0.18, sig2 = sig * sig;
            for (const c of C) {
                const dx = c.cx - u, dy = c.cy - v;
                const r2 = dx*dx + dy*dy;
                const w = Math.exp(-r2 / (2*sig2));
                vx += dx * w; vy += dy * w;
            }
            const swirl = Math.sin(t * 0.3) * 0.15;
            vx += -(v - 0.5) * swirl; vy += (u - 0.5) * swirl;
            let base = Math.atan2(vy, vx);
            if (!isFinite(base)) base = 0;
            const sigN = 0.12, sigN2 = sigN * sigN;
            let hotspotWeight = 0;
            for (const c of C) {
                const dx = c.cx - u, dy = c.cy - v;
                hotspotWeight += Math.exp(-(dx*dx + dy*dy) / (2*sigN2));
            }
            const s = 0.5 * (1 + Math.sin(t * 0.9));
            const pulse = s * s * (3 - 2 * s);
            const amp = 0.5 * pulse * Math.min(1, hotspotWeight);
            const n = Math.sin((u * 11.3 + v * 7.1) * Math.PI + t * 1.4) + 0.5 * Math.sin((u * 29.7 - v * 13.2) * Math.PI - t * 1.0);
            const delta = amp * n;
            return base + delta;
        },
        'PID Controller Demo': (x, y, t, W, H) => {
            const A = H * 0.18; // amplitude
            const k = (2 * Math.PI) / (W * 0.9);
            const cx = W * 0.5;
            const base = H * 0.5 + A * Math.sin(x * k - t * 1.2) * Math.exp(-Math.pow((x - cx) / (W * 0.7), 2));
            return Math.atan2(base - y, 1);
        },
        'GymTracker': (x, y, t, W, H) => Math.PI / 2 + 0.6 * Math.sin(x * 0.04 + t * 1.5),
        'Banner Injector Extension': (x, y, t, W, H) => 0 + 0.6 * Math.sin(y * 0.05 - t * 1.2),
        'RWTH Notenstreicher': (x, y, t, W, H) => {
            const cx = W * 0.35, cy = H * 0.45;
            const ang = Math.atan2(y - cy, x - cx);
            const r = Math.hypot(x - cx, y - cy);
            return ang + 0.5 * Math.sin(r * 0.05 - t * 1.1);
        },
    };

    // Begin a smooth morph from the current pattern to the target pattern name
    function startTransitionTo(title) {
        const name = patterns[title] ? title : 'idle';
        // If already settled on this pattern, ensure no transition
        if (name === state.currentPattern && !state.transitioning) {
            state.targetPattern = name;
            state.prevPattern = name;
            state.trans = 1;
            state.transitioning = false;
            return;
        }
        state.prevPattern = state.currentPattern;
        state.targetPattern = name;
        state.trans = 0;
        state.transitioning = true;
    }

    // Guarded canvas resize to avoid flicker and match the container size
    function resizeCanvas() {
        const container = fixedPreview || previewPanel;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const cssW = Math.max(1, Math.round(rect.width));
        const cssH = Math.max(1, Math.round(rect.height));
        const pxW = Math.max(1, Math.floor(cssW * dpr));
        const pxH = Math.max(1, Math.floor(cssH * dpr));
        if (canvas.width === pxW && canvas.height === pxH) return;
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        canvas.width = pxW;
        canvas.height = pxH;
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(ts) {
        if (!ctx) { requestAnimationFrame(draw); return; }
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        if (W === 0 || H === 0) { requestAnimationFrame(draw); return; }

        if (!state.lastTs) state.lastTs = ts;
        const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
        state.lastTs = ts;
        state.t += dt;

        ctx.clearRect(0, 0, W, H);

        const spacing = state.spacing;
        const baseLen = state.lineLength;
        const prevFn = patterns[state.prevPattern] || patterns.idle;
        const currFn = patterns[state.currentPattern] || patterns.idle;
        const nextFn = patterns[state.targetPattern] || patterns.idle;

        function lerpAngle(a, b, p) {
            let diff = b - a;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            return a + diff * p;
        }

        function magField(x, y, tNow) {
            const u = x / W, v = y / H;
            const n1 = Math.sin((u * 3.3 + v * 2.7) * Math.PI + tNow * 0.9);
            const n2 = Math.sin((u * 6.9 - v * 4.1) * Math.PI - tNow * 0.6);
            let m = 0.6 + 0.35 * n1 + 0.25 * n2;
            if (m < 0) m = 0; else if (m > 1) m = 1;
            return m;
        }

        function jitter(ix, iy) {
            const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
            return s - Math.floor(s);
        }

        function colorAt(u, v, tNow) {
            const purple = [123, 92, 255];
            const pink   = [255, 92, 172];
            const teal   = [46, 230, 219];
            const blue   = [0, 115, 230];
            const phase = 0.15 * Math.sin(tNow * 0.2);
            const wU = 0.5 * (1 + Math.sin((u * 2.2 + phase) * Math.PI));
            const wV = 0.5 * (1 + Math.sin((v * 2.0 - phase) * Math.PI));
            const wP = (1 - wU) * (1 - wV);
            const wPi = wU * (1 - wV);
            const wT = (1 - wU) * wV;
            const wB = wU * wV;
            const r = Math.round(purple[0] * wP + pink[0] * wPi + teal[0] * wT + blue[0] * wB);
            const g = Math.round(purple[1] * wP + pink[1] * wPi + teal[1] * wT + blue[1] * wB);
            const b = Math.round(purple[2] * wP + pink[2] * wPi + teal[2] * wT + blue[2] * wB);
            return [r, g, b];
        }

        ctx.lineCap = 'round';
        const pTrans = state.transitioning ? Math.max(0, Math.min(1, state.trans)) : 1;
        const segments = 4;

        for (let y = spacing / 2; y <= H - spacing / 2; y += spacing) {
            for (let x = spacing / 2; x <= W - spacing / 2; x += spacing) {
                const ix = Math.round(x / spacing);
                const iy = Math.round(y / spacing);
                const j = jitter(ix, iy);
                const m = magField(x, y, state.t);
                const length = baseLen * (0.7 + 1.1 * m);
                let px = x, py = y;

                const u = x / W, v = y / H;
                const [r, g, b] = colorAt(u, v, state.t);
                const alpha = Math.max(0.15, Math.min(0.95, 0.38 + 0.38 * m + 0.2 * (j - 0.5)));
                ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
                ctx.lineWidth = Math.max(0.6, 0.8 + 1.6 * m + 0.5 * (j - 0.5));

                ctx.beginPath();
                ctx.moveTo(px, py);
                for (let s = 0; s < segments; s++) {
                    let theta;
                    if (state.transitioning) {
                        const a0 = prevFn(px, py, state.t, W, H);
                        const a1 = nextFn(px, py, state.t, W, H);
                        theta = lerpAngle(a0, a1, pTrans);
                    } else {
                        theta = currFn(px, py, state.t, W, H);
                    }
                    const step = length / segments;
                    px += Math.cos(theta) * step;
                    py += Math.sin(theta) * step;
                    ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
        }

        if (state.transitioning) {
            state.trans += dt * (1000 / state.transitionDuration);
            if (state.trans >= 1) {
                state.trans = 1;
                state.transitioning = false;
                state.currentPattern = state.targetPattern;
            }
        }
        requestAnimationFrame(draw);
    }

    function showPreviewFor(title, el) {
        startTransitionTo(title);
        resizeCanvas();
    }

    // Mark the most centered item in viewport as active
    let isAnimating = false;
    let engaged = false; // becomes true after we snap into the projects section once

    function updateActiveByViewport() {
        if (isAnimating) return;
        // If we're above the projects section (hero/top), clear any active selection
        if (nearTopArea()) {
            deactivateActive();
            engaged = false; // leaving projects area disengages snapping
            return;
        }
    // Do not auto-activate by viewport. Activation happens only via snapping/click.
    return;
    }

    let activeEl = null;
    function setActive(el) {
        if (activeEl === el) return;
        if (activeEl) activeEl.classList.remove('active');
        el.classList.add('active');
        activeEl = el;
    const title = el.querySelector('h3')?.textContent?.trim() || '';
    showPreviewFor(title, el);
        // Sync preview panel height to active card
        syncPreviewHeight(el);
    // After height change, ensure canvas fits
    requestAnimationFrame(resizeCanvas);
    }

    function deactivateActive() {
        if (!activeEl) return;
        activeEl.classList.remove('active');
        activeEl = null;
    startTransitionTo('idle');
        // Minimal preview height when no card is active
        if (previewPanel) previewPanel.style.height = '260px';
        requestAnimationFrame(resizeCanvas);
    }

    function syncPreviewHeight(linkEl) {
        if (!previewPanel || !linkEl) return;
        const container = linkEl.querySelector('.project-container');
        if (!container) return;
        // Use getBoundingClientRect to include scale; compute target height
        const rect = container.getBoundingClientRect();
        const target = Math.max(260, Math.round(rect.height));
        // Set explicit height for smooth transition
        previewPanel.style.height = target + 'px';
    }

    function centerScrollTo(linkEl) {
        const rect = linkEl.getBoundingClientRect();
        // Add an offset to reduce over-scrolling across multiple sections
    const targetTop = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2 + CENTER_OFFSET;
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
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
        engaged = false; // snap back to top disengages
                return;
            }
            requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
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

    function snapToIndex(idx) {
        if (idx < 0 || idx >= links.length) return;
    activated = true;
    isAnimating = true;
    engaged = true; // engaging on snap
        const link = links[idx];
        setActive(link);
        centerScrollTo(link);
        // Unlock after scroll settles
        const start = performance.now();
        const targetCheck = () => {
            const r = link.getBoundingClientRect();
            const err = Math.abs((r.top + r.height / 2) - window.innerHeight / 2);
            if (err < 2 || performance.now() - start > 900) {
                isAnimating = false;
                return;
            }
            requestAnimationFrame(targetCheck);
        };
        requestAnimationFrame(targetCheck);
    }

    function inProjectsViewport() {
        if (!projectsSection) return false;
        const r = projectsSection.getBoundingClientRect();
        const centerY = window.innerHeight / 2;
        return centerY >= r.top - 20 && centerY <= r.bottom + 20;
    }

    function nearTopArea() {
        if (!projectsSection) return true;
        const r = projectsSection.getBoundingClientRect();
        const centerY = window.innerHeight / 2;
        return centerY < r.top - 30; // well above the projects section
    }

    function shouldSnapIntoFirst() {
        if (!projectsSection) return false;
        const r = projectsSection.getBoundingClientRect();
        // When the top of the projects section crosses ~35% viewport height
        return r.top <= window.innerHeight * 0.35;
    }

    // Choose an engage target when entering projects while scrolling down
    // Prefer the first project if it does not require scrolling upward; otherwise choose the first project whose center is below or equal to the viewport center
    function getEngageIndexDownward() {
        if (!links.length) return 0;
        const centerY = window.scrollY + window.innerHeight / 2;
        const firstRect = links[0].getBoundingClientRect();
        const firstCenter = window.scrollY + firstRect.top + firstRect.height / 2;
        // If centering the first would be at or below current scroll (no upward move), snap to first
    const firstTargetTop = firstCenter - window.innerHeight / 2 + CENTER_OFFSET;
        if (firstTargetTop >= window.scrollY) return 0;
        // Otherwise find the first whose center is at/after current viewport center
        for (let i = 0; i < links.length; i++) {
            const r = links[i].getBoundingClientRect();
            const c = window.scrollY + r.top + r.height / 2;
            if (c >= centerY) return i;
        }
        return links.length - 1;
    }

    // Gate activation until user scrolls a bit
    let activated = false;

    // IntersectionObserver to trigger updates efficiently once activated
    const io = new IntersectionObserver(() => {
        if (!activated) return;
        updateActiveByViewport();
        if (activeEl) {
            syncPreviewHeight(activeEl);
            resizeCanvas();
        }
    }, { root: null, threshold: [0.25, 0.5, 0.75] });

    links.forEach(l => io.observe(l));

    // Only allow navigation when the project is already active
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            if (link !== activeEl) {
                e.preventDefault();
                activated = true; // enable activation even if user hasn't scrolled yet
                setActive(link);
                // Smoothly scroll the clicked project into view (center it)
                link.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    });

    // Activate on first small scroll, then update actively
    const activateOnFirstScroll = () => {
        if (window.scrollY > 10 || document.documentElement.scrollTop > 10) {
            activated = true;
            updateActiveByViewport();
            window.removeEventListener('scroll', activateOnFirstScroll);
        }
    };
    window.addEventListener('scroll', activateOnFirstScroll, { passive: true });

    // Wheel-based snapping within projects section
    let wheelAccum = 0;
    let wheelTimer = null;
    function wheelHandler(e) {
        const threshold = 120; // increased threshold to avoid skipping multiple sections
        // If we're above the projects (hero/top area), allow snap into first project on downward scroll
        if (nearTopArea()) {
            wheelAccum += e.deltaY;
            clearTimeout(wheelTimer);
            wheelTimer = setTimeout(() => { wheelAccum = 0; }, 250);
            if (wheelAccum > threshold && !isAnimating) {
                e.preventDefault();
                const idx = getEngageIndexDownward();
                snapToIndex(idx);
                wheelAccum = 0;
            }
            return; // otherwise let native scroll work while near top
        }
    if (!inProjectsViewport()) return; // allow normal scroll elsewhere
    if (isAnimating) { e.preventDefault(); return; }
    // If not engaged yet while inside projects, allow native scroll (don't block)
    if (!engaged) return;
    // Once engaged, intercept and snap
    e.preventDefault();
        wheelAccum += e.deltaY;
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => { wheelAccum = 0; }, 250);
        if (wheelAccum > threshold) {
            const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter();
            if (idx < links.length - 1) snapToIndex(idx + 1); else isAnimating = false;
            wheelAccum = 0;
        } else if (wheelAccum < -threshold) {
            const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter();
            if (idx > 0) snapToIndex(idx - 1);
            else snapToTop();
            wheelAccum = 0;
        }
    }
    window.addEventListener('wheel', wheelHandler, { passive: false });

    // Touch-based snapping (vertical swipe)
    let touchStartY = 0;
    window.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
    window.addEventListener('touchmove', (e) => {
        if (!inProjectsViewport()) return;
        // Allow slight movement but prevent native scroll when we will snap
        // Do nothing here; we handle on touchend.
    }, { passive: true });
    window.addEventListener('touchend', (e) => {
        const threshold = 80; // increased touch threshold
        // Handle snapping from top into projects
        if (nearTopArea()) {
            const dyTop = e.changedTouches[0].clientY - touchStartY;
            if (dyTop < -threshold && !isAnimating) {
                const idx = getEngageIndexDownward();
                snapToIndex(idx);
            }
            return;
        }
        if (!inProjectsViewport()) return;
        if (isAnimating) return;
        if (!engaged) return;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dy) < threshold) return;
        if (dy < 0) { // swipe up -> next
            const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter();
            if (idx < links.length - 1) snapToIndex(idx + 1);
        } else { // swipe down -> prev
            const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter();
            if (idx > 0) snapToIndex(idx - 1); else snapToTop();
        }
    }, { passive: true });

    // Keyboard navigation for snapping
    document.addEventListener('keydown', (e) => {
        if (!inProjectsViewport()) return;
        if (isAnimating) return;
        if (!engaged && !nearTopArea()) return;
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
            e.preventDefault();
            // If above projects, go to first
            if (nearTopArea()) snapToIndex(0);
            else {
                const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter();
                if (idx < links.length - 1) snapToIndex(idx + 1);
            }
        } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
            e.preventDefault();
            const idx = activeEl ? getActiveIndex() : getNearestIndexToCenter();
            if (idx > 0) snapToIndex(idx - 1); else snapToTop();
        }
    });

    // Once activated, keep updating on scroll/resize
    window.addEventListener('scroll', () => {
        if (!activated) return;
        updateActiveByViewport();
        if (activeEl) {
            syncPreviewHeight(activeEl);
            requestAnimationFrame(resizeCanvas);
        }
    }, { passive: true });
    window.addEventListener('resize', () => {
        if (!activated) return;
        updateActiveByViewport();
        if (activeEl) syncPreviewHeight(activeEl);
        resizeCanvas();
    });

    // Automatic engage: free scroll above, then snap into first project when the viewport center enters the section
    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
        if (isAnimating) { lastScrollY = window.scrollY; return; }
        const currY = window.scrollY;
        const scrollingDown = currY > lastScrollY;
        lastScrollY = currY;
        // Engage as soon as the viewport center is inside the projects area while scrolling down
        if (!engaged && scrollingDown && inProjectsViewport()) {
            snapToIndex(0);
        }
    }, { passive: true });

    // Initialize canvas preview with idle pattern
    // Ensure pattern state is consistent on load
    state.currentPattern = 'idle';
    state.prevPattern = 'idle';
    state.targetPattern = 'idle';
    state.trans = 1;
    resizeCanvas();
    requestAnimationFrame(draw);
    // Initialize preview panel height to its content (desktop layout still reserves right column)
    if (previewPanel) {
        const rect = previewPanel.getBoundingClientRect();
        previewPanel.style.height = Math.max(260, Math.round(rect.height)) + 'px';
        resizeCanvas();
    }
});
