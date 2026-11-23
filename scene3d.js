/* Face Value — the 3D table.
 *
 * Everyone sits around a round table as a white mannequin with a blank, egg-shaped
 * face and a headband of their choice. Two kinds of view:
 *  - "seat": you look out from your own seat (you never see your own face).
 *    Move the mouse (or drag on a phone) to look around; everyone else sees your
 *    head turn. Tap a player to inspect them: you zoom in and lean towards them,
 *    and everyone sees you lean.
 *  - "orbit": a camera that circles the table (home page, lobby, results).
 */
(() => {
  'use strict';
  const T = window.THREE;
  const supported = (() => {
    if (!T || new URLSearchParams(location.search).has('no3d')) return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  })();
  if (!supported) { window.Table3D = { supported: false }; return; }

  const FACE_BG = '#d8cfbf';
  const el = document.createElement('div');
  el.className = 'scene3d';
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.background = new T.Color(0x1c1c1b);
  const camera = new T.PerspectiveCamera(50, 1, 0.05, 100);
  camera.rotation.order = 'YXZ';

  // ---------- room: plain white, lit by one dim lamp that flickers ----------
  const ROOM = 6.5;
  const white = (c, rough = 0.92, side = T.FrontSide) => new T.MeshStandardMaterial({ color: c, roughness: rough, side });
  const walls = new T.Mesh(new T.CylinderGeometry(ROOM, ROOM, 5, 56, 1, true), white(0xe9e7e2, 0.95, T.BackSide)); walls.position.y = 2.5; walls.receiveShadow = true; scene.add(walls);
  const ceiling = new T.Mesh(new T.CircleGeometry(ROOM, 56), white(0xdedcd6)); ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 5; scene.add(ceiling);
  const floor = new T.Mesh(new T.CircleGeometry(ROOM, 56), white(0xd9d6cf, 0.85)); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const skirting = new T.Mesh(new T.CylinderGeometry(ROOM - 0.01, ROOM - 0.01, 0.12, 56, 1, true), white(0xcfccc4, 0.8, T.BackSide)); skirting.position.y = 0.06; scene.add(skirting);
  const rug = new T.Mesh(new T.CircleGeometry(1, 48), white(0xe4e1da, 1)); rug.rotation.x = -Math.PI / 2; rug.position.y = 0.004; rug.receiveShadow = true; scene.add(rug);

  const ambient = new T.HemisphereLight(0xffffff, 0x5a5850, 0.06); scene.add(ambient); // just enough to not be pitch black
  const LAMP_Y = 2.55;
  const spot = new T.SpotLight(0xfff0dc, 34, 10, 0.95, 0.55, 1.5);
  spot.position.set(0, LAMP_Y, 0); spot.target.position.set(0, 0, 0); scene.add(spot, spot.target);
  spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0004; spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 8;
  const glow = new T.PointLight(0xfff0dc, 9, 0, 1.6); glow.position.set(0, LAMP_Y - 0.02, 0); scene.add(glow); // the bulb itself, lighting the room around it
  const shade = new T.Mesh(new T.ConeGeometry(0.3, 0.24, 32, 1, true), new T.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.45, metalness: 0.4, side: T.DoubleSide }));
  shade.position.set(0, LAMP_Y + 0.13, 0); scene.add(shade);
  const bulbMat = new T.MeshBasicMaterial({ color: 0xfff1c9 });
  const bulb = new T.Mesh(new T.SphereGeometry(0.065, 16, 12), bulbMat); bulb.position.set(0, LAMP_Y, 0); scene.add(bulb);
  const cord = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 5 - LAMP_Y, 6), new T.MeshBasicMaterial({ color: 0x222222 })); cord.position.set(0, (5 + LAMP_Y) / 2 + 0.1, 0); scene.add(cord);
  // flicker: mostly steady, now and then a short stutter
  const flick = { next: 4000 + Math.random() * 6000, until: 0, level: 1 };
  function flicker(t) {
    if (t > flick.next) { flick.until = t + 250 + Math.random() * 700; flick.next = t + 5000 + Math.random() * 9000; }
    let target = 0.96 + Math.sin(t / 90) * 0.02 + Math.sin(t / 37) * 0.015;
    if (t < flick.until) target = Math.random() < 0.45 ? 0.18 + Math.random() * 0.3 : 0.85 + Math.random() * 0.2;
    flick.level += (target - flick.level) * (t < flick.until ? 0.7 : 0.15);
    spot.intensity = 30 * flick.level; glow.intensity = 9 * flick.level;
    bulbMat.color.setRGB(1, 0.94, 0.79).multiplyScalar(0.35 + 0.65 * flick.level);
  }

  // the table: plain white, round, small
  const tableMat = white(0xf1efea, 0.6);
  const tableTop = new T.Mesh(new T.CylinderGeometry(1, 1, 0.05, 64), tableMat); tableTop.position.y = 0.74; tableTop.castShadow = true; tableTop.receiveShadow = true;
  const tableEdge = new T.Mesh(new T.TorusGeometry(1, 0.026, 12, 64), white(0xdcd9d2, 0.55)); tableEdge.rotation.x = Math.PI / 2; tableEdge.position.y = 0.74;
  const tableLeg = new T.Mesh(new T.CylinderGeometry(0.06, 0.24, 0.72, 24), tableMat); tableLeg.position.y = 0.36; tableLeg.castShadow = true;
  scene.add(tableTop, tableEdge, tableLeg);

  // ---------- writing on the walls ----------
  const PHRASES = ['NO ESCAPE', 'THEY KNOW', 'LOOK CLOSER', "IT'S ON YOUR FACE", 'WHO ARE YOU?', 'KEEP GUESSING', 'NOBODY LEAVES',
    "DON'T TRUST THEM", 'ASK THE RIGHT QUESTION', 'TAKE IT AT FACE VALUE', 'WE WERE ALL HERE BEFORE', "YOU CAN'T SEE IT", 'COUNT THE CHAIRS',
    'STILL HERE', 'WHO DREW THIS?', 'ONE OF YOU IS LYING', 'THE LIGHT IS WATCHING', 'DO NOT GUESS WRONG'];
  const wallGroup = new T.Group(); scene.add(wallGroup);
  let wallKey = '';
  function seeded(str) {
    let h = 2166136261 >>> 0;
    for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }
  const PAINT = 'rgba(74, 22, 18, 0.82)';
  function phraseCanvas(text, rnd) {
    const c = document.createElement('canvas'); const x = c.getContext('2d');
    const font = '400 120px "Permanent Marker", "Marker Felt", "Comic Sans MS", cursive';
    x.font = font;
    c.width = Math.ceil(x.measureText(text).width) + 80; c.height = 230;
    x.font = font; x.fillStyle = PAINT; x.textBaseline = 'middle';
    x.translate(40, 100); x.rotate((rnd() - 0.5) * 0.08);
    x.fillText(text, 0, 0);
    // paint drips
    for (let i = 0; i < 6; i++) {
      const dx = rnd() * (c.width - 100), len = 20 + rnd() * 70, w = 3 + rnd() * 5;
      const g = x.createLinearGradient(0, 40, 0, 40 + len); g.addColorStop(0, PAINT); g.addColorStop(1, 'rgba(74,22,18,0)');
      x.fillStyle = g; x.fillRect(dx, 38, w, len);
    }
    return c;
  }
  function tallyCanvas(rnd) {
    const c = document.createElement('canvas'); c.width = 520; c.height = 200; const x = c.getContext('2d');
    x.strokeStyle = PAINT; x.lineCap = 'round'; x.lineWidth = 9;
    const groups = 2 + Math.floor(rnd() * 3);
    for (let gI = 0; gI < groups; gI++) {
      const ox = 30 + gI * 120;
      for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(ox + i * 22, 40 + rnd() * 8); x.lineTo(ox + i * 22 + (rnd() - 0.5) * 8, 160 + rnd() * 8); x.stroke(); }
      x.beginPath(); x.moveTo(ox - 12, 140); x.lineTo(ox + 82, 55); x.stroke();
    }
    return c;
  }
  function graffitiCanvas(g) {
    const c = window.Draw.toCanvas(g.d, 1200, null, 2.4);
    const x = c.getContext('2d');
    x.font = '400 64px "Permanent Marker", "Marker Felt", cursive'; x.fillStyle = 'rgba(30, 30, 30, 0.85)'; x.textAlign = 'right';
    x.fillText('— ' + (g.by || '?'), c.width - 30, c.height - 30);
    return c;
  }
  function wallDecal(canvas, angle, y, widthM) {
    const heightM = widthM * canvas.height / canvas.width;
    const r = ROOM - 0.03;
    const len = widthM / r;
    const geo = new T.CylinderGeometry(r, r, heightM, 24, 1, true, angle - len / 2, len);
    const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = T.RepeatWrapping; tex.repeat.x = -1; // we see it from inside the room
    tex.anisotropy = 4;
    const m = new T.Mesh(geo, new T.MeshStandardMaterial({ map: tex, transparent: true, side: T.BackSide, roughness: 0.95, depthWrite: false }));
    m.position.y = y; m.receiveShadow = true;
    return m;
  }
  function buildWalls(seed, graffiti) {
    const key = seed + '|' + graffiti.map((g) => g.id).join(',');
    if (key === wallKey) return;
    wallKey = key;
    for (const m of [...wallGroup.children]) { wallGroup.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }
    const rnd = seeded(seed);
    const used = [];
    const free = (a, gap) => used.every((u) => Math.abs(Math.atan2(Math.sin(a - u), Math.cos(a - u))) > gap);
    // winners' messages: newest twice (opposite walls) so everyone can see it
    const base = rnd() * Math.PI * 2;
    graffiti.slice().reverse().forEach((g, i) => {
      const spots = i === 0 ? [base, base + Math.PI] : [base + (i === 1 ? Math.PI / 2 : -Math.PI / 2)];
      for (const a of spots) { wallGroup.add(wallDecal(graffitiCanvas(g), a, 1.85, i === 0 ? 3.0 : 2.4)); used.push(a); }
    });
    const pool = PHRASES.slice();
    const count = 7;
    for (let i = 0; i < count; i++) {
      let a = rnd() * Math.PI * 2, tries = 0;
      while (!free(a, 0.55) && tries++ < 30) a = rnd() * Math.PI * 2;
      used.push(a);
      const y = 1.2 + rnd() * 1.7;
      if (i === count - 1 || rnd() < 0.12) { wallGroup.add(wallDecal(tallyCanvas(rnd), a, y, 1.0 + rnd() * 0.5)); continue; }
      const text = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      wallGroup.add(wallDecal(phraseCanvas(text, rnd), a, y, 1.3 + text.length * 0.09 + rnd() * 0.4));
    }
  }

  // ---------- mannequin parts (shared) ----------
  const plastic = new T.MeshStandardMaterial({ color: 0xd8cfbf, roughness: 0.45 });
  const leather = new T.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.7, side: T.DoubleSide });
  const brass = new T.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.35, metalness: 0.8 });
  const chairMat = new T.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.6 });
  const lathe = (pts, segs = 32) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), segs);
  function taper(len, rTop, rMid, rBot, midAt = 0.35) {
    return lathe([[0, -len], [rBot * 0.6, -len + rBot * 0.25], [rBot * 0.95, -len + rBot * 0.8], [rBot, -len + rBot * 1.6],
      [rMid, -len * midAt - len * 0.1], [rMid * 0.98, -len * midAt * 0.6], [rTop, -rTop * 1.4], [rTop * 0.92, -rTop * 0.6], [rTop * 0.55, -rTop * 0.12], [0, 0]], 24);
  }
  const HR = 0.125;          // head size
  const HS = [0.84, 1.22, 0.98]; // egg shape
  const G = {
    torso: (() => { const g = lathe([[0, -0.03], [0.08, -0.02], [0.128, 0.01], [0.14, 0.06], [0.132, 0.13], [0.118, 0.21], [0.118, 0.27], [0.135, 0.35], [0.158, 0.43], [0.17, 0.49], [0.168, 0.54], [0.148, 0.585], [0.09, 0.615], [0.05, 0.63], [0, 0.635]], 40); g.scale(1.2, 1, 0.56); return g; })(),
    neck: new T.CylinderGeometry(0.042, 0.05, 0.13, 16),
    head: new T.SphereGeometry(HR, 40, 28),
    face: new T.SphereGeometry(HR * 1.004, 40, 28, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.62, 1.3),
    shoulder: new T.SphereGeometry(0.056, 20, 14),
    upperArm: taper(0.31, 0.05, 0.047, 0.036),
    foreArm: taper(0.27, 0.037, 0.038, 0.027, 0.3),
    hand: (() => { const g = new T.CapsuleGeometry(0.03, 0.075, 6, 12); g.scale(1.25, 1, 0.55); return g; })(),
    thumb: new T.CapsuleGeometry(0.011, 0.03, 4, 8),
    thigh: taper(0.49, 0.072, 0.066, 0.046, 0.3),
    shin: taper(0.47, 0.046, 0.05, 0.028, 0.3),
    foot: (() => { const g = new T.CapsuleGeometry(0.038, 0.13, 6, 12); g.rotateX(Math.PI / 2); g.scale(1.05, 0.7, 1); return g; })(),
    seat: new T.BoxGeometry(0.46, 0.05, 0.44),
    armrest: new T.BoxGeometry(0.07, 0.035, 0.5),
    post: new T.BoxGeometry(0.035, 0.22, 0.035),
    bar: new T.BoxGeometry(0.44, 0.035, 0.035),
    band: new T.CylinderGeometry(1, 1, 1, 24, 1, true),
    buckle: (() => { const g = new T.BoxGeometry(0.045, 0.04, 0.012); return g; })(),
    tether: new T.BoxGeometry(0.03, 0.012, 0.28),
    back: new T.BoxGeometry(0.46, 0.55, 0.05),
    leg: new T.BoxGeometry(0.04, 0.46, 0.04),
    ring: new T.TorusGeometry(0.42, 0.03, 10, 48),
  };
  const blankTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 4; const x = c.getContext('2d'); x.fillStyle = FACE_BG; x.fillRect(0, 0, 4, 4); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();

  // ---------- headbands ----------
  // All of them sit above the face so they never cover the drawing.
  const BY = 0.1; // height of the band on the head (head centre = 0)
  function bandRing(color, h = 0.034, grow = 1.06, tex = null) {
    const k = Math.sqrt(1 - Math.pow(BY / (HR * HS[1]), 2));
    const geo = new T.CylinderGeometry(0.9, 1, h, 40, 1, true);
    const mat = new T.MeshStandardMaterial({ color: tex ? 0xffffff : color, map: tex, roughness: 0.75, side: T.DoubleSide });
    const m = new T.Mesh(geo, mat);
    m.scale.set(HR * HS[0] * k * grow, 1, HR * HS[2] * k * grow);
    m.position.y = BY; m.rotation.x = -0.12;
    return m;
  }
  function stripeTex(color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 32;
    const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 256, 32);
    x.fillStyle = '#ffffff'; x.fillRect(0, 6, 256, 4); x.fillRect(0, 22, 256, 4);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = T.RepeatWrapping; return t;
  }
  function terryTex(color) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 32;
    const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 128, 32);
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.18})`; x.fillRect(Math.random() * 128, Math.random() * 32, 1.5, 1.5); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = T.RepeatWrapping; t.repeat.set(3, 1); return t;
  }
  const mat = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

  function makeGear(style, colorHex) {
    const color = new T.Color(colorHex || '#e8a33d');
    const g = new T.Group();
    g.userData.anim = [];
    const top = HR * HS[1];
    switch (style) {
      case 'halo': {
        const ring = new T.Mesh(new T.TorusGeometry(0.085, 0.011, 12, 48), mat(color, { emissive: color, emissiveIntensity: 0.9 }));
        ring.rotation.x = Math.PI / 2; ring.position.y = top + 0.07;
        g.add(ring);
        g.userData.anim.push((t) => { ring.position.y = top + 0.07 + Math.sin(t / 600) * 0.008; });
        break;
      }
      case 'sweatband': g.add(bandRing(color, 0.05, 1.14, terryTex('#' + color.getHexString()))); break;
      case 'stripes': g.add(bandRing(color, 0.04, 1.08, stripeTex('#' + color.getHexString()))); break;
      case 'bow': {
        g.add(bandRing(color));
        const bow = new T.Group(); bow.position.set(-0.05, BY + 0.03, 0.03); bow.rotation.set(0.2, 0.3, 0.35);
        for (const s of [-1, 1]) { const loop = new T.Mesh(new T.SphereGeometry(0.03, 16, 12), mat(color)); loop.scale.set(1.2, 0.8, 0.4); loop.position.x = s * 0.032; bow.add(loop); }
        const knot = new T.Mesh(new T.SphereGeometry(0.014, 12, 10), mat(color)); bow.add(knot);
        g.add(bow); break;
      }
      case 'cat': {
        g.add(bandRing(color));
        for (const s of [-1, 1]) {
          const ear = new T.Mesh(new T.ConeGeometry(0.03, 0.065, 4), mat(color)); ear.position.set(s * 0.052, top + 0.005, -0.005); ear.rotation.set(0, Math.PI / 4, s * -0.35);
          const inner = new T.Mesh(new T.ConeGeometry(0.016, 0.04, 4), mat(0xf4b6c2)); inner.position.set(0, -0.006, 0.012); ear.add(inner);
          g.add(ear);
        }
        break;
      }
      case 'bunny': {
        g.add(bandRing(color));
        for (const s of [-1, 1]) {
          const ear = new T.Group(); ear.position.set(s * 0.035, top - 0.01, -0.01); ear.rotation.z = s * -0.18;
          const outer = new T.Mesh(new T.CapsuleGeometry(0.018, 0.12, 6, 10), mat(color)); outer.scale.z = 0.5; outer.position.y = 0.08; ear.add(outer);
          const inner = new T.Mesh(new T.CapsuleGeometry(0.009, 0.1, 4, 8), mat(0xf4b6c2)); inner.scale.z = 0.4; inner.position.set(0, 0.08, 0.006); ear.add(inner);
          g.add(ear);
          g.userData.anim.push((t) => { ear.rotation.x = Math.sin(t / 700 + s) * 0.08; });
        }
        break;
      }
      case 'flowers': {
        g.add(bandRing(0x4f8a4a, 0.022));
        const k = Math.sqrt(1 - Math.pow(BY / (HR * HS[1]), 2));
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + (i - 3) * 0.55;
          const fl = new T.Group();
          fl.position.set(Math.cos(a) * HR * HS[0] * k * 1.08, BY + 0.012, -Math.sin(a) * HR * HS[2] * k * 1.08 * -1);
          for (let p = 0; p < 5; p++) { const pe = new T.Mesh(new T.SphereGeometry(0.011, 8, 6), mat(i % 2 ? color : 0xffffff)); const pa = p / 5 * Math.PI * 2; pe.position.set(Math.cos(pa) * 0.012, Math.sin(pa) * 0.012, 0); fl.add(pe); }
          const c = new T.Mesh(new T.SphereGeometry(0.008, 8, 6), mat(0xf2c94c)); c.position.z = 0.004; fl.add(c);
          fl.lookAt(fl.position.clone().multiplyScalar(3).setY(BY + 0.05));
          g.add(fl);
        }
        break;
      }
      case 'bandana': {
        g.add(bandRing(color, 0.04, 1.08));
        const knot = new T.Mesh(new T.SphereGeometry(0.02, 12, 10), mat(color)); knot.position.set(0, BY, -HR * HS[2] * 0.82); g.add(knot);
        for (const s of [-1, 1]) {
          const tail = new T.Mesh(new T.BoxGeometry(0.03, 0.14, 0.006), mat(color, { side: T.DoubleSide }));
          tail.geometry.translate(0, -0.07, 0);
          tail.position.set(s * 0.012, BY, -HR * HS[2] * 0.86); tail.rotation.set(-0.45, 0, s * 0.28);
          g.add(tail);
          g.userData.anim.push((t) => { tail.rotation.x = -0.45 - Math.sin(t / 500 + s) * 0.12; tail.rotation.z = s * (0.28 + Math.sin(t / 650) * 0.05); });
        }
        break;
      }
      case 'spikes': {
        g.add(bandRing(color, 0.04, 1.1));
        const k = Math.sqrt(1 - Math.pow(BY / (HR * HS[1]), 2));
        const steel = mat(0xc9ced3, { metalness: 0.7, roughness: 0.3 });
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * Math.PI * 2;
          const sp = new T.Mesh(new T.ConeGeometry(0.009, 0.028, 8), steel);
          const x = Math.cos(a) * HR * HS[0] * k * 1.12, z = Math.sin(a) * HR * HS[2] * k * 1.12;
          sp.position.set(x, BY, z); sp.lookAt(x * 3, BY, z * 3); sp.rotateX(Math.PI / 2);
          g.add(sp);
        }
        break;
      }
      case 'horns': {
        g.add(bandRing(color, 0.04, 1.08));
        const bone = mat(0xe9dfc8, { roughness: 0.5 });
        for (const s of [-1, 1]) {
          const curve = new T.CatmullRomCurve3([new T.Vector3(s * 0.085, BY + 0.005, 0), new T.Vector3(s * 0.13, BY + 0.03, 0.01), new T.Vector3(s * 0.15, BY + 0.09, 0.02), new T.Vector3(s * 0.135, BY + 0.14, 0.03)]);
          const tube = new T.TubeGeometry(curve, 16, 0.018, 10, false);
          // make the horn taper to a point
          const pos = tube.attributes.position; const v = new T.Vector3();
          for (let i = 0; i < pos.count; i++) {
            const ring = Math.floor(i / 11) / 16;
            const c = curve.getPoint(Math.min(1, ring));
            v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(1 - ring * 0.85).add(c);
            pos.setXYZ(i, v.x, v.y, v.z);
          }
          tube.computeVertexNormals();
          g.add(new T.Mesh(tube, bone));
        }
        break;
      }
      default: g.add(bandRing(color)); // plain
    }
    return g;
  }

  // ---------- one mannequin in its chair ----------
  // rope texture: twisted fibres
  const ropeTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d');
    x.fillStyle = '#a88a5c'; x.fillRect(0, 0, 64, 32);
    for (let i = -2; i < 6; i++) {
      const g = x.createLinearGradient(i * 16, 0, i * 16 + 16, 32);
      g.addColorStop(0, '#8a6d42'); g.addColorStop(0.5, '#c9ad7c'); g.addColorStop(1, '#8a6d42');
      x.fillStyle = g; x.beginPath(); x.moveTo(i * 16, 32); x.lineTo(i * 16 + 10, 0); x.lineTo(i * 16 + 18, 0); x.lineTo(i * 16 + 8, 32); x.fill();
    }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; return t;
  })();
  const ropeMat = new T.MeshStandardMaterial({ map: ropeTex, roughness: 0.95 });
  const tapeMat = new T.MeshStandardMaterial({ color: 0x9da1a4, roughness: 0.45, metalness: 0.35, side: T.DoubleSide });
  const woodChair = new T.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.75 });
  // a rope loop around a rounded rectangle (seen from above), at height y
  function ropeLoop(xh, zmin, zmax, y, r = 0.011) {
    const rad = 0.07, pts = [];
    const corners = [[xh - rad, zmax - rad, 0], [-xh + rad, zmax - rad, Math.PI / 2], [-xh + rad, zmin + rad, Math.PI], [xh - rad, zmin + rad, Math.PI * 1.5]];
    for (const [cx, cz, a0] of corners) for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * Math.PI / 2; pts.push(new T.Vector3(cx + Math.cos(a) * rad, y + Math.sin(a * 3 + y * 40) * 0.003, cz + Math.sin(a) * rad)); }
    const curve = new T.CatmullRomCurve3(pts, true, 'centripetal');
    const geo = new T.TubeGeometry(curve, 120, r, 8, true);
    const m = new T.Mesh(geo, ropeMat.clone());
    m.material.map = ropeTex.clone(); m.material.map.needsUpdate = true; m.material.map.repeat.set(Math.round(curve.getLength() / 0.035), 1);
    return m;
  }
  const DOWN = new T.Vector3(0, -1, 0);

  function makeFigure(p) {
    const seat = new T.Group();
    // a plain wooden chair
    const chair = new T.Group();
    const box = (w, h, d, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), woodChair); m.position.set(x, y, z); chair.add(m); return m; };
    box(0.46, 0.045, 0.44, 0, 0.47, -0.02);                       // seat
    for (const x of [-0.2, 0.2]) { box(0.04, 1.02, 0.04, x, 0.51, -0.215); box(0.04, 0.46, 0.04, x, 0.23, 0.17); } // back posts + front legs
    box(0.44, 0.07, 0.03, 0, 0.98, -0.215); box(0.44, 0.05, 0.03, 0, 0.74, -0.215); // back rails
    box(0.04, 0.035, 0.38, -0.2, 0.15, -0.02); box(0.04, 0.035, 0.38, 0.2, 0.15, -0.02); // side stretchers
    // the chair sits right up against the mannequin's back
    const CHAIR_DZ = 0.107;
    chair.position.z = CHAIR_DZ;
    seat.add(chair);

    const fig = new T.Group(); seat.add(fig);
    const add = (geo, x, y, z, parent) => { const m = new T.Mesh(geo, plastic); m.position.set(x, y, z); parent.add(m); return m; };
    // legs together
    const hips = new T.Group(); hips.position.y = 0.5; fig.add(hips);
    const ankles = [];
    for (const side of [-1, 1]) {
      const hp = new T.Group(); hp.position.set(side * 0.082, 0.04, 0); hips.add(hp);
      add(G.thigh, 0, 0.02, 0, hp);
      const kn = new T.Group(); kn.position.set(0, -0.46, 0); hp.add(kn);
      add(G.shin, 0, 0.02, 0, kn);
      const ft = new T.Group(); ft.position.set(0, -0.45, 0); kn.add(ft);
      add(G.foot, 0, -0.02, 0.05, ft);
      const ankle = new T.Object3D(); ankle.position.set(0, -0.37, 0); kn.add(ankle); ankles.push(ankle);
      hp.rotation.set(-Math.PI / 2 + 0.06, 0, -side * 0.085); kn.rotation.set(Math.PI / 2 - 0.1, 0, side * 0.03); ft.rotation.set(0.05, 0, 0);
    }
    const upper = new T.Group(); upper.position.y = 0.5; fig.add(upper);
    const torso = add(G.torso, 0, 0, 0, upper); torso.rotation.x = 0.02;
    const neckG = new T.Group(); neckG.position.set(0, 0.62, 0); upper.add(neckG);
    add(G.neck, 0, 0.06, 0, neckG);
    const headG = new T.Group(); headG.position.set(0, 0.24, 0.008); neckG.add(headG);
    const head = new T.Mesh(G.head, plastic); head.scale.set(...HS); headG.add(head);
    const faceMat = new T.MeshStandardMaterial({ map: blankTex, roughness: 0.42 });
    const face = new T.Mesh(G.face, faceMat); face.scale.set(...HS); headG.add(face);

    // arms: hands together in the lap. Each arm is aimed so the wrist lands where we want it.
    const arms = [], armPath = [];
    const A = 0.29, B = 0.26; // upper arm, forearm
    for (const side of [-1, 1]) {
      const S = new T.Vector3(side * 0.185, 0.555, 0);
      const W = new T.Vector3(side * 0.065, 0.175, 0.235);
      const u = W.clone().sub(S); const d = Math.min(A + B - 0.001, u.length()); u.normalize();
      const cosA = Math.max(-1, Math.min(1, (A * A + d * d - B * B) / (2 * A * d)));
      const pole = new T.Vector3(side * 0.6, -0.2, -0.7).normalize();
      const pp = pole.sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
      const E = S.clone().add(u.clone().multiplyScalar(A * cosA)).add(pp.multiplyScalar(A * Math.sqrt(1 - cosA * cosA)));
      const sh = new T.Group(); sh.position.copy(S); upper.add(sh);
      add(G.shoulder, 0, 0.01, 0, sh).scale.set(1.05, 0.9, 0.95);
      add(G.upperArm, 0, 0, 0, sh);
      const qs = new T.Quaternion().setFromUnitVectors(DOWN, E.clone().sub(S).normalize());
      sh.quaternion.copy(qs);
      const el2 = new T.Group(); el2.position.set(0, -A, 0); sh.add(el2);
      add(G.foreArm, 0, 0, 0, el2);
      const local = W.clone().sub(E).normalize().applyQuaternion(qs.clone().invert());
      el2.quaternion.setFromUnitVectors(DOWN, local);
      const wr = new T.Group(); wr.position.set(0, -B, 0); el2.add(wr);
      const hand = add(G.hand, 0, -0.055, 0, wr);
      // hands point inwards and meet in the middle, palms together
      const want = new T.Vector3(-side, -0.25, 0.35).normalize();
      const qe = qs.clone().multiply(el2.quaternion);
      wr.quaternion.setFromUnitVectors(DOWN, want.applyQuaternion(qe.invert()));
      hand.rotation.y = Math.PI / 2;
      arms.push({ sh, el: el2 });
      armPath.push({ S, E });
    }

    // Ropes pulled tight around the chest and upper arms and around the chair's back posts.
    // At each rope height we take the outline of the chest, both arms and the posts, wrap
    // the rope around that outline (like a real rope would) and pull it in a little so it
    // presses into the body.
    const straps = new T.Group(); seat.add(straps);
    const TP = [[0, -0.03], [0.08, -0.02], [0.128, 0.01], [0.14, 0.06], [0.132, 0.13], [0.118, 0.21], [0.118, 0.27], [0.135, 0.35], [0.158, 0.43], [0.17, 0.49], [0.168, 0.54], [0.148, 0.585], [0.09, 0.615], [0.05, 0.63], [0, 0.635]];
    const torsoR = (yu) => { for (let i = 1; i < TP.length; i++) if (yu <= TP[i][1]) { const [r0, y0] = TP[i - 1], [r1, y1] = TP[i]; return r0 + (r1 - r0) * (yu - y0) / (y1 - y0); } return 0; };
    const ROPE_R = 0.0115;
    function hullAt(y) {
      const yu = y - 0.5, pts = [];
      const tr = torsoR(yu);
      for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; pts.push([Math.cos(a) * tr * 1.2, Math.sin(a) * tr * 0.56]); }
      for (const { S, E } of armPath) {
        const t = Math.max(0, Math.min(1, (S.y - yu) / (S.y - E.y)));
        const cx = S.x + (E.x - S.x) * t, cz = S.z + (E.z - S.z) * t, r = 0.049 - 0.004 * t;
        for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
      }
      for (const px of [-0.2, 0.2]) for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push([px + dx * 0.021, -0.215 + CHAIR_DZ + dz * 0.021]);
      // convex hull (monotone chain)
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], hi = [];
      for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
      for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
      const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
      // push each point outwards by the rope's thickness, minus a little so it bites in
      const out = ROPE_R - 0.0045, n = hull.length, res = [];
      for (let i = 0; i < n; i++) {
        const p = hull[i], a = hull[(i - 1 + n) % n], b = hull[(i + 1) % n];
        let nx = (p[1] - a[1]) + (b[1] - p[1]), nz = -((p[0] - a[0]) + (b[0] - p[0]));
        const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        res.push(new T.Vector3(p[0] - nx * out, y, p[1] - nz * out));
      }
      // make sure the outward direction is right (hull winding)
      const c = res.reduce((m, v) => m.add(v), new T.Vector3()).multiplyScalar(1 / n);
      const test = hull[0], v0 = res[0];
      if (Math.hypot(v0.x - c.x, v0.z - c.z) < Math.hypot(test[0] - c.x, test[1] - c.z)) for (let i = 0; i < n; i++) { const p = hull[i]; res[i].set(p[0] + (p[0] - res[i].x), y, p[1] + (p[1] - res[i].z)); }
      return res;
    }
    function ropeAlong(points, closed = true) {
      const curve = new T.CatmullRomCurve3(points, closed, 'centripetal');
      const geo = new T.TubeGeometry(curve, Math.max(60, points.length * 3), ROPE_R, 8, closed);
      const m = new T.Mesh(geo, ropeMat.clone());
      m.material.map = ropeTex.clone(); m.material.map.needsUpdate = true; m.material.map.repeat.set(Math.round(curve.getLength() / 0.035), 1);
      return m;
    }
    const ropeYs = [0.862, 0.885, 0.908, 0.931];
    for (const y of ropeYs) straps.add(ropeAlong(hullAt(y)));
    // knot at the back of the chair
    const knot = new T.Mesh(new T.SphereGeometry(0.026, 12, 10), ropeMat); knot.scale.set(1.3, 1.1, 0.8); knot.position.set(0, 0.9, -0.25 + CHAIR_DZ); straps.add(knot);
    const tail = new T.Mesh(new T.CylinderGeometry(0.01, 0.009, 0.24, 8), ropeMat); tail.position.set(0.025, 0.78, -0.252 + CHAIR_DZ); tail.rotation.z = 0.15; straps.add(tail);
    seat.updateMatrixWorld(true);
    const ap = ankles.map((o) => seat.worldToLocal(o.getWorldPosition(new T.Vector3())));
    const ax = Math.abs(ap[0].x - ap[1].x) / 2, mid = ap[0].clone().add(ap[1]).multiplyScalar(0.5);
    const tape = new T.Mesh(new T.CylinderGeometry(1, 1, 1, 28, 1, true), tapeMat);
    tape.scale.set(ax + 0.043, 0.065, 0.047); tape.position.copy(mid); straps.add(tape);
    const tape2 = new T.Mesh(tape.geometry, tapeMat); tape2.scale.set(ax + 0.046, 0.03, 0.05); tape2.position.copy(mid).add(new T.Vector3(0, 0.035, 0)); tape2.rotation.z = 0.08; straps.add(tape2);
    const ring = new T.Mesh(G.ring, new T.MeshBasicMaterial({ color: 0xf4c542, transparent: true, opacity: 0.9 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.02, 0.02); ring.visible = false; seat.add(ring);

    const f = {
      id: p.id, seat, fig, upper, neckG, straps, headG, face, faceMat, chair, ring, arms, name: p.name, color: p.color, badge: '', tagExtra: null,
      gear: null, gearKey: '', tag: null, tagKey: '', faceKey: '',
      look: null,                  // { yaw, pitch, inspect, at } from the network
      cur: { yaw: 0, pitch: -0.1, peer: 0, peerYaw: 0 },
      phase: Math.random() * 10,
    };
    // bigger invisible targets so small heads are easy to click or tap
    const hit = new T.MeshBasicMaterial({ visible: false });
    const headHit = new T.Mesh(new T.SphereGeometry(0.24, 12, 8), hit); headG.add(headHit);
    const bodyHit = new T.Mesh(new T.BoxGeometry(0.5, 0.75, 0.4), hit); bodyHit.position.set(0, 0.35, 0); upper.add(bodyHit);
    for (const m of [head, face, torso, headHit, bodyHit]) m.userData.pid = p.id;
    f.pickables = [headHit, bodyHit];
    return f;
  }

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
    const h = 0.085; s.scale.set(h * c.width / c.height, h, 1); // same size on screen near or far
    s.userData.base = s.scale.clone();
    return s;
  }

  // a face with a word "written in marker" (home page)
  function textFace(word) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = Math.round(512 / window.Draw.ASPECT);
    const x = c.getContext('2d');
    x.fillStyle = FACE_BG; x.fillRect(0, 0, c.width, c.height);
    let size = 150;
    x.font = `700 ${size}px Caveat, "Comic Sans MS", cursive`;
    while (x.measureText(word).width > c.width * 0.78 && size > 50) { size -= 6; x.font = `700 ${size}px Caveat, "Comic Sans MS", cursive`; }
    x.translate(c.width / 2, c.height * 0.52);
    x.rotate((word.length % 3 - 1) * 0.05);
    x.fillStyle = '#1b1b2f'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(word, 0, 0);
    return c;
  }

  // ---------- state ----------
  const figures = new Map();
  let layoutKey = '';
  let me = null, mode = 'orbit', demo = false, shift = 0, R = 1.5;
  let lastData = null;
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const view = { yaw: 0, pitch: -0.12, zoom: 1, tYaw: 0, tPitch: -0.12, tZoom: 1, orbit: 0, tOrbit: 0, lean: 0 };
  let autoH = 1.3;
  let focusId = null;
  let onPickCb = null, onLookCb = null;
  let lastMouseAt = 0;
  const mouseN = { x: 0, y: 0, inside: false };

  function seatAngle(i, n, myIndex) { return Math.PI / 2 + (i - myIndex) * (Math.PI * 2 / n); }

  function rebuild(data) {
    for (const f of figures.values()) scene.remove(f.seat);
    figures.clear();
    const list = data.players;
    const n = Math.max(list.length, 2);
    R = Math.max(1.25, 0.45 + n * 0.16);
    const tr = R - 0.6;
    tableTop.scale.set(tr, 1, tr); tableEdge.scale.set(tr, tr, 1);
    rug.scale.set(R + 1.2, R + 1.2, 1);
    const myIndex = mode === 'seat' ? Math.max(0, list.findIndex((p) => p.id === me)) : 0;
    list.forEach((p, i) => {
      const a = seatAngle(i, n, myIndex);
      const f = makeFigure(p);
      f.seat.position.set(R * Math.cos(a), 0, R * Math.sin(a));
      f.seat.lookAt(0, 0, 0);
      f.seat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      if (p.id === me && mode === 'seat') { f.fig.visible = false; f.chair.visible = false; f.straps.visible = false; }
      scene.add(f.seat);
      figures.set(p.id, f);
    });
    view.tYaw = view.yaw = 0; view.tPitch = view.pitch = -0.12; view.tZoom = view.zoom = 1; focusId = null; view.lean = 0;
    let maxA = 0.5;
    const e = baseEye();
    for (const f of figures.values()) {
      if (f.id === me) continue;
      const d = f.seat.position.clone().setY(1.36).sub(e);
      maxA = Math.max(maxA, Math.abs(Math.atan2(d.x, -d.z)));
    }
    autoH = Math.min(2.3, maxA * 2 + 0.3);
  }

  function update(data) {
    lastData = data;
    me = data.me; mode = data.mode === 'seat' ? 'seat' : 'orbit'; demo = !!data.demo; shift = data.shift || 0;
    const key = (demo ? 'D|' : mode === 'seat' ? 'S' + me + '|' : 'O|') + data.players.map((p) => p.id).join(',');
    if (key !== layoutKey) { layoutKey = key; rebuild(data); }
    buildWalls(data.seed || 'home', Array.isArray(data.graffiti) ? data.graffiti : []);
    const ord = (k) => k + (['th', 'st', 'nd', 'rd'][(k % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][k % 100] || 'th');
    for (const p of data.players) {
      const f = figures.get(p.id);
      if (!f) continue;
      // face
      const fk = p.faceText ? 'T:' + p.faceText : p.face ? JSON.stringify(p.face).length + ':' + JSON.stringify(p.face).slice(0, 80) + JSON.stringify(p.face).slice(-40) : 'blank';
      if (fk !== f.faceKey) {
        f.faceKey = fk;
        if (f.faceMat.map && f.faceMat.map !== blankTex) f.faceMat.map.dispose();
        if (p.face || p.faceText) {
          const c = p.faceText ? textFace(p.faceText) : window.Draw.toCanvas(p.face, 512, FACE_BG);
          const tex = new T.CanvasTexture(c);
          tex.colorSpace = T.SRGBColorSpace;
          tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          f.faceMat.map = tex;
        } else f.faceMat.map = blankTex;
        f.faceMat.needsUpdate = true;
      }
      // headband
      const gk = (p.style || 'plain') + '|' + p.color;
      if (gk !== f.gearKey) {
        f.gearKey = gk;
        if (f.gear) f.headG.remove(f.gear);
        f.gear = makeGear(p.style || 'plain', p.color);
        f.headG.add(f.gear);
      }
      // name tag
      const badge = p.done === 'got' ? ord(p.place) : p.done === 'gaveup' ? 'gave up' : p.online === false ? 'away' : p.id === me && mode !== 'seat' ? 'you' : '';
      f.name = p.name; f.color = p.color; f.badge = badge;
      refreshTag(f);
      f.ring.visible = !!p.isTurn && !(p.id === me && mode === 'seat');
      f.online = p.online !== false;
    }
    el.classList.toggle('seat', mode === 'seat');
  }

  function refreshTag(f) {
    // a player inspecting someone shows "looking at <name>" under their name
    const L = f.look && performance.now() - f.look.at < 15000 ? f.look : null;
    const target = L && L.inspect && figures.get(L.inspect);
    const extra = target ? `looking at ${target.name}` : f.badge;
    const tk = f.name + '|' + f.color + '|' + extra;
    if (tk === f.tagKey) return;
    f.tagKey = tk;
    if (f.tag) { f.seat.remove(f.tag); f.tag.material.map.dispose(); f.tag.material.dispose(); }
    f.tag = labelSprite(f.name, f.color, extra);
    f.tag.position.set(0, 1.78, 0);
    f.seat.add(f.tag);
  }

  // speech bubbles above heads (answers and reactions)
  const bubbles = [];
  function bubble(id, text, color = '#1c2321') {
    const f = figures.get(id); if (!f) return;
    for (const b of bubbles) if (b.f === f) b.end = 0; // replace an older bubble
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const emoji = /\p{Extended_Pictographic}/u.test(text) && text.length <= 4;
    const font = emoji ? '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' : '700 44px Archivo, "Helvetica Neue", Arial, sans-serif';
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 56;
    c.width = Math.max(110, w); c.height = 104;
    const r = 20, bh = 84;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(c.width, 0, c.width, bh, r); ctx.arcTo(c.width, bh, 0, bh, r); ctx.arcTo(0, bh, 0, 0, r); ctx.arcTo(0, 0, c.width, 0, r); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(c.width / 2 - 12, bh - 1); ctx.lineTo(c.width / 2, c.height); ctx.lineTo(c.width / 2 + 12, bh - 1); ctx.closePath(); ctx.fill();
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, bh / 2 + 3);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
    s.renderOrder = 11;
    s.userData.base = new T.Vector2(c.width, c.height);
    s.position.set(0, 2.02, 0);
    f.seat.add(s);
    bubbles.push({ f, s, start: performance.now(), end: performance.now() + 3200 });
  }

  // someone else's head direction (yaw/pitch relative to their seat) and who they inspect
  function setLook(id, yaw, pitch, inspect) {
    const f = figures.get(id); if (!f) return;
    f.look = { yaw: +yaw || 0, pitch: +pitch || 0, inspect: inspect || '', at: performance.now() };
    refreshTag(f);
  }

  // ---------- camera ----------
  function headWorld(id) {
    const f = figures.get(id); if (!f) return null;
    const v = new T.Vector3(); f.headG.getWorldPosition(v); return v;
  }
  function baseEye() { return new T.Vector3(0, 1.5, R + 0.42); }
  function eye() {
    if (mode !== 'seat') {
      const d = demo ? R * 1.65 + 1.2 : R * 1.8 + 1.2;
      const h = demo ? R * 0.55 + 1.95 : R * 0.7 + 1.9;
      return new T.Vector3(Math.sin(view.orbit) * d, h, Math.cos(view.orbit) * d);
    }
    const e = baseEye();
    if (view.lean > 0.001 && focusId) {
      const h = headWorld(focusId);
      if (h) e.add(h.clone().sub(e).setY(0).normalize().multiplyScalar(0.45 * view.lean));
    }
    return e;
  }
  function yawPitchTo(target) {
    const e = baseEye();
    const d = target.clone().sub(e);
    return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
  }
  function focus(id) {
    focusId = id || null;
    if (!focusId) { view.tZoom = 1; view.tPitch = -0.12; return; }
    if (mode !== 'seat') return;
    const h = headWorld(focusId); if (!h) return;
    const yp = yawPitchTo(h);
    view.tYaw = yp.yaw; view.tPitch = yp.pitch;
    const dist = baseEye().distanceTo(h) - 0.45;
    view.tZoom = Math.max(0.08, Math.min(1, (Math.atan(0.3 / dist) * 2 * 2.2) / autoH));
  }

  // ---------- input ----------
  const pointers = new Map();
  let dragMoved = 0, pinchDist = 0, downAt = 0;
  const cv = renderer.domElement;
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (e) => {
    try { cv.setPointerCapture(e.pointerId); } catch {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    dragMoved = 0; downAt = performance.now();
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  cv.addEventListener('pointermove', (e) => {
    // computers: just moving the mouse looks around (no click needed)
    // Your head follows the mouse pointer (others see it); pushing the pointer
    // towards the left or right edge turns your whole view that way. The middle of
    // the screen stays still, so players are easy to click.
    if (e.pointerType === 'mouse' && !pointers.size) {
      const r = cv.getBoundingClientRect();
      mouseN.x = ((e.clientX - r.left) / r.width) * 2 - 1; mouseN.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      mouseN.inside = true;
      lastMouseAt = performance.now();
      return;
    }
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: prev.type });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist) view.tZoom = Math.max(0.12, Math.min(1.2, view.tZoom * (pinchDist / d)));
      pinchDist = d; dragMoved += 10;
      return;
    }
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (dragMoved < 6) return;
    const k = view.zoom * 0.005;
    if (mode !== 'seat') view.tOrbit -= dx * 0.008;
    else {
      if (focusId) { focusId = null; view.tZoom = 1; if (onPickCb) onPickCb(null); }
      view.tYaw = Math.max(-1.5, Math.min(1.5, view.tYaw + dx * k));
      view.tPitch = Math.max(-0.75, Math.min(0.35, view.tPitch + dy * k));
    }
  });
  const up = (e) => {
    const wasTap = pointers.size === 1 && dragMoved < 8 && performance.now() - downAt < 600;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (wasTap && e.type === 'pointerup') pick(e);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouseN.inside = false; });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.tZoom = Math.max(0.12, Math.min(1.2, view.tZoom * (e.deltaY > 0 ? 1.1 : 0.9)));
  }, { passive: false });

  const ray = new T.Raycaster();
  function pick(e) {
    if (demo) return;
    const r = cv.getBoundingClientRect();
    const m = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(m, camera);
    const objs = [];
    for (const f of figures.values()) if (f.fig.visible) objs.push(...f.pickables);
    const hit = ray.intersectObjects(objs, false)[0];
    const id = hit && hit.object.userData.pid;
    if (id) { focus(id); if (onPickCb) onPickCb(id); }
    else if (focusId) { focus(null); if (onPickCb) onPickCb(null); }
  }

  // ---------- animation ----------
  const tmpV = new T.Vector3();
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function animateFigure(f, t, dt) {
    const k = Math.min(1, dt * 4);
    let yaw = 0, pitch = -0.1, peer = 0, peerYaw = 0;
    const L = f.look && performance.now() - f.look.at < 15000 ? f.look : null;
    if (L) {
      yaw = L.yaw; pitch = L.pitch;
      if (L.inspect && figures.get(L.inspect)) {
        // peering at someone: the neck bends forward so the head pushes towards them
        f.seat.worldToLocal(tmpV.copy(headWorld(L.inspect)));
        peerYaw = Math.max(-1.2, Math.min(1.2, Math.atan2(tmpV.x, tmpV.z)));
        peer = 1; yaw = 0; pitch = 0;
      }
    } else if (lastData) {
      // nobody steering this one: look around now and then, mostly at whoever's turn it is
      const turn = lastData.players.find((p) => p.isTurn);
      const wander = Math.sin(t / 2300 + f.phase) * 0.7 + Math.sin(t / 5100 + f.phase * 2) * 0.4;
      if (turn && turn.id !== f.id && Math.sin(t / 4000 + f.phase) > -0.3) {
        f.seat.worldToLocal(tmpV.copy(headWorld(turn.id)));
        yaw = Math.atan2(tmpV.x, tmpV.z);
      } else yaw = wander;
      pitch = -0.1 + Math.sin(t / 3100 + f.phase) * 0.08;
    }
    yaw = Math.max(-1.35, Math.min(1.35, wrapA(yaw)));
    f.cur.yaw += (yaw - f.cur.yaw) * k;
    f.cur.pitch += (pitch - f.cur.pitch) * k;
    f.cur.peer += (peer - f.cur.peer) * Math.min(1, dt * 3.5);
    f.cur.peerYaw += (peerYaw - f.cur.peerYaw) * Math.min(1, dt * 3.5);
    const pe = f.cur.peer;
    // only the head (and neck) moves; the body and arms stay still
    f.neckG.rotation.set(0.62 * pe, f.cur.peerYaw * pe + f.cur.yaw * 0.2 * (1 - pe), 0);
    f.neckG.position.z = 0.03 * pe;
    f.headG.rotation.set(-f.cur.pitch * 0.9 * (1 - pe) - 0.5 * pe, f.cur.yaw * 0.8 * (1 - pe), Math.sin(t / 1700 + f.phase) * 0.02 + 0.14 * pe);
    f.upper.position.y = 0.5 + Math.sin(t / 1100 + f.phase) * 0.003; // breathing
    if (f.gear) for (const fn of f.gear.userData.anim) fn(t + f.phase * 1000);
    if (f.ring.visible) { const s = 1 + Math.sin(t / 250) * 0.06; f.ring.scale.set(s, s, s); }
    if (L && performance.now() - L.at > 15000) refreshTag(f);
  }

  let debugCam = null;
  let running = false, last = 0, lookSent = { yaw: 9, pitch: 9, inspect: '', at: 0 };
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
    if (mode !== 'seat' && !calm && pointers.size === 0) view.tOrbit += dt * (demo ? 0.06 : 0.04);
    const mouseOn = mouseN.inside && performance.now() - lastMouseAt < 8000;
    if (mode === 'seat' && !focusId && mouseOn && Math.abs(mouseN.x) > 0.72) {
      const push = (Math.abs(mouseN.x) - 0.72) / 0.28;
      view.tYaw = Math.max(-1.5, Math.min(1.5, view.tYaw - Math.sign(mouseN.x) * push * dt * 1.6));
    }
    if (mode === 'seat' && !focusId && pointers.size === 0 && !mouseOn && performance.now() - lastMouseAt > 2500) view.tYaw *= 1 - dt * 0.3;
    view.yaw += (view.tYaw - view.yaw) * s;
    view.pitch += (view.tPitch - view.pitch) * s;
    view.zoom += (view.tZoom - view.zoom) * s;
    view.orbit += (view.tOrbit - view.orbit) * s;
    view.lean += ((focusId ? 1 : 0) - view.lean) * Math.min(1, dt * 3);

    camera.position.copy(eye());
    if (mode !== 'seat') camera.lookAt(0, demo ? 0.95 : 0.9, 0);
    else camera.rotation.set(view.pitch, view.yaw, 0);
    if (debugCam) { camera.position.copy(debugCam.p); camera.lookAt(debugCam.t); }
    const h = mode !== 'seat' ? 1.15 : autoH * view.zoom;
    let vf = 2 * Math.atan(Math.tan(h / 2) / camera.aspect) * 180 / Math.PI;
    vf = Math.max(6, Math.min(mode !== 'seat' ? 75 : 100, vf));
    if (mode === 'seat' && view.zoom >= 0.99) vf = Math.max(vf, 40);
    camera.fov = vf;
    const W = el.clientWidth, Hh = el.clientHeight;
    if (shift && W) camera.setViewOffset(W, Hh, -W * shift, 0, W, Hh); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    camera.updateProjectionMatrix();

    flicker(t);
    const nowB = performance.now();
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      const age = nowB - b.start, left = b.end - nowB;
      if (left <= 0) { b.f.seat.remove(b.s); b.s.material.map.dispose(); b.s.material.dispose(); bubbles.splice(i, 1); continue; }
      const pop = Math.min(1, age / 160);
      b.s.material.opacity = Math.min(1, left / 400);
      const px = 44 * (0.7 + 0.3 * pop);
      const sh = (2 * px / Math.max(1, Hh)) * Math.tan(camera.fov * Math.PI / 360);
      b.s.scale.set(sh * b.s.userData.base.x / b.s.userData.base.y, sh, 1);
      b.s.visible = b.f.fig.visible;
    }
    for (const f of figures.values()) {
      animateFigure(f, t, dt);
      // name tags hide while you're zoomed in on someone
      if (f.tag) {
        f.tag.visible = !(f.id === me && mode === 'seat') && !(focusId && view.zoom < 0.7);
        // keep tags the same size on screen whatever the lens
        const px = Math.max(18, Math.min(26, Hh * 0.045));            // label height in screen pixels
        const sh = (2 * px / Math.max(1, Hh)) * Math.tan(camera.fov * Math.PI / 360);
        f.tag.scale.set(sh * f.tag.userData.base.x / f.tag.userData.base.y, sh, 1);
      }
    }
    renderer.render(scene, camera);

    // tell the game where I'm looking (a few times a second at most)
    if (mode === 'seat' && onLookCb && me) {
      const now = performance.now();
      const insp = focusId || '';
      // where my eyes point: the view direction plus where the pointer is on screen
      let ly = view.yaw, lp = view.pitch;
      if (mouseOn && !focusId) {
        const tv = Math.tan(camera.fov * Math.PI / 360);
        ly += Math.atan(-mouseN.x * tv * camera.aspect);
        lp += Math.atan(-mouseN.y * tv);
      }
      const changed = Math.abs(ly - lookSent.yaw) > 0.03 || Math.abs(lp - lookSent.pitch) > 0.03 || insp !== lookSent.inspect;
      if ((changed && now - lookSent.at > 160) || now - lookSent.at > 4000) {
        lookSent = { yaw: ly, pitch: lp, inspect: insp, at: now };
        onLookCb({ yaw: Math.round(ly * 100) / 100, pitch: Math.round(lp * 100) / 100, inspect: insp });
      }
    }
  }
  function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
  function stop() { running = false; }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(el);
  window.addEventListener('resize', resize);
  if (document.fonts && document.fonts.load) Promise.all(['400 120px "Permanent Marker"', '700 120px Caveat', '600 40px Archivo'].map((f) => document.fonts.load(f).catch(() => {}))).then(() => { wallKey = ''; for (const f of figures.values()) { f.tagKey = ''; f.faceKey = ''; } if (lastData) update(lastData); });

  // ---------- headband preview (lobby picker) ----------
  // Renders a small picture of a head wearing each style, for the picker buttons.
  let thumbR = null;
  const thumbCache = new Map();
  function gearThumb(style, color) {
    const key = style + color;
    if (thumbCache.has(key)) return thumbCache.get(key);
    if (!thumbR) { thumbR = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); thumbR.setSize(120, 120); thumbR.setPixelRatio(1); thumbR.outputColorSpace = T.SRGBColorSpace; thumbR.toneMapping = T.ACESFilmicToneMapping; }
    const sc = new T.Scene();
    sc.add(new T.HemisphereLight(0xffffff, 0x334a44, 1.4));
    const d = new T.DirectionalLight(0xffffff, 1.6); d.position.set(1, 2, 3); sc.add(d);
    const hg = new T.Group();
    const head = new T.Mesh(G.head, plastic); head.scale.set(...HS); hg.add(head);
    hg.add(makeGear(style, color));
    hg.rotation.y = -0.35;
    sc.add(hg);
    const cam = new T.PerspectiveCamera(30, 1, 0.01, 10); cam.position.set(0, 0.12, 0.72); cam.lookAt(0, 0.07, 0);
    thumbR.render(sc, cam);
    const url = thumbR.domElement.toDataURL('image/png');
    thumbCache.set(key, url);
    return url;
  }

  window.Table3D = {
    supported: true,
    el,
    update,
    setLook,
    focus,
    gearThumb,
    bubble,
    start, stop, resize,
    onPick(cb) { onPickCb = cb; },
    onLook(cb) { onLookCb = cb; },
    _cam(id, dist = 1.6, h = 1.2, side = 0) {
      const f = figures.get(id); if (!f) { debugCam = null; return; }
      const p = new T.Vector3(side, h, dist); f.seat.localToWorld(p);
      const t = new T.Vector3(0, 0.85, 0.1); f.seat.localToWorld(t);
      debugCam = { p, t };
    },
    _screenOf(id) { const h = headWorld(id); if (!h) return null; const v = h.clone().project(camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; },
    _debug() {
      return {
        figures: [...figures.keys()], me, mode,
        faces: [...figures.values()].map((f) => ({ id: f.id, drawn: f.faceKey !== 'blank', visible: f.fig.visible, gear: f.gearKey, lean: +f.cur.peer.toFixed(2), yaw: +f.cur.yaw.toFixed(2), tag: f.tagKey })), bubbles: bubbles.length, walls: wallGroup.children.length,
        view: { yaw: +view.yaw.toFixed(2), focus: focusId },
      };
    },
  };
})();
