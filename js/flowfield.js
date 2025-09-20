// Flow field preview: canvas-based generative animation with smooth morphing between patterns
;(function () {
  const CENTER_OFFSET = 50;
  let canvas, ctx, container;

  const state = {
    currentPattern: 'idle',
    targetPattern: 'idle',
    prevPattern: 'idle',
    transitioning: false,
    trans: 1,
    transitionDuration: 500, // ms
  spacing: 28,
  lineLength: 18,
    t: 0,
  lastTs: 0,
  cache: null, // { cols, rows, t0, aPrev:Float32Array, aNext:Float32Array, lenPrev:Float32Array, lenNext:Float32Array }
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
  // Base sinusoidal curve with x-edge falloff
  const A = H * 0.18;
  const k = (2 * Math.PI) / (W * 0.9);
  const cx = W * 0.5;
  const sW = W * 0.7;
  const phi = x * k - t * 1.2;
  const E = Math.exp(-Math.pow((x - cx) / sW, 2));
  const y0 = H * 0.5 + A * Math.sin(phi) * E;

  // Tangent direction of the sine curve (single clear wave)
  const dEdx = E * (-2 * (x - cx) / (sW * sW));
  const dy0dx = A * (Math.cos(phi) * k * E + Math.sin(phi) * dEdx);
  const aTan = Math.atan2(dy0dx, 1);

  // Narrower band around the wave; others point straight down
  const sigma = H * 0.12; // thickness of the band
  const dy = y - y0;
  const w = Math.exp(-(dy * dy) / (2 * sigma * sigma)); // 0..1
  // Smoothstep to limit influence to a tight band (avoid second-wave look)
  const edge0 = 0.25, edge1 = 0.75; // acts on w
  const tNorm = Math.max(0, Math.min(1, (w - edge0) / (edge1 - edge0)));
  const s = tNorm * tNorm * (3 - 2 * tNorm); // smoothstep

  const aDown = Math.PI / 2; // vertical downward
  return lerpAngle(aDown, aTan, s);
    },
    'GymTracker': (x, y, t, W, H) => Math.PI / 2 + 0.6 * Math.sin(x * 0.04 + t * 1.5),
    'Banner Injector Extension': (x, y, t, W, H) => 0 + 0.6 * Math.sin(y * 0.05 - t * 1.2),
    'RWTH Notenstreicher': (x, y, t, W, H) => {
      const cx = W * 0.35, cy = H * 0.45;
      const ang = Math.atan2(y - cy, x - cx); const r = Math.hypot(x - cx, y - cy);
      return ang + 0.5 * Math.sin(r * 0.05 - t * 1.1);
    },
  };

  function lerpAngle(a, b, p) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * p;
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

  function magField(x, y, tNow, W, H) {
    const u = x / W, v = y / H;
    const n1 = Math.sin((u * 3.3 + v * 2.7) * Math.PI + tNow * 0.9);
    const n2 = Math.sin((u * 6.9 - v * 4.1) * Math.PI - tNow * 0.6);
    let m = 0.5 + 0.35 * n1 + 0.25 * n2;
    if (m < 0) m = 0; else if (m > 1) m = 1;
    return m;
  }

  function jitter(ix, iy) {
    const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function resizeCanvas() {
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
    canvas.width = pxW; canvas.height = pxH;
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Invalidate cached transition samples on resize
    state.cache = null;
  }

  function buildTransitionCache(prevName, nextName) {
    const W = canvas?.clientWidth || 0;
    const H = canvas?.clientHeight || 0;
    if (W === 0 || H === 0) { state.cache = null; return; }
    const spacing = state.spacing;
    const cols = Math.floor(W / spacing);
    const rows = Math.floor(H / spacing);
    const count = cols * rows;
  const aPrev = new Float32Array(count);
  const lenPrev = new Float32Array(count);

    const prevFn = patterns[prevName] || patterns.idle;
  const nextFn = patterns[nextName] || patterns.idle;
    const t0 = state.t; // snapshot time to avoid time-evolving sources during morph
    let idx = 0;
    for (let jy = 0; jy < rows; jy++) {
      const y = spacing / 2 + jy * spacing;
      for (let ix = 0; ix < cols; ix++) {
        const x = spacing / 2 + ix * spacing;
        const a0 = prevFn(x, y, t0, W, H);
        aPrev[idx] = a0;
        // Snapshot length factors using current mag field
        const m0 = magField(x, y, t0, W, H);
        lenPrev[idx] = 0.9 + 1.3 * m0;
        idx++;
      }
    }
  state.cache = { cols, rows, t0, aPrev, lenPrev };
  }

  function draw(ts) {
    if (!ctx) { requestAnimationFrame(draw); return; }
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (W === 0 || H === 0) { requestAnimationFrame(draw); return; }

    if (!state.lastTs) state.lastTs = ts;
    const dt = Math.min(0.05, (ts - state.lastTs) / 1000);
    state.lastTs = ts; state.t += dt;

    ctx.clearRect(0, 0, W, H);
    const spacing = state.spacing;
    const baseLen = state.lineLength;
    const prevFn = patterns[state.prevPattern] || patterns.idle;
    const currFn = patterns[state.currentPattern] || patterns.idle;
    const nextFn = patterns[state.targetPattern] || patterns.idle;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pTrans = state.transitioning ? Math.max(0, Math.min(1, state.trans)) : 1;

    let idx = 0;
    const usingCache = state.transitioning && state.cache && state.cache.cols === Math.floor(W / spacing) && state.cache.rows === Math.floor(H / spacing);
    for (let y = spacing / 2; y <= H - spacing / 2; y += spacing) {
      for (let x = spacing / 2; x <= W - spacing / 2; x += spacing) {
        const ix = Math.round(x / spacing), iy = Math.round(y / spacing);
        const j = jitter(ix, iy);
        const m = magField(x, y, state.t, W, H);
        let length;
        if (usingCache) {
          const lp = state.cache.lenPrev[idx];
          const lnLive = 0.9 + 1.3 * m; // live next length factor
          const lf = lp + (lnLive - lp) * pTrans;
          length = baseLen * lf;
        } else {
          length = baseLen * (0.9 + 1.3 * m);
        }

        const u = x / W, v = y / H;
        const [r, g, b] = colorAt(u, v, state.t);
  const alpha = Math.max(0.15, Math.min(0.95, 0.38 + 0.38 * m + 0.2 * (j - 0.5)));
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.lineWidth = Math.max(0.8, 1.0 + 1.8 * m + 0.5 * (j - 0.5));

        // Single straight segment anchored at (x,y)
        let theta;
        if (usingCache) {
          const a1Live = nextFn(x, y, state.t, W, H); // live next
          theta = lerpAngle(state.cache.aPrev[idx], a1Live, pTrans);
        } else if (state.transitioning) {
          // Fallback: compute live if cache missing
          const a0 = prevFn(x, y, state.t, W, H);
          const a1 = nextFn(x, y, state.t, W, H);
          theta = lerpAngle(a0, a1, pTrans);
        } else {
          theta = currFn(x, y, state.t, W, H);
        }
        const x2 = x + Math.cos(theta) * length;
        const y2 = y + Math.sin(theta) * length;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        idx++;
      }
    }

  if (state.transitioning) {
      state.trans += dt * (1000 / state.transitionDuration);
      if (state.trans >= 1) {
    state.trans = 1;
    state.transitioning = false;
    state.currentPattern = state.targetPattern;
    state.cache = null; // done with cached data
      }
    }
    requestAnimationFrame(draw);
  }

  function startTransitionTo(title) {
    const name = patterns[title] ? title : 'idle';
    if (name === state.currentPattern && !state.transitioning) {
      state.targetPattern = name; state.prevPattern = name; state.trans = 1; state.transitioning = false; return;
    }
    state.prevPattern = state.currentPattern; state.targetPattern = name; state.trans = 0; state.transitioning = true;
  // Snapshot fields for smooth interpolation
  buildTransitionCache(state.prevPattern, state.targetPattern);
  }

  function init(opts = {}) {
    const fixedSelector = opts.fixedSelector || '.fixed-preview';
    const fallbackSelector = opts.fallbackSelector || '.preview-content';
    container = document.querySelector(fixedSelector) || document.querySelector(fallbackSelector);
    if (!container) return;
    canvas = document.createElement('canvas'); canvas.className = 'preview-canvas';
    container.innerHTML = ''; container.appendChild(canvas);
    ctx = canvas.getContext('2d');
    // Initialize idle
    state.currentPattern = 'idle'; state.prevPattern = 'idle'; state.targetPattern = 'idle'; state.trans = 1;
    resizeCanvas(); requestAnimationFrame(draw);
    window.addEventListener('resize', resizeCanvas, { passive: true });
  }

  window.FlowFieldPreview = {
    init,
    resize: resizeCanvas,
    setPattern: (title) => { startTransitionTo(title); resizeCanvas(); },
    setIdle: () => { startTransitionTo('idle'); resizeCanvas(); },
  };
})();
