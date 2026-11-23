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

  const FACE_BG = '#efece6';
  const el = document.createElement('div');
  el.className = 'scene3d';
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  el.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.background = new T.Color(0x11241f);
  scene.fog = new T.Fog(0x11241f, 7, 22);
  const camera = new T.PerspectiveCamera(50, 1, 0.05, 100);
  camera.rotation.order = 'YXZ';

  // ---------- room ----------
  scene.add(new T.HemisphereLight(0xfff1dc, 0x16302a, 0.8));
  const sun = new T.DirectionalLight(0xfff4e6, 1.4); sun.position.set(3, 8, 4); scene.add(sun);
  const lamp = new T.PointLight(0xffd59a, 16, 9, 2); lamp.position.set(0, 2.5, 0); scene.add(lamp);
  const floor = new T.Mesh(new T.CircleGeometry(16, 48), new T.MeshStandardMaterial({ color: 0x14302a, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const rug = new T.Mesh(new T.CircleGeometry(1, 48), new T.MeshStandardMaterial({ color: 0x1a3b33, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = 0.005; scene.add(rug);
  const shade = new T.Mesh(new T.ConeGeometry(0.32, 0.26, 32, 1, true), new T.MeshStandardMaterial({ color: 0x23302c, roughness: 0.4, metalness: 0.3, side: T.DoubleSide }));
  shade.position.set(0, 2.68, 0); scene.add(shade);
  const bulb = new T.Mesh(new T.SphereGeometry(0.07, 16, 12), new T.MeshBasicMaterial({ color: 0xfff1c9 })); bulb.position.set(0, 2.56, 0); scene.add(bulb);
  const cord = new T.Mesh(new T.CylinderGeometry(0.008, 0.008, 3, 6), new T.MeshBasicMaterial({ color: 0x222222 })); cord.position.set(0, 4.3, 0); scene.add(cord);
  const woodMat = new T.MeshStandardMaterial({ color: 0x5a3c26, roughness: 0.55 });
  const feltMat = new T.MeshStandardMaterial({ color: 0x1f6b52, roughness: 0.95 });
  const tableTop = new T.Mesh(new T.CylinderGeometry(1, 1, 0.06, 64), [woodMat, feltMat, woodMat]); tableTop.position.y = 0.74;
  const tableEdge = new T.Mesh(new T.TorusGeometry(1, 0.035, 12, 64), woodMat); tableEdge.rotation.x = Math.PI / 2; tableEdge.position.y = 0.74;
  const tableLeg = new T.Mesh(new T.CylinderGeometry(0.09, 0.28, 0.72, 24), woodMat); tableLeg.position.y = 0.36;
  scene.add(tableTop, tableEdge, tableLeg);

  // ---------- mannequin parts (shared) ----------
  const plastic = new T.MeshStandardMaterial({ color: 0xefece6, roughness: 0.42 });
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
  function makeFigure(p) {
    const seat = new T.Group();
    const chair = new T.Group();
    const s = new T.Mesh(G.seat, chairMat); s.position.set(0, 0.47, -0.02);
    const b = new T.Mesh(G.back, chairMat); b.position.set(0, 0.76, -0.24);
    chair.add(s, b);
    for (const [x, z] of [[-0.2, -0.21], [0.2, -0.21], [-0.2, 0.17], [0.2, 0.17]]) { const l = new T.Mesh(G.leg, chairMat); l.position.set(x, 0.23, z); chair.add(l); }
    seat.add(chair);

    const fig = new T.Group(); seat.add(fig);
    const add = (geo, x, y, z, parent) => { const m = new T.Mesh(geo, plastic); m.position.set(x, y, z); parent.add(m); return m; };
    // legs stay put; the upper body can lean
    const hips = new T.Group(); hips.position.y = 0.5; fig.add(hips);
    for (const side of [-1, 1]) {
      const hp = new T.Group(); hp.position.set(side * 0.082, 0.04, 0); hips.add(hp);
      add(G.thigh, 0, 0.02, 0, hp);
      const kn = new T.Group(); kn.position.set(0, -0.46, 0); hp.add(kn);
      add(G.shin, 0, 0.02, 0, kn);
      const ft = new T.Group(); ft.position.set(0, -0.45, 0); kn.add(ft);
      add(G.foot, 0, -0.02, 0.05, ft);
      hp.rotation.set(-Math.PI / 2 + 0.06, 0, side * 0.04); kn.rotation.set(Math.PI / 2 - 0.1, 0, 0); ft.rotation.set(0.05, 0, 0);
    }
    const upper = new T.Group(); upper.position.y = 0.5; fig.add(upper);
    const torso = add(G.torso, 0, 0, 0, upper); torso.rotation.x = 0.04;
    add(G.neck, 0, 0.68, 0, upper);
    const headG = new T.Group(); headG.position.set(0, 0.86, 0.008); upper.add(headG);
    const head = new T.Mesh(G.head, plastic); head.scale.set(...HS); headG.add(head);
    const faceMat = new T.MeshStandardMaterial({ map: blankTex, roughness: 0.42 });
    const face = new T.Mesh(G.face, faceMat); face.scale.set(...HS); headG.add(face);
    const arms = [];
    for (const side of [-1, 1]) {
      const sh = new T.Group(); sh.position.set(side * 0.19, 0.555, 0); upper.add(sh);
      add(G.shoulder, 0, 0.01, 0, sh).scale.set(1.05, 0.9, 0.95);
      add(G.upperArm, 0, 0, 0, sh);
      const el2 = new T.Group(); el2.position.set(0, -0.29, 0); sh.add(el2);
      add(G.foreArm, 0, 0, 0, el2);
      const wr = new T.Group(); wr.position.set(0, -0.26, 0); el2.add(wr);
      add(G.hand, 0, -0.06, 0, wr);
      const th = add(G.thumb, side * -0.03, -0.035, 0.012, wr); th.rotation.z = side * 0.5;
      sh.rotation.set(-0.5, 0, side * 0.1); el2.rotation.set(-1.05, 0, 0); wr.rotation.set(0.1, 0, 0);
      arms.push({ sh, el: el2 });
    }
    const ring = new T.Mesh(G.ring, new T.MeshBasicMaterial({ color: 0xf4c542, transparent: true, opacity: 0.9 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.02, 0.02); ring.visible = false; seat.add(ring);

    const f = {
      id: p.id, seat, fig, upper, headG, face, faceMat, chair, ring, arms,
      gear: null, gearKey: '', tag: null, tagKey: '', faceKey: '',
      look: null,                  // { yaw, pitch, inspect, at } from the network
      cur: { yaw: 0, pitch: -0.1, lean: 0, leanYaw: 0 },
      phase: Math.random() * 10,
    };
    head.userData.pid = p.id; face.userData.pid = p.id; torso.userData.pid = p.id;
    f.pickables = [head, face, torso];
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
    R = Math.max(1.5, 0.72 + n * 0.2);
    const tr = R - 0.45;
    tableTop.scale.set(tr, 1, tr); tableEdge.scale.set(tr, tr, 1);
    rug.scale.set(R + 1.2, R + 1.2, 1);
    const myIndex = mode === 'seat' ? Math.max(0, list.findIndex((p) => p.id === me)) : 0;
    list.forEach((p, i) => {
      const a = seatAngle(i, n, myIndex);
      const f = makeFigure(p);
      f.seat.position.set(R * Math.cos(a), 0, R * Math.sin(a));
      f.seat.lookAt(0, 0, 0);
      if (p.id === me && mode === 'seat') { f.fig.visible = false; f.chair.visible = false; }
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
      const tk = p.name + '|' + p.color + '|' + badge;
      if (tk !== f.tagKey) {
        f.tagKey = tk;
        if (f.tag) { f.seat.remove(f.tag); f.tag.material.map.dispose(); f.tag.material.dispose(); }
        f.tag = labelSprite(p.name, p.color, badge);
        f.tag.position.set(0, 1.78, 0);
        f.seat.add(f.tag);
      }
      f.ring.visible = !!p.isTurn && !(p.id === me && mode === 'seat');
      f.online = p.online !== false;
    }
    el.classList.toggle('seat', mode === 'seat');
  }

  // someone else's head direction (yaw/pitch relative to their seat) and who they inspect
  function setLook(id, yaw, pitch, inspect) {
    const f = figures.get(id); if (!f) return;
    f.look = { yaw: +yaw || 0, pitch: +pitch || 0, inspect: inspect || '', at: performance.now() };
  }

  // ---------- camera ----------
  function headWorld(id) {
    const f = figures.get(id); if (!f) return null;
    const v = new T.Vector3(); f.headG.getWorldPosition(v); return v;
  }
  function baseEye() { return new T.Vector3(0, 1.5, R + 0.42); }
  function eye() {
    if (mode !== 'seat') {
      const d = demo ? R * 1.65 + 1.3 : R * 1.9 + 1.4;
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
    let yaw = 0, pitch = -0.1, lean = 0, leanYaw = 0;
    const L = f.look && performance.now() - f.look.at < 15000 ? f.look : null;
    if (L) {
      yaw = L.yaw; pitch = L.pitch;
      if (L.inspect && figures.get(L.inspect)) {
        // leaning in to inspect someone: body and head turn to them
        const target = headWorld(L.inspect);
        f.seat.worldToLocal(tmpV.copy(target));
        const a = Math.atan2(tmpV.x, tmpV.z);
        lean = 0.32; leanYaw = a * 0.45; yaw = a - leanYaw; pitch = Math.atan2(tmpV.y - 1.36, Math.hypot(tmpV.x, tmpV.z)) * 0.6;
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
    f.cur.lean += (lean - f.cur.lean) * Math.min(1, dt * 3);
    f.cur.leanYaw += (leanYaw - f.cur.leanYaw) * Math.min(1, dt * 3);
    // shoulders follow the head a little, so turning looks natural
    f.upper.rotation.set(f.cur.lean, f.cur.leanYaw + f.cur.yaw * 0.18, 0);
    f.headG.rotation.set(-f.cur.pitch * 0.9, f.cur.yaw * 0.82, Math.sin(t / 1700 + f.phase) * 0.02);
    f.upper.position.y = 0.5 + Math.sin(t / 1100 + f.phase) * 0.004; // breathing
    if (f.gear) for (const fn of f.gear.userData.anim) fn(t + f.phase * 1000);
    if (f.ring.visible) { const s = 1 + Math.sin(t / 250) * 0.06; f.ring.scale.set(s, s, s); }
  }

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
    const h = mode !== 'seat' ? 1.15 : autoH * view.zoom;
    let vf = 2 * Math.atan(Math.tan(h / 2) / camera.aspect) * 180 / Math.PI;
    vf = Math.max(6, Math.min(mode !== 'seat' ? 75 : 100, vf));
    if (mode === 'seat' && view.zoom >= 0.99) vf = Math.max(vf, 40);
    camera.fov = vf;
    const W = el.clientWidth, Hh = el.clientHeight;
    if (shift && W) camera.setViewOffset(W, Hh, -W * shift, 0, W, Hh); else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    camera.updateProjectionMatrix();

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
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { for (const f of figures.values()) { f.tagKey = ''; f.faceKey = ''; } if (lastData) update(lastData); });

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
    start, stop, resize,
    onPick(cb) { onPickCb = cb; },
    onLook(cb) { onLookCb = cb; },
    _screenOf(id) { const h = headWorld(id); if (!h) return null; const v = h.clone().project(camera); return [(v.x + 1) / 2, (1 - v.y) / 2]; },
    _debug() {
      return {
        figures: [...figures.keys()], me, mode,
        faces: [...figures.values()].map((f) => ({ id: f.id, drawn: f.faceKey !== 'blank', visible: f.fig.visible, gear: f.gearKey, lean: +f.cur.lean.toFixed(2), yaw: +f.cur.yaw.toFixed(2) })),
        view: { yaw: +view.yaw.toFixed(2), focus: focusId },
      };
    },
  };
})();
