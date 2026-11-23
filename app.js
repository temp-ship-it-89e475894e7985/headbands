/* Headbands — online party guessing game.
 *
 * How it works (no server of our own):
 *  - The person who creates a game becomes the "host". Their browser keeps the
 *    game's state and is the referee.
 *  - Players and host talk through free public message servers (MQTT over
 *    secure WebSockets). Several servers are used at once for reliability.
 *  - The host sends each player a copy of the game in which THAT player's own
 *    word is blanked out, so nobody sees their own card.
 */
(() => {
  'use strict';

  // ---------- small helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const now = () => Date.now();
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
    sget(k, d = null) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    sset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
    sdel(k) { try { sessionStorage.removeItem(k); } catch {} },
  };

  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#a9e34b', '#63e6be', '#ff8787'];
  const MAX_PLAYERS = 12;
  const params = new URLSearchParams(location.search);
  const LOCAL = params.has('local'); // for testing with a server on this computer
  const TIMER_CHOICES = [[0, 'No timer'], [30, '30 seconds'], [60, '1 minute'], [90, '1½ minutes'], [120, '2 minutes']];

  function newCode() { let s = ''; for (let i = 0; i < 4; i++) s += CODE_CHARS[rand(CODE_CHARS.length)]; return s; }
  function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); }
  function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 16); }
  function cleanWord(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40); }
  function shareLink(code) {
    const u = new URL(location.href);
    u.search = ''; u.hash = '';
    u.searchParams.set('room', code);
    if (LOCAL) u.searchParams.set('local', '1');
    return u.toString();
  }
  function setUrlRoom(code) {
    const u = new URL(location.href);
    if (code) u.searchParams.set('room', code); else u.searchParams.delete('room');
    history.replaceState(null, '', u.toString());
  }

  // My identity for this browser tab (survives refresh, not shared between tabs)
  let myKey = store.sget('hb-key');
  if (!myKey) { myKey = 'k' + Math.random().toString(36).slice(2, 12); store.sset('hb-key', myKey); }

  // ---------- app-wide state ----------
  const app = {
    screen: 'home',      // home | connecting | game | ended
    role: null,          // 'host' | 'client'
    code: null,
    name: store.get('hb-name', ''),
    view: null,          // the (filtered) game state I'm looking at
    me: null,            // my player id in the game
    status: '',          // connection status text
    error: '',
    endedMsg: '',
    muted: store.get('hb-muted', false),
    lastEventId: 0,
    joinCode: cleanCode(params.get('room') || ''),
  };

  // ==========================================================
  //  SOUND (tiny beeps, no files)
  // ==========================================================
  let actx = null;
  function beep(freqs, dur = 0.12, type = 'sine', gap = 0.02, vol = 0.18) {
    if (app.muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      let t = actx.currentTime;
      for (const f of freqs) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
        t += dur + gap;
      }
    } catch {}
  }
  const sounds = {
    yourTurn: () => beep([523, 659, 784], 0.13),
    turn: () => beep([440], 0.1),
    gotIt: () => beep([523, 659, 784, 1047], 0.12, 'triangle'),
    tick: () => beep([880], 0.05, 'square', 0, 0.06),
    timeUp: () => beep([330, 262], 0.2, 'sawtooth', 0.02, 0.08),
    join: () => beep([660, 880], 0.07),
  };
  // iPhones only allow sound after a tap
  document.addEventListener('pointerdown', () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch {} }, { once: true });

  // keep the screen awake while in a game (phones)
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch {}
  }


  // Timers that keep ticking even when this tab is in the background
  // (browsers slow normal timers down a lot in hidden tabs).
  let tickWorkerUrl = null;
  function every(ms, fn) {
    try {
      if (!tickWorkerUrl) tickWorkerUrl = URL.createObjectURL(new Blob(['onmessage=function(e){setInterval(function(){postMessage(0)},e.data)}'], { type: 'text/javascript' }));
      const w = new Worker(tickWorkerUrl);
      w.onmessage = fn;
      w.postMessage(ms);
      return { stop() { w.terminate(); } };
    } catch {
      const id = setInterval(fn, ms);
      return { stop() { clearInterval(id); } };
    }
  }

  // ==========================================================
  //  NETWORK: messages travel through free public message
  //  servers (MQTT). We use several at once, so if one is down
  //  the others still carry the game. Duplicates are ignored.
  // ==========================================================
  const BROKERS = LOCAL
    ? [`ws://${location.hostname}:9001`, `ws://${location.hostname}:9002`]
    : ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
  const TOPIC_ROOT = 'headbands-tsi-v2/';
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  const Net = {
    clients: [],
    subs: new Set(),
    seen: new Map(),
    onMsg: null,
    started: false,
    start(onMsg) {
      this.onMsg = onMsg;
      if (this.started) return;
      this.started = true;
      for (const url of BROKERS) {
        let c;
        try {
          c = mqtt.connect(url, {
            clientId: 'hb_' + rid(), clean: true, keepalive: 20, reconnectPeriod: 2500, connectTimeout: 8000,
            protocolVersion: 4, timerVariant: 'worker',
          });
        } catch { continue; }
        c.on('connect', () => {
          if (this.subs.size) c.subscribe([...this.subs], { qos: 0 });
          Net.changed();
        });
        c.on('close', () => Net.changed());
        c.on('offline', () => Net.changed());
        c.on('error', () => {});
        c.on('message', (topic, payload) => {
          let m; try { m = JSON.parse(payload.toString()); } catch { return; }
          if (!m || typeof m !== 'object' || !m.id) return;
          if (this.seen.has(m.id)) return;
          this.seen.set(m.id, now());
          if (this.seen.size > 3000) { const cut = now() - 60000; for (const [k, t] of this.seen) if (t < cut) this.seen.delete(k); }
          if (this.onMsg) this.onMsg(topic, m);
        });
        this.clients.push(c);
      }
    },
    connected() { return this.clients.filter((c) => c.connected).length; },
    sub(topic) {
      this.subs.add(topic);
      for (const c of this.clients) if (c.connected) c.subscribe(topic, { qos: 0 });
    },
    pub(topic, msg) {
      msg.id = msg.id || rid();
      const s = JSON.stringify(msg);
      let sent = 0;
      for (const c of this.clients) if (c.connected) { try { c.publish(topic, s, { qos: 0 }); sent++; } catch {} }
      return sent;
    },
    wake() { for (const c of this.clients) if (!c.connected && !c.disconnecting) { try { c.reconnect(); } catch {} } },
    stop() {
      for (const c of this.clients) { try { c.end(false); } catch {} }
      this.clients = []; this.subs.clear(); this.started = false; this.onMsg = null;
    },
    statusCb: null,
    changed() { if (this.statusCb) this.statusCb(this.connected()); },
  };
  const T = {
    up: (code) => `${TOPIC_ROOT}${code}/up`,
    down: (code, key) => `${TOPIC_ROOT}${code}/down/${key}`,
    all: (code) => `${TOPIC_ROOT}${code}/all`,
    check: (code) => `${TOPIC_ROOT}${code}/check`,
  };

  // ==========================================================
  //  HOST: the referee. Holds the full game.
  // ==========================================================
  const host = {
    state: null,
    lastSeen: new Map(),   // key -> time we last heard from them
    kicked: new Set(),
    tickTimer: null,
    pingTimer: null,
    noNetTimer: null,
  };

  function freshState(code, hostName) {
    return {
      code,
      v: 1,                         // version number, goes up on every change
      phase: 'lobby',               // lobby | picking | playing | over
      round: 1,
      settings: { theme: 'animals', customTheme: '', turnSeconds: 60 },
      players: [{ id: 'p0', key: myKey, name: hostName, color: COLORS[0], online: true, isHost: true, playing: false }],
      nextId: 1,
      pickFor: {},                  // pickerId -> targetId
      words: {},                    // targetId -> word
      order: [],                    // turn order (player ids)
      turnIdx: 0,
      turnId: null,
      turnEndsAt: 0,
      turnsTaken: {},               // id -> number of turns used
      results: [],                  // [{ id, how: 'got'|'gaveup'|'unfinished', turns }]
      event: { id: 0, text: '', kind: '' },
    };
  }

  const H = {
    player(id) { return host.state.players.find((p) => p.id === id); },
    byKey(key) { return host.state.players.find((p) => p.key === key); },
    done(id) { return host.state.results.some((r) => r.id === id); },
    unfinished() { return host.state.order.filter((id) => !H.done(id)); },
    themeName() {
      const s = host.state.settings;
      if (s.theme === 'custom') return s.customTheme || 'Custom';
      return (window.THEMES[s.theme] || {}).name || 'Anything';
    },
    event(text, kind = '') { const e = host.state.event; host.state.event = { id: e.id + 1, text, kind }; },
  };

  function hostStart(code, resumeState) {
    app.role = 'host';
    app.code = code;
    host.state = resumeState || freshState(code, app.name);
    if (resumeState) {
      // everyone else is offline until we hear from them again
      for (const p of host.state.players) p.online = p.key === myKey;
      host.state.v = (host.state.v || 1) + 1;
    }
    app.me = (H.byKey(myKey) || {}).id;
    app.screen = 'connecting';
    app.status = resumeState ? 'Reopening your game…' : 'Creating your game…';
    render();

    Net.statusCb = (n) => {
      if (app.role !== 'host') return;
      if (n > 0 && app.screen === 'game' && app.status) { app.status = ''; renderStatusOnly(); }
      if (n === 0 && app.screen === 'game') { app.status = 'Reconnecting to the game servers…'; renderStatusOnly(); }
    };
    Net.start(hostOnMsg);
    Net.sub(T.up(code));
    Net.sub(T.check(code));

    let checked = !!resumeState;
    const t0 = now();
    const waitReady = setInterval(() => {
      if (app.role !== 'host' || app.code !== code) return clearInterval(waitReady);
      if (!Net.connected()) {
        if (now() - t0 > 15000) app.status = 'Can\'t reach the game servers. Check your internet — still trying…', render();
        return;
      }
      if (!checked) {
        // make sure nobody else is already using this code
        checked = 'asking';
        host.checkStarted = now();
        Net.pub(T.check(code), { t: 'check', key: myKey });
        return;
      }
      if (checked === 'asking' && now() - host.checkStarted < 1500) return;
      clearInterval(waitReady);
      hostReady();
    }, 250);
  }

  function hostReady() {
    app.status = '';
    app.screen = 'game';
    store.sset('hb-hosting', app.code);
    setUrlRoom(app.code);
    hostChanged();
    startHostTimers();
  }

  function hostOnMsg(topic, m) {
    if (app.role !== 'host') return;
    const code = app.code;
    if (topic === T.check(code)) {
      if (m.t === 'check' && m.key !== myKey && app.screen === 'game') Net.pub(T.check(code), { t: 'taken', to: m.key });
      else if (m.t === 'taken' && m.to === myKey && app.screen === 'connecting') {
        // code already in use: pick a new one
        Net.stop();
        hostStart(newCode());
      }
      return;
    }
    if (topic !== T.up(code) || app.screen !== 'game') return;
    const key = String(m.key || '').slice(0, 40);
    if (!key || key === myKey) return;
    if (host.kicked.has(key)) { Net.pub(T.down(code, key), { t: 'kicked' }); return; }
    host.lastSeen.set(key, now());
    const p = H.byKey(key);
    if (m.t === 'hello') hostHello(key, m);
    else if (m.t === 'pong' || m.t === 'resync') {
      if (p && !p.online) { p.online = true; H.event(`${p.name} is back`, 'join'); hostChanged(); }
      else if (p && (m.t === 'resync' || m.v !== host.state.v)) hostSendTo(p);
    } else if (m.t === 'action' && p) {
      if (!p.online) { p.online = true; }
      hostAction(p.id, m);
    }
  }

  function hostHello(key, msg) {
    const st = host.state;
    const name = cleanName(msg.name) || 'Player';
    let p = H.byKey(key);
    if (!p) {
      // same name as someone who dropped out? Let them take their seat back.
      p = st.players.find((x) => !x.online && !x.isHost && x.name.toLowerCase() === name.toLowerCase());
      if (p) p.key = key;
    }
    if (!p) {
      if (st.players.length >= MAX_PLAYERS) { Net.pub(T.down(app.code, key), { t: 'error', msg: 'This game is full (12 players max).' }); return; }
      let finalName = name, n = 2;
      while (st.players.some((x) => x.name.toLowerCase() === finalName.toLowerCase())) finalName = `${name} ${n++}`;
      const used = new Set(st.players.map((x) => x.color));
      const color = COLORS.find((c) => !used.has(c)) || COLORS[rand(COLORS.length)];
      p = { id: 'p' + st.nextId++, key, name: finalName, color, online: true, isHost: false, playing: false };
      st.players.push(p);
      H.event(st.phase === 'lobby' ? `${finalName} joined` : `${finalName} is watching (joins next round)`, 'join');
    } else if (!p.online) {
      H.event(`${p.name} is back`, 'join');
    }
    p.online = true;
    hostChanged();
  }

  function hostSendTo(p) {
    if (!p || p.key === myKey) return;
    Net.pub(T.down(app.code, p.key), { t: 'state', v: host.state.v, s: viewFor(p.id), you: p.id, remaining: remainingMs() });
  }

  function hostChanged() {
    const st = host.state;
    st.v = (st.v || 1) + 1;
    store.set('hb-host-' + st.code, { state: st, savedAt: now(), name: app.name });
    for (const p of st.players) if (p.online && p.key !== myKey) hostSendTo(p);
    receiveState(viewFor(app.me), app.me, remainingMs());
  }

  function remainingMs() {
    const st = host.state;
    return st.phase === 'playing' && st.turnEndsAt ? Math.max(0, st.turnEndsAt - now()) : 0;
  }

  // the copy of the game a given player is allowed to see
  function viewFor(pid) {
    const st = host.state;
    const v = JSON.parse(JSON.stringify(st));
    v.players.forEach((p) => { delete p.key; });
    const amPlaying = st.order.includes(pid);
    const canSeeOwn = st.phase === 'over' || !amPlaying || H.done(pid);
    if (!canSeeOwn && v.words[pid] != null) v.words[pid] = '•••';
    v.themeName = H.themeName();
    v.wordsReady = Object.keys(st.words);
    return v;
  }

  function startHostTimers() {
    if (host.tickTimer) host.tickTimer.stop(); if (host.pingTimer) host.pingTimer.stop();
    host.tickTimer = every(250, () => {
      const st = host.state;
      if (st.phase === 'playing' && st.turnEndsAt && now() >= st.turnEndsAt) {
        const p = H.player(st.turnId);
        hostNextTurn();
        H.event(`Time's up${p ? ' for ' + p.name : ''}!`, 'timeup');
        hostChanged();
      }
    });
    host.pingTimer = every(3000, () => {
      const st = host.state;
      let changed = false;
      for (const p of st.players) {
        if (p.key === myKey || !p.online) continue;
        const seen = host.lastSeen.get(p.key) || 0;
        if (now() - seen > 15000) { p.online = false; changed = true; }
      }
      if (changed) hostChanged();
      Net.pub(T.all(app.code), { t: 'ping', v: st.v, remaining: remainingMs() });
    });
  }

  // ----- game rules -----
  function hostNextTurn(countTurn = true) {
    const st = host.state;
    if (countTurn && st.turnId && !H.done(st.turnId)) st.turnsTaken[st.turnId] = (st.turnsTaken[st.turnId] || 0) + 1;
    const left = H.unfinished();
    if (!left.length) return hostGameOver();
    // go round the table from the current seat; prefer people who are online
    const n = st.order.length;
    let pick = null;
    for (const wantOnline of [true, false]) {
      for (let step = 1; step <= n; step++) {
        const idx = (st.turnIdx + step) % n;
        const id = st.order[idx];
        if (H.done(id)) continue;
        const p = H.player(id);
        if (wantOnline && !(p && p.online)) continue;
        pick = idx; break;
      }
      if (pick != null) break;
    }
    if (pick == null) pick = st.order.indexOf(left[0]);
    st.turnIdx = pick;
    st.turnId = st.order[pick];
    st.turnEndsAt = st.settings.turnSeconds ? now() + st.settings.turnSeconds * 1000 : 0;
  }

  function hostGameOver(endedEarly = false) {
    const st = host.state;
    for (const id of st.order) if (!H.done(id)) st.results.push({ id, how: 'unfinished', turns: st.turnsTaken[id] || 0 });
    st.phase = 'over';
    st.turnId = null; st.turnEndsAt = 0;
    H.event(endedEarly ? 'The host ended the game' : 'Everyone\'s done!', 'over');
  }

  function hostAction(pid, msg) {
    const st = host.state;
    const me = H.player(pid);
    if (!me) return;
    const isHost = me.isHost;
    const a = msg.a;

    if (a === 'settings' && isHost && st.phase === 'lobby') {
      const s = msg.settings || {};
      if (s.theme && (window.THEMES[s.theme] || s.theme === 'custom')) st.settings.theme = s.theme;
      if (typeof s.customTheme === 'string') st.settings.customTheme = s.customTheme.trim().slice(0, 40);
      if (TIMER_CHOICES.some(([v]) => v === s.turnSeconds)) st.settings.turnSeconds = s.turnSeconds;
    } else if (a === 'kick' && isHost && st.phase === 'lobby') {
      const p = H.player(msg.target);
      if (!p || p.isHost) return;
      st.players = st.players.filter((x) => x !== p);
      host.kicked.add(p.key);
      Net.pub(T.down(app.code, p.key), { t: 'kicked' });
    } else if (a === 'start' && isHost && st.phase === 'lobby') {
      const ids = st.players.filter((p) => p.online).map((p) => p.id);
      if (ids.length < 2) return;
      // sit everyone in a random circle; each person picks the word for the next person
      const circle = shuffle(ids);
      st.pickFor = {};
      circle.forEach((id, i) => { st.pickFor[id] = circle[(i + 1) % circle.length]; });
      st.words = {}; st.results = []; st.turnsTaken = {};
      st.order = shuffle(ids);
      st.players.forEach((p) => { p.playing = ids.includes(p.id); });
      st.phase = 'picking';
      H.event('Pick a word for your player!', 'start');
    } else if (a === 'word' && st.phase === 'picking') {
      // a player picks for their target; the host may pick on behalf of someone who left
      let picker = pid;
      if (msg.for && isHost) picker = msg.for;
      const target = st.pickFor[picker];
      const w = cleanWord(msg.word);
      if (!target || !w) return;
      st.words[target] = w;
      if (st.order.every((id) => st.words[id])) {
        st.phase = 'playing';
        st.turnIdx = -1; st.turnId = null;
        hostNextTurn(false);
        H.event('Everyone has a word. Let\'s play!', 'go');
      }
    } else if (a === 'gotit' && st.phase === 'playing') {
      const target = msg.target;
      if (target === pid || !st.order.includes(target) || H.done(target)) return;
      const wasTurn = st.turnId === target;
      st.results.push({ id: target, how: 'got', turns: (st.turnsTaken[target] || 0) + (wasTurn ? 1 : 0) });
      const tp = H.player(target);
      H.event(`${tp.name} got it! It was “${st.words[target]}”`, 'gotit');
      if (!H.unfinished().length) hostGameOver();
      else if (wasTurn) hostNextTurn(false);
    } else if (a === 'giveup' && st.phase === 'playing') {
      if (!st.order.includes(pid) || H.done(pid)) return;
      const wasTurn = st.turnId === pid;
      st.results.push({ id: pid, how: 'gaveup', turns: (st.turnsTaken[pid] || 0) + (wasTurn ? 1 : 0) });
      H.event(`${me.name} gave up. It was “${st.words[pid]}”`, 'gaveup');
      if (!H.unfinished().length) hostGameOver();
      else if (wasTurn) hostNextTurn(false);
    } else if (a === 'next' && st.phase === 'playing') {
      if (pid !== st.turnId && !isHost) return;
      // ignore a double-tap that arrives after the turn already moved on
      if (msg.turn && msg.turn !== st.turnId) return;
      hostNextTurn();
    } else if (a === 'end' && isHost && (st.phase === 'playing' || st.phase === 'picking')) {
      if (st.phase === 'picking') { st.phase = 'lobby'; st.players.forEach((p) => { p.playing = false; }); H.event('The host cancelled the round', ''); }
      else hostGameOver(true);
    } else if (a === 'again' && isHost && st.phase === 'over') {
      st.phase = 'lobby';
      st.round++;
      st.words = {}; st.pickFor = {}; st.order = []; st.results = []; st.turnsTaken = {};
      st.turnId = null; st.turnEndsAt = 0;
      st.players = st.players.filter((p) => p.online || p.isHost);
      st.players.forEach((p) => { p.playing = false; });
      H.event('New round! Waiting for the host to start', '');
    } else return;
    hostChanged();
  }

  function hostClose() {
    if (app.code) Net.pub(T.all(app.code), { t: 'closed' });
    store.del('hb-host-' + app.code);
    store.sdel('hb-hosting');
    if (host.tickTimer) host.tickTimer.stop(); if (host.pingTimer) host.pingTimer.stop(); host.tickTimer = host.pingTimer = null;
    host.lastSeen.clear(); host.kicked.clear();
    setTimeout(() => Net.stop(), 500);
  }

  // ==========================================================
  //  CLIENT: everyone who joins with a code
  // ==========================================================
  const client = { everConnected: false, lastHost: 0, timer: null, v: 0, joinStarted: 0, netTime: 0 };

  function clientStart(code) {
    app.role = 'client';
    app.code = code;
    app.screen = 'connecting';
    app.status = `Joining game ${code}…`;
    store.sset('hb-joined', code);
    setUrlRoom(code);
    render();
    client.everConnected = false; client.v = 0; client.netTime = 0; client.lastHost = 0;
    Net.statusCb = (n) => {
      if (app.role !== 'client') return;
      if (n > 0) clientHello();
    };
    Net.start(clientOnMsg);
    Net.sub(T.down(code, myKey));
    Net.sub(T.all(code));
    if (client.timer) client.timer.stop();
    let lastTick = now();
    client.timer = every(2000, () => {
      if (app.role !== 'client') return;
      const t = now(); const dt = t - lastTick; lastTick = t;
      const n = Net.connected();
      if (!n) {
        if (client.everConnected) { app.status = 'Reconnecting…'; renderStatusOnly(); }
        else if (t - (client.joinStarted || t) > 15000) { app.status = 'Can\'t reach the game servers. Check your internet — still trying…'; render(); }
        client.joinStarted = client.joinStarted || t;
        return;
      }
      client.netTime += Math.min(dt, 2000);
      if (!client.everConnected) {
        clientHello();
        // only count time we were actually online, so a slow connection doesn't fail the join
        if (client.netTime > 15000) showFatal(`No game found with code ${app.code}. Check the code — and make sure the host still has the game open.`, true);
        return;
      }
      Net.pub(T.up(app.code), { t: 'pong', key: myKey, v: client.v });
      if (t - client.lastHost > 10000) { app.status = 'Waiting for the host to come back…'; renderStatusOnly(); }
    });
    clientHello();
  }

  function clientHello() {
    if (app.role === 'client' && app.code) Net.pub(T.up(app.code), { t: 'hello', key: myKey, name: app.name });
  }

  function clientOnMsg(topic, m) {
    if (app.role !== 'client') return;
    if (m.t === 'state' && topic === T.down(app.code, myKey)) {
      if (client.everConnected && m.v < client.v) return; // older message arriving late
      client.v = m.v;
      client.everConnected = true;
      client.lastHost = now();
      if (app.status) app.status = '';
      if (app.screen === 'connecting') app.screen = 'game';
      receiveState(m.s, m.you, m.remaining);
    } else if (m.t === 'ping' && topic === T.all(app.code)) {
      client.lastHost = now();
      if (!client.everConnected) { clientHello(); return; }
      if (app.view && app.view.phase === 'playing') localTurnEnd = m.remaining ? now() + m.remaining : 0;
      if (m.v !== client.v) Net.pub(T.up(app.code), { t: 'resync', key: myKey });
      if (app.status) { app.status = ''; renderStatusOnly(); }
    } else if (m.t === 'kicked') {
      clientStop(); showEnded('The host removed you from the game.');
    } else if (m.t === 'closed') {
      clientStop(); showEnded('The host closed the game.');
    } else if (m.t === 'error' && topic === T.down(app.code, myKey)) {
      clientStop(); showFatal(m.msg || 'Something went wrong.', true);
    }
  }

  function clientStop() {
    app.role = null;
    store.sdel('hb-joined');
    if (client.timer) { client.timer.stop(); client.timer = null; }
    Net.stop();
    client.everConnected = false;
  }

  function send(action) {
    if (app.role === 'host') hostAction(app.me, action);
    else if (Net.connected()) Net.pub(T.up(app.code), { t: 'action', key: myKey, ...action });
    else toast('Not connected right now — trying again…');
  }


  // ==========================================================
  //  Shared: receiving a new picture of the game
  // ==========================================================
  let localTurnEnd = 0;
  let lastTurnId = null;
  let lastPhase = null;
  let lastTickSecond = -1;

  function receiveState(v, you, remaining) {
    const prev = app.view;
    app.view = v;
    app.me = you;
    localTurnEnd = remaining ? now() + remaining : 0;
    // events -> toasts + sounds
    if (v.event && v.event.id !== app.lastEventId) {
      const first = app.lastEventId === 0 && !prev;
      app.lastEventId = v.event.id;
      if (!first && v.event.text) {
        toast(v.event.text);
        if (v.event.kind === 'gotit') sounds.gotIt();
        else if (v.event.kind === 'timeup') sounds.timeUp();
        else if (v.event.kind === 'join') sounds.join();
      }
    }
    if (v.phase === 'playing' && v.turnId !== lastTurnId) {
      if (lastTurnId !== null || lastPhase === 'picking') (v.turnId === you ? sounds.yourTurn : sounds.turn)();
    }
    lastTurnId = v.phase === 'playing' ? v.turnId : null;
    lastPhase = v.phase;
    keepAwake(v.phase === 'playing' || v.phase === 'picking');
    render();
  }

  // ==========================================================
  //  RENDERING
  // ==========================================================
  const root = $('#app');

  function render() {
    // remember what the person was typing so a refresh of the screen doesn't wipe it
    const active = document.activeElement;
    const activeId = active && active.id;
    const sel = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
    const values = {};
    root.querySelectorAll('input[id], textarea[id]').forEach((el) => { values[el.id] = el.value; });

    let html = '';
    if (app.screen === 'home') html = homeHTML();
    else if (app.screen === 'connecting') html = connectingHTML();
    else if (app.screen === 'ended') html = endedHTML();
    else if (app.screen === 'game' && app.view) html = gameHTML();
    else html = connectingHTML();
    root.innerHTML = html;

    for (const id in values) { const el = document.getElementById(id); if (el && el.dataset.keep !== 'no') el.value = values[id]; }
    if (activeId) {
      const el = document.getElementById(activeId);
      if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch {} } }
    }
    updateTimer();
  }

  function renderStatusOnly() {
    const el = $('#connbar');
    if (el) { el.textContent = app.status; el.classList.toggle('show', !!app.status); }
    else render();
  }

  function logoHTML(small) {
    return `<div class="logo ${small ? 'small' : ''}"><span class="lc">🃏</span><span>Head<b>bands</b></span></div>`;
  }

  function homeHTML() {
    const joining = !!app.joinCode;
    return `
    <main class="home">
      ${logoHTML()}
      <p class="tag">Everyone can see your card — except you.<br>Ask yes/no questions to figure out who or what you are!</p>
      <div class="panel">
        <label class="lbl" for="name">Your name</label>
        <input id="name" class="inp" maxlength="16" autocomplete="nickname" placeholder="e.g. Sam" value="${esc(app.name)}">
        ${joining ? `
          <button class="btn big primary" data-act="join">Join game <span class="code-chip">${esc(app.joinCode)}</span></button>
          <button class="btn link" data-act="notjoin">Use a different code or create a game</button>
        ` : `
          <button class="btn big primary" data-act="create">✨ Create a game</button>
          <div class="or"><span>or join a friend</span></div>
          <div class="row">
            <input id="code" class="inp code" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="CODE" value="${esc(app.joinCode)}">
            <button class="btn primary" data-act="join">Join</button>
          </div>
        `}
        ${app.error ? `<p class="err">${esc(app.error)}</p>` : ''}
      </div>
      <details class="how">
        <summary>How to play</summary>
        <ol>
          <li>One person creates a game and shares the link or code. Hop on a voice call (Discord, FaceTime…).</li>
          <li>The host picks a theme. Then each player secretly picks a word for another player's headband.</li>
          <li>You see everyone's word — except your own.</li>
          <li>On your turn, ask yes/no questions out loud (“Am I an animal?”). Everyone answers.</li>
          <li>When someone guesses their word, anyone taps <b>Got it</b> on their card. First to guess wins!</li>
        </ol>
      </details>
    </main>`;
  }

  function connectingHTML() {
    return `<main class="center"><div class="spinner"></div><p class="status">${esc(app.status || 'Connecting…')}</p>
      <button class="btn link" data-act="leave">Cancel</button></main>`;
  }

  function endedHTML() {
    return `<main class="center">${logoHTML(true)}<p class="status">${esc(app.endedMsg)}</p>
      <button class="btn primary" data-act="home">Back to start</button></main>`;
  }

  function P(id) { return app.view.players.find((p) => p.id === id); }
  function isMe(id) { return id === app.me; }
  function amHost() { const p = P(app.me); return !!(p && p.isHost); }
  function result(id) { return app.view.results.find((r) => r.id === id); }

  function avatar(p, size = '') {
    return `<span class="av ${size}" style="--c:${p.color}">${esc((p.name || '?').slice(0, 1).toUpperCase())}</span>`;
  }

  function topBar() {
    const v = app.view;
    return `
    <header class="top">
      ${logoHTML(true)}
      <div class="top-r">
        <button class="chip" data-act="share" title="Invite friends">Code <b>${esc(v.code)}</b> 🔗</button>
        <button class="icon" data-act="mute" title="${app.muted ? 'Sound off' : 'Sound on'}">${app.muted ? '🔇' : '🔊'}</button>
        <button class="icon" data-act="leave" title="Leave">🚪</button>
      </div>
    </header>
    <div id="connbar" class="connbar ${app.status ? 'show' : ''}">${esc(app.status)}</div>`;
  }

  function gameHTML() {
    const v = app.view;
    let body = '';
    if (v.phase === 'lobby') body = lobbyHTML();
    else if (v.phase === 'picking') body = pickingHTML();
    else if (v.phase === 'playing') body = playingHTML();
    else if (v.phase === 'over') body = overHTML();
    return `${topBar()}<main class="game">${body}</main>`;
  }

  function themeLabel(v) {
    const t = window.THEMES[v.settings.theme];
    return v.settings.theme === 'custom' ? `✏️ ${esc(v.themeName)}` : `${t ? t.emoji : '🎲'} ${esc(v.themeName)}`;
  }

  // ----- lobby -----
  function lobbyHTML() {
    const v = app.view;
    const hostMe = amHost();
    const online = v.players.filter((p) => p.online).length;
    const timerLabel = (TIMER_CHOICES.find(([s]) => s === v.settings.turnSeconds) || [0, 'No timer'])[1];
    const themeOpts = Object.entries(window.THEMES).map(([k, t]) => `<option value="${k}" ${v.settings.theme === k ? 'selected' : ''}>${t.emoji} ${esc(t.name)}</option>`).join('')
      + `<option value="custom" ${v.settings.theme === 'custom' ? 'selected' : ''}>✏️ Make up your own…</option>`;
    return `
    <section class="panel">
      <h2>Invite your friends</h2>
      <p class="muted">Send them this link, or tell them the code <b class="code-chip">${esc(v.code)}</b></p>
      <div class="row">
        <input id="sharelink" class="inp" readonly value="${esc(shareLink(v.code))}" data-keep="no">
        <button class="btn" data-act="share">Copy</button>
      </div>
    </section>

    <section class="panel">
      <h2>Players <span class="muted">(${online})</span></h2>
      <ul class="plist">
        ${v.players.map((p) => `
          <li class="${p.online ? '' : 'off'}">
            ${avatar(p)} <span class="pn">${esc(p.name)}${isMe(p.id) ? ' <i>(you)</i>' : ''}</span>
            ${p.isHost ? '<span class="tagx">host</span>' : ''}
            ${!p.online ? '<span class="tagx grey">away</span>' : ''}
            ${hostMe && !p.isHost ? `<button class="x" data-act="kick" data-id="${p.id}" title="Remove">✕</button>` : ''}
          </li>`).join('')}
      </ul>
      ${online < 2 ? '<p class="muted small">Waiting for at least one more player…</p>' : ''}
    </section>

    <section class="panel">
      <h2>Game settings</h2>
      ${hostMe ? `
        <label class="lbl" for="theme">Theme</label>
        <select id="theme" class="inp" data-act-change="theme">${themeOpts}</select>
        ${v.settings.theme === 'custom' ? `
          <input id="customTheme" class="inp" maxlength="40" placeholder="e.g. Things at school" value="${esc(v.settings.customTheme)}" data-act-input="customTheme">
        ` : ''}
        <label class="lbl" for="timer">Time per turn</label>
        <select id="timer" class="inp" data-act-change="timer">
          ${TIMER_CHOICES.map(([s, l]) => `<option value="${s}" ${v.settings.turnSeconds === s ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="btn big primary" data-act="start" ${online < 2 ? 'disabled' : ''}>▶ Start game</button>
      ` : `
        <p><b>Theme:</b> ${themeLabel(v)}</p>
        <p><b>Time per turn:</b> ${timerLabel}</p>
        <p class="muted">Waiting for the host to start…</p>
      `}
    </section>`;
  }

  // ----- picking words -----
  function pickingHTML() {
    const v = app.view;
    const myTarget = v.pickFor[app.me];
    const tp = myTarget && P(myTarget);
    const myPick = myTarget ? v.words[myTarget] : null;
    const pickers = Object.keys(v.pickFor);
    const hostMe = amHost();
    const theme = window.THEMES[v.settings.theme];
    const editing = !myPick || pickEditing;

    let mine = '';
    if (!myTarget) {
      mine = `<section class="panel"><h2>Round in progress</h2><p class="muted">You joined mid-game, so you'll play next round. Hang tight!</p></section>`;
    } else if (editing) {
      mine = `
      <section class="panel pick">
        <p class="muted">Theme: <b>${themeLabel(v)}</b></p>
        <h2>Pick a word for ${avatar(tp, 'sm')} <span style="color:${tp.color}">${esc(tp.name)}</span></h2>
        <p class="muted small">They'll wear it on their headband. Everyone sees it except them — so keep it secret!</p>
        <input id="word" class="inp big" maxlength="40" placeholder="Type a word…" autocomplete="off" value="${esc(myPick || '')}">
        ${theme && theme.words.length ? `<div class="ideas">${pickIdeas.map((w) => `<button class="idea" data-act="idea" data-w="${esc(w)}">${esc(w)}</button>`).join('')}
          <button class="idea dice" data-act="ideas">🎲 More ideas</button></div>` : ''}
        <button class="btn big primary" data-act="lock">🔒 Lock it in</button>
      </section>`;
    } else {
      mine = `
      <section class="panel pick done">
        <h2>✅ You picked <span class="bigword">${esc(myPick)}</span> for ${esc(tp.name)}</h2>
        <button class="btn link" data-act="change">Change my word</button>
      </section>`;
    }

    const waiting = pickers.map((pid) => {
      const p = P(pid); const t = P(v.pickFor[pid]);
      const done = v.wordsReady.includes(v.pickFor[pid]);
      return `<li class="${p.online ? '' : 'off'}">${avatar(p)} <span class="pn">${esc(p.name)}</span>
        <span class="muted small">→ ${esc(t ? t.name : '?')}</span>
        ${done ? '<span class="ok">✓ ready</span>' : '<span class="muted small">choosing…</span>'}
        ${hostMe && !done && !isMe(pid) && !p.online ? `<button class="btn tiny" data-act="pickfor" data-id="${pid}">Pick for them</button>` : ''}
      </li>`;
    }).join('');

    return `${mine}
    <section class="panel">
      <h2>Who's ready</h2>
      <ul class="plist">${waiting}</ul>
      ${hostMe ? '<button class="btn link danger" data-act="end">Cancel round</button>' : ''}
    </section>`;
  }
  let pickIdeas = [];
  let pickEditing = false;
  function refreshIdeas() {
    const v = app.view; const t = v && window.THEMES[v.settings.theme];
    pickIdeas = t ? shuffle(t.words).slice(0, 4) : [];
  }

  // ----- playing -----
  function playingHTML() {
    const v = app.view;
    const turnP = P(v.turnId);
    const myTurn = v.turnId === app.me;
    const amPlaying = v.order.includes(app.me);
    const myRes = result(app.me);
    const hostMe = amHost();

    const banner = turnP ? `
      <section class="turn ${myTurn ? 'mine' : ''}" style="--c:${turnP.color}">
        <div class="turn-l">
          ${avatar(turnP, 'lg')}
          <div>
            <div class="turn-who">${myTurn ? 'Your turn!' : `${esc(turnP.name)}'s turn`}</div>
            <div class="turn-hint">${myTurn ? 'Ask yes/no questions out loud' : 'Answer their questions with yes or no'}${turnP.online ? '' : ' · <span class="warn">away</span>'}</div>
          </div>
        </div>
        <div class="timer ${v.settings.turnSeconds ? '' : 'hidden'}" id="timer">--</div>
      </section>` : '';

    const tiles = v.order.map((id) => tileHTML(id)).join('');
    const watchers = v.players.filter((p) => !v.order.includes(p.id));

    return `
    <div class="theme-line">Theme: <b>${themeLabel(v)}</b></div>
    ${banner}
    <section class="board">${tiles}</section>
    ${!amPlaying ? '<p class="muted center-t">You\'re watching this round — you\'ll play next round.</p>' : ''}
    ${watchers.length ? `<p class="muted small center-t">Watching: ${watchers.map((p) => esc(p.name)).join(', ')}</p>` : ''}
    <section class="actions">
      ${myTurn ? '<button class="btn big primary" data-act="next">✋ Done — pass the turn</button>' : ''}
      ${!myTurn && hostMe ? '<button class="btn" data-act="next">⏭ Skip to next turn</button>' : ''}
      ${amPlaying && !myRes ? '<button class="btn link" data-act="giveup">I give up — show my word</button>' : ''}
      ${hostMe ? '<button class="btn link danger" data-act="end">End game</button>' : ''}
    </section>`;
  }

  function tileHTML(id) {
    const v = app.view;
    const p = P(id); if (!p) return '';
    const me = isMe(id);
    const res = result(id);
    const word = v.words[id];
    const hidden = me && !res;
    const isTurn = v.turnId === id;
    const pickerId = Object.keys(v.pickFor).find((k) => v.pickFor[k] === id);
    const picker = pickerId && P(pickerId);
    let cardInner, cardCls = '';
    if (hidden) { cardInner = '<span class="q">?</span>'; cardCls = 'hidden-card'; }
    else cardInner = `<span class="w">${esc(word)}</span>`;
    if (res) cardCls += res.how === 'got' ? ' got' : ' gave';
    const place = res && res.how === 'got' ? v.results.filter((r) => r.how === 'got').indexOf(res) + 1 : 0;
    return `
    <div class="tile ${isTurn ? 'turnnow' : ''} ${p.online ? '' : 'off'} ${me ? 'me' : ''}" style="--c:${p.color}">
      <div class="hb">
        <div class="card ${cardCls}">${cardInner}</div>
        <div class="head"><div class="band"></div><span class="face">${esc(p.name.slice(0, 1).toUpperCase())}</span></div>
        ${place ? `<div class="medal">${place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : '✓'}</div>` : ''}
        ${res && res.how === 'gaveup' ? '<div class="medal">🏳️</div>' : ''}
      </div>
      <div class="pname">${esc(p.name)}${me ? ' <i>(you)</i>' : ''}</div>
      <div class="pmeta">${p.online ? '' : '<span class="warn">away · </span>'}${res ? (res.how === 'got' ? 'Guessed it!' : 'Gave up') : `Turns: ${v.turnsTaken[id] || 0}`}</div>
      ${!me && !res ? `<button class="btn tiny good" data-act="gotit" data-id="${id}">✓ Got it</button>` : ''}
      ${!hidden && picker && !res ? `<div class="by">picked by ${esc(picker.name)}</div>` : ''}
    </div>`;
  }

  // ----- results -----
  function overHTML() {
    const v = app.view;
    const got = v.results.filter((r) => r.how === 'got');
    const rest = v.results.filter((r) => r.how !== 'got');
    const rows = [...got, ...rest].map((r, i) => {
      const p = P(r.id) || { name: '?', color: '#888' };
      const pickerId = Object.keys(v.pickFor).find((k) => v.pickFor[k] === r.id);
      const picker = pickerId && P(pickerId);
      const medal = r.how === 'got' ? (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`) : r.how === 'gaveup' ? '🏳️' : '⏹';
      return `<li>
        <span class="rk">${medal}</span>${avatar(p)}
        <div class="rinfo"><b>${esc(p.name)}</b>${isMe(r.id) ? ' <i>(you)</i>' : ''}
          <div class="muted small">was <b class="wordc">${esc(v.words[r.id] || '?')}</b>${picker ? ` · picked by ${esc(picker.name)}` : ''}</div></div>
        <span class="muted small">${r.how === 'got' ? `${Math.max(1, r.turns)} turn${Math.max(1, r.turns) === 1 ? '' : 's'}` : r.how === 'gaveup' ? 'gave up' : 'didn\'t finish'}</span>
      </li>`;
    }).join('');
    const winner = got[0] && P(got[0].id);
    return `
    <section class="panel over">
      <div class="confetti">🎉</div>
      <h2>${winner ? `${esc(winner.name)} wins!` : 'Game over'}</h2>
      <ul class="results">${rows}</ul>
      ${amHost() ? '<button class="btn big primary" data-act="again">🔁 Play again</button>' : '<p class="muted">Waiting for the host to start another round…</p>'}
    </section>`;
  }

  // ---------- timer display ----------
  function updateTimer() {
    const el = document.getElementById('timer');
    if (!el || !app.view || app.view.phase !== 'playing' || !app.view.settings.turnSeconds) return;
    const ms = localTurnEnd ? Math.max(0, localTurnEnd - now()) : 0;
    const s = Math.ceil(ms / 1000);
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('low', s <= 10);
    if (s <= 5 && s > 0 && s !== lastTickSecond && app.view.turnId === app.me) { lastTickSecond = s; sounds.tick(); }
    if (s > 5) lastTickSecond = -1;
  }
  setInterval(updateTimer, 200);

  // ---------- toast + modal ----------
  let toastTimer = null;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function confirmBox(text, yesLabel, onYes, danger = false) {
    const m = $('#modal');
    m.innerHTML = `<div class="mbox"><p>${text}</p><div class="row end">
      <button class="btn" data-m="no">Cancel</button>
      <button class="btn ${danger ? 'dangerbg' : 'primary'}" data-m="yes">${esc(yesLabel)}</button></div></div>`;
    m.classList.remove('hidden');
    const close = () => { m.classList.add('hidden'); m.innerHTML = ''; };
    m.onclick = (e) => {
      const b = e.target.closest('[data-m]');
      if (e.target === m || (b && b.dataset.m === 'no')) close();
      else if (b && b.dataset.m === 'yes') { close(); onYes(); }
    };
  }

  function showFatal(msg, backToHome = false) {
    if (backToHome) {
      if (app.role === 'client') clientStop();
      app.role = null; app.view = null; app.screen = 'home'; app.error = msg; app.joinCode = '';
      setUrlRoom(null);
    } else {
      app.screen = 'ended'; app.endedMsg = msg;
    }
    render();
  }
  function showEnded(msg) { app.screen = 'ended'; app.endedMsg = msg; app.view = null; setUrlRoom(null); render(); }

  async function copyLink() {
    const link = shareLink(app.code);
    if (navigator.share && /Mobi|iPhone|Android/i.test(navigator.userAgent)) {
      try { await navigator.share({ title: 'Play Headbands with me!', text: `Join my Headbands game — code ${app.code}`, url: link }); return; } catch {}
    }
    try { await navigator.clipboard.writeText(link); toast('Invite link copied!'); }
    catch {
      const el = document.getElementById('sharelink');
      if (el) { el.select(); try { document.execCommand('copy'); toast('Invite link copied!'); } catch { toast('Copy the link above to invite friends'); } }
      else toast(`Code: ${app.code}`);
    }
  }

  // ==========================================================
  //  BUTTONS
  // ==========================================================
  function readName() {
    const el = document.getElementById('name');
    const n = cleanName(el ? el.value : app.name);
    if (!n) { app.error = 'Type your name first.'; render(); const e = document.getElementById('name'); if (e) e.focus(); return null; }
    app.name = n; store.set('hb-name', n); app.error = '';
    return n;
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    const v = app.view;
    switch (act) {
      case 'create': {
        if (!readName()) return;
        hostStart(newCode());
        break;
      }
      case 'join': {
        if (!readName()) return;
        const codeEl = document.getElementById('code');
        const code = cleanCode(codeEl ? codeEl.value : app.joinCode);
        if (code.length < 4) { app.error = 'Type the 4-letter game code.'; render(); return; }
        app.joinCode = code;
        clientStart(code);
        break;
      }
      case 'notjoin': app.joinCode = ''; setUrlRoom(null); render(); break;
      case 'share': copyLink(); break;
      case 'mute': app.muted = !app.muted; store.set('hb-muted', app.muted); render(); break;
      case 'leave': {
        if (app.role === 'host' && app.screen === 'game') {
          confirmBox('Leave and close this game for everyone?', 'Close game', () => { hostClose(); goHome(); }, true);
        } else if (app.role === 'client' && app.screen === 'game') {
          confirmBox('Leave this game?', 'Leave', () => { clientStop(); goHome(); }, true);
        } else { if (app.role === 'host') hostClose(); if (app.role === 'client') clientStop(); goHome(); }
        break;
      }
      case 'home': goHome(); break;
      case 'kick': send({ a: 'kick', target: b.dataset.id }); break;
      case 'start': send({ a: 'start' }); break;
      case 'idea': { const w = document.getElementById('word'); if (w) { w.value = b.dataset.w; w.focus(); } break; }
      case 'ideas': refreshIdeas(); render(); break;
      case 'lock': {
        const w = cleanWord((document.getElementById('word') || {}).value);
        if (!w) { toast('Type a word first'); return; }
        pickEditing = false;
        send({ a: 'word', word: w });
        break;
      }
      case 'change': pickEditing = true; render(); break;
      case 'pickfor': {
        const pid = b.dataset.id; const t = P(v.pickFor[pid]);
        const theme = window.THEMES[v.settings.theme] || window.THEMES.anything;
        const w = theme.words[rand(theme.words.length)];
        confirmBox(`${esc(P(pid).name)} is away. Give ${esc(t.name)} a random word from the theme?`, 'Pick for them', () => send({ a: 'word', for: pid, word: w }));
        break;
      }
      case 'gotit': {
        const p = P(b.dataset.id);
        confirmBox(`Did <b>${esc(p.name)}</b> guess <b>“${esc(v.words[p.id])}”</b>?`, 'Yes, they got it!', () => send({ a: 'gotit', target: p.id }));
        break;
      }
      case 'giveup': confirmBox('Give up and see your word? You\'ll finish at the bottom.', 'Show my word', () => send({ a: 'giveup' }), true); break;
      case 'next': send({ a: 'next', turn: v.turnId }); break;
      case 'end': confirmBox(v.phase === 'picking' ? 'Cancel this round and go back to the lobby?' : 'End the game now and show results?', v.phase === 'picking' ? 'Cancel round' : 'End game', () => send({ a: 'end' }), true); break;
      case 'again': send({ a: 'again' }); break;
    }
  });

  root.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.actChange === 'theme') send({ a: 'settings', settings: { theme: el.value } });
    if (el.dataset.actChange === 'timer') send({ a: 'settings', settings: { turnSeconds: Number(el.value) } });
  });
  let customTimer = null;
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.actInput === 'customTheme') {
      clearTimeout(customTimer);
      customTimer = setTimeout(() => send({ a: 'settings', settings: { customTheme: el.value } }), 400);
    }
    if (el.id === 'code') { const c = cleanCode(el.value); if (c !== el.value) el.value = c; }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const id = e.target.id;
    const click = (act) => { const b = root.querySelector(`[data-act="${act}"]`); if (b) b.click(); };
    if (id === 'word') click('lock');
    else if (id === 'code') click('join');
    else if (id === 'name') click(app.joinCode ? 'join' : 'create');
  });

  function goHome() {
    app.role = null; app.view = null; app.me = null; app.code = null; app.screen = 'home'; app.status = ''; app.error = '';
    app.joinCode = ''; app.lastEventId = 0; Net.stop(); lastTurnId = null; lastPhase = null; pickEditing = false;
    store.sdel('hb-hosting'); store.sdel('hb-joined');
    keepAwake(false);
    setUrlRoom(null);
    render();
  }

  // when a phone comes back to this tab, check the connection right away
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (app.view && (app.view.phase === 'playing' || app.view.phase === 'picking')) keepAwake(true);
    if (app.role) Net.wake();
    if (app.role === 'client') { if (client.everConnected) Net.pub(T.up(app.code), { t: 'resync', key: myKey }); else clientHello(); }
  });

  // new ideas whenever a new picking round begins
  const _render = render;
  let ideasRound = null;
  render = function () {
    if (app.view && app.view.phase === 'picking' && ideasRound !== `${app.view.round}-${app.view.settings.theme}`) {
      ideasRound = `${app.view.round}-${app.view.settings.theme}`; refreshIdeas(); pickEditing = false;
    }
    if (app.view && app.view.phase !== 'picking') ideasRound = null;
    _render();
  };

  // ==========================================================
  //  START UP
  // ==========================================================
  (function boot() {
    const roomParam = cleanCode(params.get('room') || '');
    const hosting = store.sget('hb-hosting');
    if (roomParam && hosting === roomParam) {
      const saved = store.get('hb-host-' + roomParam);
      if (saved && saved.state && now() - saved.savedAt < 6 * 3600 * 1000) {
        app.name = saved.name || app.name;
        return hostStart(roomParam, saved.state);
      }
    }
    if (roomParam && store.sget('hb-joined') === roomParam && app.name) {
      return clientStart(roomParam);
    }
    render();
    const n = document.getElementById('name');
    if (n && !n.value) n.focus();
  })();
})();
