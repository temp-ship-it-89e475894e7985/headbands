/* Face Value — drawing on faces.
 *
 * A drawing is a list of strokes. Each stroke stores its colour, its pen size
 * and its points squeezed into a short text, so drawings are small enough to
 * send to every player quickly.
 */
(() => {
  'use strict';

  const COLORS = ['#1b1b2f', '#e03131', '#1971c2', '#2f9e44', '#9c36b5', '#f08c00'];
  const SIZES = [0.02, 0.036, 0.06];   // pen thickness, as a share of the pad width
  const ASPECT = 1.2;                    // pad width / height
  const FACE_BG = '#d8cfbf';             // the mannequin face colour
  const MAX_POINTS = 6000;

  // ---------- packing strokes into short text ----------
  function packPoints(pts) {
    const bytes = new Uint8Array(pts.length * 2);
    pts.forEach(([x, y], i) => {
      bytes[i * 2] = Math.max(0, Math.min(255, Math.round(x * 255)));
      bytes[i * 2 + 1] = Math.max(0, Math.min(255, Math.round(y * 255)));
    });
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }
  function unpackPoints(str) {
    try {
      const s = atob(str);
      const pts = [];
      for (let i = 0; i + 1 < s.length; i += 2) pts.push([s.charCodeAt(i) / 255, s.charCodeAt(i + 1) / 255]);
      return pts;
    } catch { return []; }
  }
  function encode(strokes) {
    return { s: strokes.filter((st) => st.pts.length).map((st) => ({ c: st.c, w: st.w, p: packPoints(st.pts) })) };
  }
  function decode(drawing) {
    if (!drawing || !Array.isArray(drawing.s)) return [];
    return drawing.s.map((st) => ({ c: st.c | 0, w: st.w | 0, pts: unpackPoints(String(st.p || '')) }));
  }
  // checks a drawing that came from another player
  function sanitize(drawing) {
    if (!drawing || !Array.isArray(drawing.s)) return null;
    let total = 0;
    const out = [];
    for (const st of drawing.s.slice(0, 400)) {
      if (!st || typeof st.p !== 'string') continue;
      const c = Math.max(0, Math.min(COLORS.length - 1, st.c | 0));
      const w = Math.max(0, Math.min(SIZES.length - 1, st.w | 0));
      const p = st.p.slice(0, 4000).replace(/[^A-Za-z0-9+/=]/g, '');
      total += p.length * 0.375;
      if (total > MAX_POINTS) break;
      out.push({ c, w, p });
    }
    return out.length ? { s: out } : null;
  }

  // ---------- painting strokes onto a canvas ----------
  function paint(ctx, strokes, W, H, bg) {
    ctx.save();
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of strokes) {
      if (!st.pts.length) continue;
      ctx.strokeStyle = COLORS[st.c] || COLORS[0];
      ctx.fillStyle = ctx.strokeStyle;
      const lw = (SIZES[st.w] || SIZES[1]) * W;
      ctx.lineWidth = lw;
      if (st.pts.length === 1) {
        ctx.beginPath(); ctx.arc(st.pts[0][0] * W, st.pts[0][1] * H, lw / 2, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(st.pts[0][0] * W, st.pts[0][1] * H);
      for (let i = 1; i < st.pts.length - 1; i++) {
        // smooth curves through the midpoints
        const [x1, y1] = st.pts[i], [x2, y2] = st.pts[i + 1];
        ctx.quadraticCurveTo(x1 * W, y1 * H, ((x1 + x2) / 2) * W, ((y1 + y2) / 2) * H);
      }
      const last = st.pts[st.pts.length - 1];
      ctx.lineTo(last[0] * W, last[1] * H);
      ctx.stroke();
    }
    ctx.restore();
  }

  // a picture of a drawing (for the 3D faces, results and pop-ups)
  function toCanvas(drawing, width = 480, bg = FACE_BG, aspect = ASPECT) {
    const c = document.createElement('canvas');
    c.width = width; c.height = Math.round(width / aspect);
    paint(c.getContext('2d'), decode(drawing), c.width, c.height, bg);
    return c;
  }
  const urlCache = new Map();
  function toDataURL(drawing, width = 360, bg = FACE_BG, aspect = ASPECT) {
    const key = JSON.stringify(drawing) + width + bg + aspect;
    if (urlCache.has(key)) return urlCache.get(key);
    const url = toCanvas(drawing, width, bg, aspect).toDataURL('image/png');
    if (urlCache.size > 60) urlCache.clear();
    urlCache.set(key, url);
    return url;
  }

  // ---------- the drawing pad ----------
  // Returns one element that keeps its drawing even if the screen around it is redrawn.
  function createPad(onChange, opts = {}) {
    const aspect = opts.aspect || ASPECT, bgCol = opts.bg || FACE_BG;
    const wrap = document.createElement('div');
    wrap.className = 'pad-wrap';
    wrap.innerHTML = `
      <div class="pad-face ${opts.cls || ''}"><canvas class="pad"></canvas><div class="pad-hint">${opts.hint || 'Draw the word here'}</div></div>
      <div class="pad-tools">
        <div class="swatches">${COLORS.map((c, i) => `<button class="sw ${i === 0 ? 'on' : ''}" data-c="${i}" style="--sw:${c}" aria-label="Colour ${i + 1}"></button>`).join('')}</div>
        <div class="sizes">${SIZES.map((s, i) => `<button class="sz ${i === 1 ? 'on' : ''}" data-w="${i}" aria-label="Pen size ${i + 1}"><span style="width:${6 + i * 6}px;height:${6 + i * 6}px"></span></button>`).join('')}</div>
        <div class="pad-btns"><button class="btn sm" data-pad="undo">Undo</button><button class="btn sm" data-pad="clear">Clear</button></div>
      </div>`;
    const canvas = wrap.querySelector('canvas');
    const hint = wrap.querySelector('.pad-hint');
    const ctx = canvas.getContext('2d');
    let strokes = [];
    let current = null;
    let color = 0, size = 1;
    let W = 0, H = 0, dpr = 1;

    function fit() {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.width / aspect;
      canvas.style.height = H + 'px';
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      redraw();
    }
    function redraw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(ctx, current ? strokes.concat([current]) : strokes, W, H, bgCol);
      hint.style.display = strokes.length || current ? 'none' : '';
    }
    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
    }
    function totalPoints() { return strokes.reduce((n, s) => n + s.pts.length, 0); }
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (totalPoints() > MAX_POINTS) return;
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      current = { c: color, w: size, pts: [pos(e)] };
      redraw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!current) return;
      e.preventDefault();
      let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (!evs || !evs.length) evs = [e];
      for (const ev of evs) {
        const p = pos(ev);
        const last = current.pts[current.pts.length - 1];
        // skip points that are almost on top of the last one (keeps drawings small)
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.007) continue;
        current.pts.push(p);
      }
      redraw();
    });
    const end = () => {
      if (!current) return;
      strokes.push(current); current = null; redraw();
      if (onChange) onChange(strokes.length);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.c != null) { color = +b.dataset.c; wrap.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b)); }
      else if (b.dataset.w != null) { size = +b.dataset.w; wrap.querySelectorAll('.sz').forEach((x) => x.classList.toggle('on', x === b)); }
      else if (b.dataset.pad === 'undo') { strokes.pop(); redraw(); if (onChange) onChange(strokes.length); }
      else if (b.dataset.pad === 'clear') { strokes = []; redraw(); if (onChange) onChange(0); }
    });
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(canvas);
    window.addEventListener('resize', fit);

    const api = {
      el: wrap,
      fit,
      isEmpty: () => !strokes.length,
      get: () => encode(strokes),
      set: (drawing) => { strokes = decode(drawing); redraw(); },
      reset: () => { strokes = []; current = null; redraw(); },
    };
    if (!opts.cls) window.Draw._lastPad = api; else window.Draw._wallPad = api;
    api._count = () => strokes.length + (current ? 1 : 0);
    return api;
  }

  window.Draw = { createPad, toCanvas, toDataURL, sanitize, encode, decode, ASPECT, FACE_BG };
})();
