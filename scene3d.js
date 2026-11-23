/* Headbands — the 3D table.
 *
 * Everyone sits around a round table as a smooth mannequin with a blank face.
 * Your camera sits in your own seat, so you see everyone else's face but not your own.
 * Drag to look around, scroll or pinch to zoom, tap a player to look closer.
 */
(() => {
  'use strict';
  const T = window.THREE;
  const supported = (() => {
    if (!T || new URLSearchParams(location.search).has('no3d')) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  })();
  if (!supported) { window.Table3D = { supported: false }; return; }

  const SKIN = 0xf3e3d3;
  const el = document.createElement('div');
  el.className = 'scene3d';
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  const hint = document.createElement('div');
  hint.className = 'scene-hint';
  hint.textContent = 'Drag to look around · tap a player to look closer';
  el.appendChild(hint);

  const scene = new T.Scene();
  scene.background = new T.Color(0x11241f);
  scene.fog = new T.Fog(0x11241f, 9, 26);
  const camera = new T.PerspectiveCamera(55, 1, 0.05, 100);
  camera.rotation.order = 'YXZ';

  // lights
  scene.add(new T.HemisphereLight(0xfff1dc, 0x16302a, 0.9));
  const sun = new T.DirectionalLight(0xfff4e6, 1.1);
  sun.position.set(3, 8, 4);
  scene.add(sun);
  const lamp = new T.PointLight(0xffd59a, 26, 12, 2);
  lamp.position.set(0, 3.2, 0);
  scene.add(lamp);

  // room
  const floor = new T.Mesh(new T.CircleGeometry(16, 48), new T.MeshStandardMaterial({ color: 0x14302a, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const rug = new T.Mesh(new T.CircleGeometry(1, 48), new T.MeshStandardMaterial({ color: 0x1a3b33, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.005;
  scene.add(rug);
  const lampShade = new T.Mesh(new T.ConeGeometry(0.45, 0.35, 32, 1, true), new T.MeshStandardMaterial({ color: 0x23302c, roughness: 0.4, metalness: 0.3, side: T.DoubleSide }));
  lampShade.position.set(0, 3.4, 0);
  scene.add(lampShade);
  const bulb = new T.Mesh(new T.SphereGeometry(0.1, 16, 12), new T.MeshBasicMaterial({ color: 0xfff1c9 }));
  bulb.position.set(0, 3.25, 0);
  scene.add(bulb);
  const cord = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 3, 6), new T.MeshBasicMaterial({ color: 0x222222 }));
  cord.position.set(0, 5.05, 0);
  scene.add(cord);

  const tableGroup = new T.Group();
  scene.add(tableGroup);
  const woodMat = new T.MeshStandardMaterial({ color: 0x5a3c26, roughness: 0.55 });
  const feltMat = new T.MeshStandardMaterial({ color: 0x1f6b52, roughness: 0.95 });
  const tableTop = new T.Mesh(new T.CylinderGeometry(1, 1, 0.08, 64), [woodMat, feltMat, woodMat]);
  tableTop.position.y = 0.78;
  const tableEdge = new T.Mesh(new T.TorusGeometry(1, 0.045, 12, 64), woodMat);
  tableEdge.rotation.x = Math.PI / 2; tableEdge.position.y = 0.78;
  const tableLeg = new T.Mesh(new T.CylinderGeometry(0.12, 0.35, 0.74, 24), woodMat);
  tableLeg.position.y = 0.37;
  tableGroup.add(tableTop, tableEdge, tableLeg);

  // ---------- one mannequin ----------
  const shared = {
    skin: new T.MeshStandardMaterial({ color: SKIN, roughness: 0.55 }),
    chair: new T.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.6 }),
    torso: new T.CapsuleGeometry(0.24, 0.42, 6, 16),
    arm: new T.CapsuleGeometry(0.075, 0.42, 4, 10),
    head: new T.SphereGeometry(0.36, 40, 28),
    face: new T.SphereGeometry(0.3635, 48, 32, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.8, 1.45),
    neck: new T.CylinderGeometry(0.09, 0.1, 0.16, 16),
    seat: new T.BoxGeometry(0.62, 0.07, 0.56),
    back: new T.BoxGeometry(0.62, 0.7, 0.07),
    leg: new T.BoxGeometry(0.06, 0.48, 0.06),
    thigh: new T.CapsuleGeometry(0.1, 0.36, 4, 10),
    ring: new T.TorusGeometry(0.5, 0.04, 10, 48),
  };
  const blankTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 4; const x = c.getContext('2d'); x.fillStyle = '#f3e3d3'; x.fillRect(0, 0, 4, 4); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();

  function labelSprite(text, color, extra = '') {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const font = '600 40px Archivo, "Helvetica Neue", Arial, sans-serif';
    const small = '500 32px Archivo, "Helvetica Neue", Arial, sans-serif';
    ctx.font = font;
    const tw = ctx.measureText(text).width;
    ctx.font = small;
    const ew = extra ? ctx.measureText(extra).width + 16 : 0;
    c.width = Math.ceil(tw + ew + 92); c.height = 68;
    const r = 12;
    ctx.fillStyle = 'rgba(15, 40, 35, 0.88)';
    ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(c.width, 0, c.width, c.height, r); ctx.arcTo(c.width, c.height, 0, c.height, r);
    ctx.arcTo(0, c.height, 0, 0, r); ctx.arcTo(0, 0, c.width, 0, r); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(34, c.height / 2, 11, 0, Math.PI * 2); ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.font = font; ctx.fillStyle = '#e7efea'; ctx.fillText(text, 58, c.height / 2 + 2);
    if (extra) { ctx.font = small; ctx.fillStyle = '#a3b8ae'; ctx.fillText(extra, 58 + tw + 16, c.height / 2 + 2); }
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    s.renderOrder = 10;
    const h = 0.1; s.scale.set(h * c.width / c.height, h, 1); // same size on screen near or far
    return s;
  }

  function makeFigure(p) {
    const g = new T.Group();
    const shirt = new T.MeshStandardMaterial({ color: new T.Color(p.color), roughness: 0.65 });
    // chair (behind, facing the table)
    const chair = new T.Group();
    const seat = new T.Mesh(shared.seat, shared.chair); seat.position.set(0, 0.48, 0);
    const back = new T.Mesh(shared.back, shared.chair); back.position.set(0, 0.85, -0.27);
    chair.add(seat, back);
    for (const [x, z] of [[-0.26, -0.24], [0.26, -0.24], [-0.26, 0.24], [0.26, 0.24]]) { const l = new T.Mesh(shared.leg, shared.chair); l.position.set(x, 0.24, z); chair.add(l); }
    g.add(chair);
    // body
    const body = new T.Group();
    const torso = new T.Mesh(shared.torso, shirt); torso.position.set(0, 1.0, -0.02);
    const neck = new T.Mesh(shared.neck, shared.skin); neck.position.set(0, 1.44, 0);
    const thighL = new T.Mesh(shared.thigh, shirt); thighL.rotation.x = Math.PI / 2; thighL.position.set(-0.12, 0.6, 0.16);
    const thighR = thighL.clone(); thighR.position.x = 0.12;
    const armL = new T.Mesh(shared.arm, shared.skin); armL.position.set(-0.3, 1.0, 0.14); armL.rotation.set(-0.95, 0, 0.12);
    const armR = armL.clone(); armR.position.x = 0.3; armR.rotation.z = -0.12;
    body.add(torso, neck, thighL, thighR, armL, armR);
    // head + blank face
    const headG = new T.Group();
    headG.position.set(0, 1.8, 0);
    headG.scale.set(1, 1.1, 0.96);
    const head = new T.Mesh(shared.head, shared.skin);
    const faceMat = new T.MeshStandardMaterial({ map: blankTex, roughness: 0.55, transparent: true });
    const face = new T.Mesh(shared.face, faceMat);
    headG.add(head, face);
    body.add(headG);
    g.add(body);
    // turn ring on the floor
    const ring = new T.Mesh(shared.ring, new T.MeshBasicMaterial({ color: 0xf4c542, transparent: true, opacity: 0.9 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.03, 0.05);
    ring.visible = false;
    g.add(ring);

    const fig = { group: g, chair, body, headG, head, face, faceMat, shirt, ring, tag: null, tagKey: '', faceKey: '', id: p.id, phase: Math.random() * 6 };
    head.userData.pid = p.id; face.userData.pid = p.id; torso.userData.pid = p.id;
    fig.pickables = [head, face, torso];
    return fig;
  }

  // ---------- state ----------
  let figures = new Map();
  let layoutKey = '';
  let me = null, spectator = false, R = 2;
  const view = { yaw: 0, pitch: -0.18, fov: 1, tYaw: 0, tPitch: -0.18, tFov: 1, orbit: 0, tOrbit: 0 };  // fov here = zoom (1 = see everyone)
  let autoH = 1.3; // horizontal view angle that fits everyone
  let focusId = null;
  let onPickCb = null;
  let lastData = null;

  function seatAngle(i, n, myIndex) { return Math.PI / 2 + (i - myIndex) * (Math.PI * 2 / n); }

  function rebuild(data) {
    for (const f of figures.values()) scene.remove(f.group);
    figures.clear();
    const list = data.players;
    const n = Math.max(list.length, 2);
    R = Math.max(1.75, n * 0.36);
    const tr = R - 0.62;
    tableTop.scale.set(tr, 1, tr); tableEdge.scale.set(tr, tr, 1);
    rug.scale.set(R + 1.2, R + 1.2, 1);
    const myIndex = Math.max(0, list.findIndex((p) => p.id === me));
    list.forEach((p, i) => {
      const a = seatAngle(i, n, spectator ? 0 : myIndex);
      const fig = makeFigure(p);
      fig.group.position.set(R * Math.cos(a), 0, R * Math.sin(a));
      fig.group.lookAt(0, 0, 0);
      if (p.id === me && !spectator) { fig.body.visible = false; fig.chair.visible = false; } // you can't see yourself
      scene.add(fig.group);
      figures.set(p.id, fig);
    });
    view.tYaw = view.yaw = 0; view.tPitch = view.pitch = -0.2; view.tFov = view.fov = 1; focusId = null;
    // how wide must the view be to see every other player?
    let maxA = 0.5;
    const e = eye();
    for (const f of figures.values()) {
      if (f.id === me) continue;
      const d = f.group.position.clone().setY(1.8).sub(e);
      maxA = Math.max(maxA, Math.abs(Math.atan2(d.x, -d.z)));
    }
    autoH = Math.min(2.3, maxA * 2 + 0.42);
  }

  function update(data) {
    lastData = data;
    me = data.me; spectator = !!data.spectator;
    const key = (spectator ? 'S|' : me + '|') + data.players.map((p) => p.id).join(',');
    if (key !== layoutKey) { layoutKey = key; rebuild(data); }
    for (const p of data.players) {
      const fig = figures.get(p.id);
      if (!fig) continue;
      // face
      const fk = p.face ? JSON.stringify(p.face).length + ':' + JSON.stringify(p.face).slice(0, 80) + JSON.stringify(p.face).slice(-40) : 'blank';
      if (fk !== fig.faceKey) {
        fig.faceKey = fk;
        if (fig.faceMat.map && fig.faceMat.map !== blankTex) fig.faceMat.map.dispose();
        if (p.face) {
          const tex = new T.CanvasTexture(window.Draw.toCanvas(p.face, 512));
          tex.colorSpace = T.SRGBColorSpace;
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          fig.faceMat.map = tex;
        } else fig.faceMat.map = blankTex;
        fig.faceMat.needsUpdate = true;
      }
      // name tag
      const ord = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
      const badge = p.done === 'got' ? ord(p.place) : p.done === 'gaveup' ? 'gave up' : p.online ? '' : 'away';
      const tk = p.name + '|' + p.color + '|' + badge + '|' + (p.id === me);
      if (tk !== fig.tagKey) {
        fig.tagKey = tk;
        if (fig.tag) { fig.group.remove(fig.tag); fig.tag.material.map.dispose(); fig.tag.material.dispose(); }
        fig.tag = labelSprite(p.name, p.color, badge);
        fig.tag.position.set(0, 2.42, 0);
        if (p.id === me && !spectator) fig.tag.visible = false;
        fig.group.add(fig.tag);
      }
      fig.ring.visible = !!p.isTurn && (spectator || p.id !== me);
      const op = p.online ? 1 : 0.45;
      fig.shirt.transparent = op < 1; fig.shirt.opacity = op;
    }
    hint.style.display = spectator ? 'none' : '';
  }

  // ---------- camera ----------
  function headWorld(id) {
    const f = figures.get(id); if (!f) return null;
    const v = new T.Vector3(); f.headG.getWorldPosition(v); return v;
  }
  function eye() {
    if (spectator) {
      const d = R * 1.9 + 1.5;
      return new T.Vector3(Math.sin(view.orbit) * d, R * 1.25 + 2.2, Math.cos(view.orbit) * d);
    }
    return new T.Vector3(0, 2.05, R + 0.75);
  }
  function lookAtYawPitch(target) {
    const e = eye();
    const d = target.clone().sub(e);
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
  }
  function focus(id) {
    focusId = id;
    if (!id) { view.tFov = 1; view.tPitch = -0.2; return; }
    const h = headWorld(id); if (!h || spectator) return;
    const yp = lookAtYawPitch(h.add(new T.Vector3(0, 0.02, 0)));
    view.tYaw = yp.yaw; view.tPitch = yp.pitch;
    const dist = eye().distanceTo(headWorld(id));
    // zoom so the face fills a good part of the screen
    view.tFov = Math.max(0.12, Math.min(1, (Math.atan(0.5 / dist) * 2 * 2.2) / autoH));
  }

  // ---------- input ----------
  const pointers = new Map();
  let dragMoved = 0, pinchDist = 0, downAt = 0;
  const cv = renderer.domElement;
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (e) => {
    try { cv.setPointerCapture(e.pointerId); } catch {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragMoved = 0; downAt = performance.now();
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  cv.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) view.tFov = Math.max(0.12, Math.min(1.2, view.tFov * (pinchDist / d)));
      pinchDist = d; dragMoved += 10;
      return;
    }
    dragMoved += Math.abs(dx) + Math.abs(dy);
    const k = view.fov * 0.005;
    if (spectator) { view.tOrbit -= dx * 0.008; }
    else {
      view.tYaw = Math.max(-1.5, Math.min(1.5, view.tYaw + dx * k));
      view.tPitch = Math.max(-0.75, Math.min(0.35, view.tPitch + dy * k));
    }
    focusId = null;
  });
  const up = (e) => {
    const wasTap = pointers.size === 1 && dragMoved < 8 && performance.now() - downAt < 600;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (wasTap && e.type === 'pointerup') pick(e);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.tFov = Math.max(0.12, Math.min(1.2, view.tFov * (e.deltaY > 0 ? 1.1 : 0.9)));
  }, { passive: false });

  const ray = new T.Raycaster();
  function pick(e) {
    const r = cv.getBoundingClientRect();
    const m = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(m, camera);
    const objs = [];
    for (const f of figures.values()) if (f.body.visible) objs.push(...f.pickables);
    const hit = ray.intersectObjects(objs, false)[0];
    const id = hit && hit.object.userData.pid;
    if (id) { focus(id); if (onPickCb) onPickCb(id); }
    else focus(null);
  }

  // ---------- loop ----------
  let running = false, last = 0;
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function frame(t) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!el.isConnected || document.hidden) return;
    if (t - last < 30) return; // about 30 frames a second is plenty and saves battery
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    const s = 1 - Math.pow(0.001, dt);
    view.yaw += (view.tYaw - view.yaw) * s;
    view.pitch += (view.tPitch - view.pitch) * s;
    view.fov += (view.tFov - view.fov) * s;
    view.orbit += (view.tOrbit - view.orbit) * s;
    if (!spectator && !focusId && pointers.size === 0) {
      // drift back towards the middle when not being dragged
      view.tYaw *= 1 - dt * 0.15;
    }
    const e = eye();
    camera.position.copy(e);
    if (spectator) { camera.lookAt(0, 0.9, 0); }
    else { camera.rotation.set(view.pitch, view.yaw, 0); }
    // pick a lens that fits everyone across, whatever the screen shape
    const h = spectator ? 1.15 : autoH * view.fov;
    let vf = 2 * Math.atan(Math.tan(h / 2) / camera.aspect) * 180 / Math.PI;
    vf = Math.max(8, Math.min(spectator ? 75 : 100, vf));
    if (!spectator && view.fov >= 0.99) vf = Math.max(vf, 48);
    camera.fov = vf;
    camera.updateProjectionMatrix();
    const camPos = camera.position;
    for (const f of figures.values()) {
      f.body.position.y = Math.sin(t / 900 + f.phase) * 0.012;
      f.headG.rotation.z = Math.sin(t / 1600 + f.phase) * 0.03;
      // everyone turns their head towards you, so you can read their face
      const local = f.group.worldToLocal(camPos.clone());
      const want = Math.max(-1.1, Math.min(1.1, Math.atan2(local.x, local.z)));
      f.headG.rotation.y += (want * 0.65 - f.headG.rotation.y) * Math.min(1, dt * 3);
      f.body.rotation.y += (want * 0.35 - f.body.rotation.y) * Math.min(1, dt * 3);
      if (f.ring.visible) { const k = 1 + Math.sin(t / 250) * 0.06; f.ring.scale.set(k, k, k); }
    }
    renderer.render(scene, camera);
  }
  function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
  function stop() { running = false; }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(el);
  window.addEventListener('resize', resize);

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { for (const f of figures.values()) f.tagKey = ''; if (lastData) update(lastData); });

  window.Table3D = {
    supported: true,
    el,
    update,
    focus,
    start, stop, resize,
    onPick(cb) { onPickCb = cb; },
    // for tests: is anybody's face showing something?
    _debug() { return { figures: [...figures.keys()], me, spectator, faces: [...figures.values()].map((f) => ({ id: f.id, drawn: f.faceKey !== 'blank', visible: f.body.visible })) }; },
  };
})();
