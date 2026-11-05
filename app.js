/* Music comparison study — participant app.
   Researchers: you should not need to edit this file. Use config.js. */
(function () {
  'use strict';

  /* =========================================================
     Pure helpers (exported on window.StudyCore for testing)
     ========================================================= */

  // 0→a, 1→b … 25→z, 26→a1, 27→b1 … 52→a2 …
  function nicknameFor(n) {
    var L = 'abcdefghijklmnopqrstuvwxyz';
    var k = Math.floor(n / 26);
    return L[n % 26] + (k ? String(k) : '');
  }

  function seedFrom(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // Per-participant random song order, and a balanced random choice of which
  // side the original is on (half the trials A=original, half B=original).
  // Seeded by the session ID, so the same session always gets the same plan.
  function buildTrials(songs, sessionId) {
    var rnd = mulberry32(seedFrom(String(sessionId)));
    var order = shuffle(songs.map(function (_, i) { return i; }), rnd);
    var sides = [];
    for (var i = 0; i < order.length; i++) sides.push(i < Math.ceil(order.length / 2));
    shuffle(sides, rnd);
    if (rnd() < 0.5 && order.length % 2 === 1) sides = sides.map(function (s) { return !s; });
    return order.map(function (idx, i) {
      var origOnA = sides[i];
      return { pairId: String(songs[idx].id), a: origOnA ? 'original' : 'ai', b: origOnA ? 'ai' : 'original' };
    });
  }

  // Positive = prefers original, negative = prefers AI, 0 = no preference.
  function standardizedScore(raw, clipAVersion) {
    var s = clipAVersion === 'original' ? -raw : raw;
    return s === 0 ? 0 : s; // never -0
  }

  // 'ok' | 'needed' | 'waived-error' | 'waived-incomplete'
  function clipRequirement(cl, maxPlays) {
    if (cl.completes >= 1) return 'ok';
    if (cl.unavailable) return 'waived-error';
    if (cl.plays >= maxPlays) return 'waived-incomplete';
    return 'needed';
  }

  function audioIssues(clips, maxPlays) {
    var out = [];
    ['A', 'B'].forEach(function (c) {
      var cl = clips[c];
      if (cl.interrupted) out.push(c + ':interrupted x' + cl.interrupted);
      if (cl.errors) out.push(c + ':load_failures x' + cl.errors);
      var r = clipRequirement(cl, maxPlays);
      if (r === 'waived-error') out.push(c + ':unavailable');
      if (r === 'waived-incomplete') out.push(c + ':never_finished');
    });
    return out.join('; ');
  }

  function orderString(trials) {
    return trials.map(function (t) { return t.pairId + ':' + (t.a === 'original' ? 'OA' : 'AO'); }).join(',');
  }

  window.StudyCore = {
    nicknameFor: nicknameFor, buildTrials: buildTrials, standardizedScore: standardizedScore,
    clipRequirement: clipRequirement, audioIssues: audioIssues, orderString: orderString
  };
  if (window.__STUDY_CORE_ONLY__) return;

  /* =========================================================
     Setup
     ========================================================= */
  var CFG = window.STUDY_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var DEMO = CFG.demoMode === true || params.get('demo') === '1';
  var MAX = CFG.maxPlays || 2;
  var T = CFG.text || {};
  var STORE_KEY = 'musicStudy:' + (CFG.studyId || 'study') + (DEMO ? ':demo' : '');
  var DEMO_DB_KEY = 'musicStudy:' + (CFG.studyId || 'study') + ':demoDb';

  var SONGS = CFG.songs || [];
  if (DEMO) {
    SONGS = [];
    for (var d = 1; d <= 30; d++) SONGS.push({ id: 'D' + (d < 10 ? '0' : '') + d, original: 'demo', ai: 'demo' });
  }

  var app = document.getElementById('app');

  /* ---------- Storage (with fallback if blocked) ---------- */
  var memoryStore = {};
  var storageOk = true;
  function storeGet(key) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch (e) { storageOk = false; return memoryStore[key] || null; }
  }
  function storeSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { storageOk = false; memoryStore[key] = val; }
  }
  function storeDel(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    delete memoryStore[key];
  }

  var S = storeGet(STORE_KEY); // participant state
  function save() { storeSet(STORE_KEY, S); }

  function newClipState() { return { plays: 0, completes: 0, errors: 0, interrupted: 0, unavailable: false, active: false }; }
  function newTrialState() {
    return {
      startedAt: new Date().toISOString(),
      clips: { A: newClipState(), B: newClipState() },
      slider: { value: 0, set: false, viaButton: false },
      pending: null
    };
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /* =========================================================
     Backend (real Google Apps Script, or demo stand-in)
     ========================================================= */
  function postJSON(url, body) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 25000);
    return fetch(url, {
      method: 'POST',
      // text/plain avoids a CORS preflight, which Apps Script can't answer
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      redirect: 'follow'
    }).then(function (r) {
      if (!r.ok) throw new Error('Server responded ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || 'Server error');
      return j;
    }).finally(function () { clearTimeout(timer); });
  }

  var RealBackend = {
    call: function (payload) {
      if (!CFG.backendUrl || CFG.backendUrl.indexOf('PASTE_') === 0) {
        return Promise.reject(new Error('The study is not connected to Google Sheets yet (backendUrl in config.js).'));
      }
      return postJSON(CFG.backendUrl, payload);
    }
  };

  // Mirrors the Apps Script logic so the demo shows exactly what would be saved.
  var DemoBackend = {
    db: function () { return storeGet(DEMO_DB_KEY) || { counter: 0, sessions: [], responses: [] }; },
    call: function (payload) {
      var self = this;
      var failRate = parseFloat(params.get('fail') || '0');
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if (Math.random() < failRate) return reject(new Error('Simulated network failure (demo ?fail= setting)'));
          try { resolve(self.handle(payload)); } catch (e) { reject(e); }
        }, 250);
      });
    },
    handle: function (p) {
      var db = this.db();
      var now = new Date().toISOString();
      if (p.action === 'start') {
        var ex = db.sessions.filter(function (s) { return s.session_id === p.sessionId; })[0];
        if (ex) return { ok: true, nickname: ex.nickname, resumed: true };
        var nick;
        do { nick = nicknameFor(db.counter++); }
        while (db.sessions.some(function (s) { return s.nickname === nick; }));
        db.sessions.push({ nickname: nick, session_id: p.sessionId, started_at: now, trials_completed: 0,
          total_trials: p.totalTrials, status: 'in_progress', completed_at: '', last_activity_at: now,
          device: p.device || '', trial_order: p.trialOrder || '' });
        storeSet(DEMO_DB_KEY, db);
        return { ok: true, nickname: nick };
      }
      if (p.action === 'submit') {
        var sess = db.sessions.filter(function (s) { return s.session_id === p.sessionId; })[0];
        if (!sess) throw new Error('Unknown session');
        var rid = p.sessionId + ':' + p.trial;
        if (db.responses.some(function (r) { return r.response_id === rid; })) return { ok: true, duplicate: true };
        db.responses.push({
          response_id: rid, nickname: sess.nickname, session_id: p.sessionId, trial_number: p.trial, pair_id: p.pairId,
          clip_a_version: p.clipA, clip_b_version: p.clipB, plays_a: p.playsA, plays_b: p.playsB,
          completed_listens_a: p.completesA, completed_listens_b: p.completesB, slider_raw: p.slider,
          score_original_vs_ai: standardizedScore(p.slider, p.clipA), used_no_preference_button: p.usedNoPrefButton ? 'yes' : 'no',
          trial_start: p.trialStart, trial_submit: p.trialSubmit, audio_issues: p.audioIssues || '', server_received_at: now
        });
        sess.trials_completed += 1;
        sess.last_activity_at = now;
        if (sess.trials_completed >= sess.total_trials) { sess.status = 'complete'; sess.completed_at = sess.completed_at || now; }
        storeSet(DEMO_DB_KEY, db);
        return { ok: true, trialsCompleted: sess.trials_completed };
      }
      throw new Error('Unknown action');
    }
  };

  var Backend = DEMO ? DemoBackend : RealBackend;

  /* =========================================================
     Demo audio: synthesized placeholder tones (WAV blobs)
     ========================================================= */
  var demoUrlCache = {};
  function demoClipUrl(pairId, version) {
    var key = pairId + '|' + version;
    if (demoUrlCache[key]) return demoUrlCache[key];
    var secs = Math.max(0.5, Math.min(20, parseFloat(params.get('secs') || '4')));
    var rate = 22050, n = Math.floor(secs * rate);
    var buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    var scale = [0, 2, 4, 7, 9, 12, 14, 16];
    var seed = mulberry32(seedFrom(pairId));
    var notes = []; for (var k = 0; k < 8; k++) notes.push(scale[Math.floor(seed() * scale.length)]);
    var base = 220 * Math.pow(2, Math.floor(seed() * 7) / 12);
    var noteLen = n / notes.length;
    for (var i = 0; i < n; i++) {
      var ni = Math.min(notes.length - 1, Math.floor(i / noteLen));
      var f = base * Math.pow(2, notes[ni] / 12);
      var t = i / rate, pos = (i % noteLen) / noteLen;
      var env = Math.min(1, pos * 20) * Math.pow(1 - pos, 0.6);
      var s = version === 'original'
        ? Math.sin(2 * Math.PI * f * t) * 0.8 + Math.sin(4 * Math.PI * f * t) * 0.15
        : Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.25 + Math.sin(2 * Math.PI * f * 1.005 * t) * 0.4;
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * env * 0.6)) * 32767, true);
    }
    var url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    demoUrlCache[key] = url;
    return url;
  }

  function clipSrc(trial, side) {
    var version = side === 'A' ? trial.a : trial.b;
    if (DEMO) return demoClipUrl(trial.pairId, version);
    var song = SONGS.filter(function (s) { return String(s.id) === trial.pairId; })[0];
    return song ? song[version] : '';
  }

  /* =========================================================
     Small DOM helpers
     ========================================================= */
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function show(node) { app.innerHTML = ''; app.appendChild(node); window.scrollTo(0, 0); }
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 4500);
  }
  function fmt(s, vars) { return String(s || '').replace(/\{(\w+)\}/g, function (_, k) { return vars[k]; }); }

  /* =========================================================
     Screens
     ========================================================= */
  function renderConfigError(msg) {
    show(el('section', { class: 'card' }, [el('h1', { text: 'Study setup problem' }), el('p', { text: msg })]));
  }

  function renderIntro() {
    var agree = el('input', { type: 'checkbox', id: 'agree' });
    var start = el('button', { class: 'btn primary', type: 'button', disabled: true, text: T.startButton || 'Start', id: 'start-btn' });
    agree.addEventListener('change', function () { start.disabled = !agree.checked; });
    start.addEventListener('click', function () { start.disabled = true; beginSession(); });
    var card = el('section', { class: 'card intro' }, [
      el('h1', { text: T.title || 'Listening study' }),
      el('div', {}, (T.intro || []).map(function (p) { return el('p', { text: p }); })),
      el('div', { class: 'callout' }, [
        el('div', { class: 'callout-icon', 'aria-hidden': 'true', text: '🎧' }),
        el('div', {}, [el('strong', { text: 'Before you start' }),
          el('ul', {}, (T.rules || []).map(function (r) { return el('li', { text: r }); }))])
      ]),
      storageOk ? null : el('p', { class: 'warn', text: 'Your browser is blocking storage, so progress cannot be restored if you close this page. Please finish in one sitting.' }),
      el('label', { class: 'agree', for: 'agree' }, [agree, el('span', { text: T.agree || 'I understand.' })]),
      start
    ]);
    show(card);
  }

  function renderStarting(errMsg) {
    var kids = [el('h1', { text: T.title || 'Listening study' })];
    if (errMsg) {
      kids.push(el('p', { class: 'error-text', text: 'We couldn\'t start your session: ' + errMsg }));
      kids.push(el('p', { text: 'Check your internet connection and try again. Nothing has been lost.' }));
      kids.push(el('button', { class: 'btn primary', type: 'button', text: 'Try again', onclick: function () { renderStarting(); startOnServer(); } }));
    } else {
      kids.push(el('p', { class: 'center', text: 'Setting up your anonymous session…' }));
      kids.push(el('div', { class: 'spinner', 'aria-hidden': 'true' }));
    }
    show(el('section', { class: 'card center' }, kids));
  }

  function renderThanks() {
    stopAllAudio();
    show(el('section', { class: 'card center thanks' }, [
      el('div', { class: 'big-check', 'aria-hidden': 'true', text: '✓' }),
      el('h1', { text: T.thanksTitle || 'Thank you!' }),
      el('p', { text: T.thanksBody || '' }),
      el('p', { class: 'muted', text: 'Your anonymous ID: ' + S.nickname + ' · ' + S.trials.length + ' of ' + S.trials.length + ' saved' })
    ]));
  }

  /* =========================================================
     Session start
     ========================================================= */
  function deviceType() {
    try { return matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop'; } catch (e) { return ''; }
  }

  function beginSession() {
    var sid = uuid();
    var trials = buildTrials(SONGS, sid);
    S = { v: 1, sessionId: sid, nickname: null, createdAt: new Date().toISOString(), trials: trials, idx: 0, cur: null, done: false };
    save(); // saved before contacting the server so a refresh reuses the same session ID
    renderStarting();
    startOnServer();
  }

  function startOnServer() {
    Backend.call({
      action: 'start', sessionId: S.sessionId, totalTrials: S.trials.length,
      trialOrder: orderString(S.trials), device: deviceType()
    }).then(function (res) {
      S.nickname = res.nickname;
      S.cur = newTrialState();
      save();
      renderTrial();
      toast('Your anonymous ID is ' + S.nickname);
    }).catch(function (err) { renderStarting(err.message || String(err)); });
  }

  /* =========================================================
     Trial screen + audio engine
     ========================================================= */
  var player = { els: { A: null, B: null }, attempt: null }; // attempt: {clip, counted, paused, lastPos, timer, fixing}
  var ui = {};
  var saving = false;
  var loadMsg = { A: '', B: '' };

  function stopAllAudio() {
    ['A', 'B'].forEach(function (c) {
      var a = player.els[c];
      if (a) { try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) { /* ignore */ } }
      player.els[c] = null;
    });
    if (player.attempt) clearTimeout(player.attempt.timer);
    player.attempt = null;
  }

  function lockMediaSession() {
    if (!('mediaSession' in navigator)) return;
    ['seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'].forEach(function (a) {
      try { navigator.mediaSession.setActionHandler(a, function () { /* disabled */ }); } catch (e) { /* unsupported */ }
    });
  }
  function setMediaMeta(side) {
    try {
      if ('mediaSession' in navigator && window.MediaMetadata) {
        // generic lock-screen title so no file name / song info is revealed
        navigator.mediaSession.metadata = new MediaMetadata({ title: 'Clip ' + side, artist: T.title || 'Listening study' });
      }
    } catch (e) { /* ignore */ }
  }

  function currentTrial() { return S.trials[S.idx]; }
  function clips() { return S.cur.clips; }

  function setupAudio() {
    stopAllAudio();
    var trial = currentTrial();
    ['A', 'B'].forEach(function (c) {
      var a = new Audio();
      a.preload = 'auto';
      a.loop = false;
      a.controls = false;
      a.setAttribute('playsinline', '');
      a.setAttribute('controlsList', 'nodownload noplaybackrate');
      a.disableRemotePlayback = true;
      a.src = clipSrc(trial, c);
      a.addEventListener('playing', function () { onPlaying(c); });
      a.addEventListener('ended', function () { onEnded(c); });
      a.addEventListener('pause', function () { onPause(c); });
      a.addEventListener('error', function () { onMediaError(c); });
      a.addEventListener('timeupdate', function () { onTime(c); });
      a.addEventListener('seeking', function () { onSeeking(c); });
      a.addEventListener('ratechange', function () { if (a.playbackRate !== 1) a.playbackRate = 1; });
      player.els[c] = a;
    });
    lockMediaSession();
  }

  function busy() { return !!player.attempt; }

  function canStart(c) {
    var cl = clips()[c];
    return !busy() && !saving && !S.cur.pending && !cl.unavailable && cl.plays < MAX;
  }

  function startPlay(c) {
    var att = player.attempt;
    if (att && att.clip === c && att.paused) return resumePlay(c);
    if (!canStart(c)) return;
    var a = player.els[c];
    att = { clip: c, counted: false, paused: false, lastPos: 0, timer: null, fixing: false };
    player.attempt = att;
    loadMsg[c] = '';
    if (a.error || a.networkState === 3) { a.src = clipSrc(currentTrial(), c); a.load(); }
    try { a.currentTime = 0; } catch (e) { /* not loaded yet: starts at 0 anyway */ }
    setMediaMeta(c);
    att.timer = setTimeout(function () {
      if (player.attempt === att && !att.counted) { try { a.pause(); } catch (e) { /* */ } loadFailed(c, 'timed out'); }
    }, CFG.audioStartTimeoutMs || 15000);
    var p;
    try { p = a.play(); } catch (e) { loadFailed(c, e.name); return; }
    if (p && p.catch) p.catch(function (e) { if (player.attempt === att && !att.counted) loadFailed(c, e && e.name); });
    updateUI();
  }

  function resumePlay(c) {
    var a = player.els[c];
    var p = a.play();
    if (p && p.catch) p.catch(function () { toast('Could not resume. Tap Resume again.'); });
  }

  function onPlaying(c) {
    var att = player.attempt;
    var a = player.els[c];
    if (!att || att.clip !== c) { try { a.pause(); } catch (e) { /* */ } return; } // stray start (e.g., OS media key)
    if (att.paused) { att.paused = false; updateUI(); return; }
    if (!att.counted) {
      att.counted = true;
      clearTimeout(att.timer);
      clips()[c].plays += 1;     // a play counts only once audio is actually playing
      clips()[c].active = true;
      save();
    }
    updateUI();
  }

  function onEnded(c) {
    var att = player.attempt;
    if (!att || att.clip !== c || !att.counted) return;
    var cl = clips()[c];
    cl.completes += 1;
    cl.active = false;
    player.attempt = null;
    save();
    updateUI();
  }

  function onPause(c) {
    var att = player.attempt, a = player.els[c];
    if (!att || att.clip !== c || !att.counted || a.ended) return;
    if (a.duration && a.currentTime >= a.duration - 0.05) return;
    att.paused = true; // paused by the OS / headphones / phone call: same play can be resumed
    updateUI();
  }

  function onMediaError(c) {
    var att = player.attempt;
    if (!att || att.clip !== c) return;
    if (att.counted) {
      var cl = clips()[c];
      cl.active = false; cl.interrupted += 1;
      player.attempt = null;
      loadMsg[c] = 'Playback stopped because of a loading problem.';
      save(); updateUI();
    } else {
      loadFailed(c, 'load error');
    }
  }

  function loadFailed(c, why) {
    var att = player.attempt;
    if (att) clearTimeout(att.timer);
    player.attempt = null;
    var cl = clips()[c];
    cl.errors += 1;
    if (cl.errors >= (CFG.maxLoadFailures || 3)) cl.unavailable = true;
    loadMsg[c] = cl.unavailable
      ? 'This clip could not be loaded. You may answer without it.'
      : 'The clip didn\'t load (' + (why || 'error') + '). That attempt was not counted — try again.';
    save(); updateUI();
  }

  function onTime(c) {
    var att = player.attempt, a = player.els[c];
    if (att && att.clip === c && att.counted) {
      if (att.fixing) { att.fixing = false; }
      else if (a.currentTime >= att.lastPos && a.currentTime - att.lastPos < 2) att.lastPos = a.currentTime;
    }
    var bar = ui.clips && ui.clips[c] && ui.clips[c].fill;
    if (bar && att && att.clip === c) bar.style.width = (a && a.duration ? Math.min(100, (a.currentTime / a.duration) * 100) : 0) + '%';
  }

  function onSeeking(c) {
    var att = player.attempt, a = player.els[c];
    if (!att || att.clip !== c || !att.counted || att.fixing) return;
    if (Math.abs(a.currentTime - att.lastPos) > 1) { att.fixing = true; a.currentTime = att.lastPos; } // undo scrubbing
  }

  /* ---------- Build trial view ---------- */
  function renderTrial() {
    var trial = currentTrial();
    var n = S.idx + 1, total = S.trials.length;
    saving = false;
    loadMsg = { A: '', B: '' };

    // A play that was in progress when the page closed counts as used but not completed.
    ['A', 'B'].forEach(function (c) {
      var cl = clips()[c];
      if (cl.active) { cl.active = false; cl.interrupted += 1; loadMsg[c] = 'Your earlier play was interrupted by leaving the page.'; }
    });
    save();

    ui = { clips: {} };
    function clipCard(c) {
      var btn = el('button', { type: 'button', class: 'btn play', 'aria-describedby': 'count-' + c });
      btn.addEventListener('click', function () { startPlay(c); });
      var fill = el('div', { class: 'meter-fill' });
      var count = el('p', { class: 'count', id: 'count-' + c });
      var status = el('p', { class: 'status' });
      ui.clips[c] = { btn: btn, fill: fill, count: count, status: status };
      return el('div', { class: 'clip clip-' + c.toLowerCase() }, [
        el('h2', { text: 'Clip ' + c }),
        btn,
        el('div', { class: 'meter', 'aria-hidden': 'true' }, [fill]),
        count, status
      ]);
    }

    var range = el('input', { type: 'range', min: -100, max: 100, step: 1, value: S.cur.slider.value, id: 'pref', 'aria-label': T.question || 'Preference' });
    var touchedByPointer = false;
    range.addEventListener('input', function () { setSlider(parseInt(range.value, 10), false); });
    range.addEventListener('change', function () { setSlider(parseInt(range.value, 10), false); });
    range.addEventListener('pointerdown', function () { touchedByPointer = true; });
    range.addEventListener('pointerup', function () { if (touchedByPointer) setSlider(parseInt(range.value, 10), false); touchedByPointer = false; });

    var labels = CFG.sliderLabels || [];
    var ticks = el('div', { class: 'ticks', 'aria-hidden': 'true' }, labels.map(function (l, i) {
      var p = (l.value + 100) / 200;
      var cls = 'tick' + (i === 0 ? ' first' : i === labels.length - 1 ? ' last' : '');
      var t = el('div', { class: cls, style: '--p:' + p }, [el('span', { class: 'tick-mark' }), el('span', { class: 'tick-label', text: l.text })]);
      return t;
    }));

    var nopref = el('button', { type: 'button', class: 'btn ghost', text: T.noPreferenceButton || 'No preference' });
    nopref.addEventListener('click', function () { setSlider(0, true); });
    var readout = el('p', { class: 'readout', id: 'readout' });
    var hint = el('p', { class: 'hint' });
    var submit = el('button', { type: 'button', class: 'btn primary submit', text: T.submitButton || 'Submit' });
    submit.addEventListener('click', submitTrial);
    var errBox = el('div', { class: 'save-error', role: 'alert', hidden: true });

    Object.assign(ui, { range: range, nopref: nopref, readout: readout, hint: hint, submit: submit, errBox: errBox });

    show(el('section', { class: 'card trial' }, [
      el('div', { class: 'topbar' }, [
        el('span', { class: 'progress-label', text: fmt(T.progress || 'Song {n} of {total}', { n: n, total: total }) }),
        el('span', { class: 'muted small', text: 'ID: ' + S.nickname }),
        el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': S.idx },
          [el('div', { class: 'progress-fill', style: 'width:' + (S.idx / total * 100) + '%' })])
      ]),
      el('div', { class: 'clips' }, [clipCard('A'), clipCard('B')]),
      el('div', { class: 'question' }, [
        el('h3', { text: T.question || 'Which clip do you prefer?' }),
        el('div', { class: 'scale-ends', 'aria-hidden': 'true' }, [el('span', { text: '← Clip A' }), el('span', { text: 'Clip B →' })]),
        el('div', { class: 'slider-wrap' }, [range, ticks]),
        readout,
        el('div', { class: 'actions' }, [nopref, submit]),
        hint, errBox
      ])
    ]));

    setupAudio();
    updateUI();
    if (S.cur.pending) sendPending(true); // page was refreshed while saving: resend the identical answer
  }

  function sliderText(v) {
    if (v === 0) return 'No preference (0)';
    return (v < 0 ? 'Prefer Clip A' : 'Prefer Clip B') + ' — strength ' + Math.abs(v) + ' of 100 (' + (v > 0 ? '+' : '') + v + ')';
  }

  function setSlider(v, viaButton) {
    if (ui.range.disabled) return;
    S.cur.slider = { value: v, set: true, viaButton: !!viaButton };
    ui.range.value = String(v);
    save();
    updateUI();
  }

  function listensOk() {
    return ['A', 'B'].every(function (c) { return clipRequirement(clips()[c], MAX) !== 'needed'; });
  }

  function updateUI() {
    if (!ui.clips || !S || !S.cur) return;
    var att = player.attempt;
    var locked = saving || !!S.cur.pending;
    ['A', 'B'].forEach(function (c) {
      var cl = clips()[c], u = ui.clips[c];
      var isMine = att && att.clip === c;
      var label, disabled = false;
      if (isMine && att.paused) label = '▶ Resume';
      else if (isMine && att.counted) { label = 'Playing…'; disabled = true; }
      else if (isMine) { label = 'Loading…'; disabled = true; }
      else if (cl.unavailable) { label = 'Unavailable'; disabled = true; }
      else if (cl.plays >= MAX) { label = 'No plays left'; disabled = true; }
      else { label = cl.plays === 0 ? '▶ Play' : '▶ Play again'; disabled = busy() || locked; }
      u.btn.textContent = label;
      u.btn.disabled = disabled;
      u.btn.setAttribute('aria-label', 'Clip ' + c + ': ' + label.replace('▶ ', ''));
      u.count.textContent = cl.plays + ' of ' + MAX + ' plays used';
      var req = clipRequirement(cl, MAX), st;
      if (isMine && att.paused) st = 'Paused by your device — tap Resume to continue this play.';
      else if (isMine && att.counted) st = 'Playing… please listen to the end.';
      else if (loadMsg[c]) st = loadMsg[c];
      else if (req === 'ok') st = cl.completes > 1 ? '✓ Listened twice' : '✓ Listened';
      else if (req === 'waived-error') st = 'Could not be loaded — you may answer without it.';
      else if (req === 'waived-incomplete') st = 'Playback was interrupted — you may still answer.';
      else st = cl.plays === 0 ? 'Not played yet' : 'Not finished yet';
      if (req === 'ok' && loadMsg[c] && !(isMine)) st = '✓ Listened';
      u.status.textContent = st;
      u.status.className = 'status' + (req === 'ok' ? ' ok' : (loadMsg[c] || req.indexOf('waived') === 0) ? ' warn-text' : '');
      if (!isMine && !(att && att.clip === c)) u.fill.style.width = cl.completes ? '100%' : '0%';
    });

    var ready = listensOk();
    var sl = S.cur.slider;
    ui.range.disabled = !ready || locked;
    ui.nopref.disabled = !ready || locked;
    ui.range.value = String(sl.value);
    ui.range.classList.toggle('is-set', sl.set);
    ui.range.style.setProperty('--fill', ((sl.value + 100) / 2) + '%');
    ui.range.setAttribute('aria-valuetext', sl.set ? sliderText(sl.value) : 'No answer selected yet');
    ui.nopref.classList.toggle('selected', sl.set && sl.viaButton);
    ui.nopref.setAttribute('aria-pressed', sl.set && sl.viaButton ? 'true' : 'false');
    ui.readout.textContent = sl.set ? sliderText(sl.value) : (ready ? 'Move the slider or tap “No preference” to answer.' : '');
    ui.readout.classList.toggle('placeholder', !sl.set);

    var canSubmit = ready && sl.set && !busy() && !locked;
    ui.submit.disabled = !canSubmit;
    ui.submit.textContent = saving ? 'Saving…' : (T.submitButton || 'Submit');
    var h = '';
    if (!ready) h = 'Listen to both clips all the way through to unlock the slider.';
    else if (busy()) h = 'Wait for the clip to finish before submitting.';
    else if (!sl.set) h = 'Choose a position on the slider (or “No preference”) to continue.';
    ui.hint.textContent = locked ? '' : h;
  }

  /* ---------- Submit ---------- */
  function submitTrial() {
    if (ui.submit.disabled) return; // guards double clicks
    var trial = currentTrial(), sl = S.cur.slider, cl = clips();
    S.cur.pending = {
      action: 'submit',
      sessionId: S.sessionId,
      responseId: S.sessionId + ':' + (S.idx + 1),
      trial: S.idx + 1,
      totalTrials: S.trials.length,
      pairId: trial.pairId,
      clipA: trial.a, clipB: trial.b,
      playsA: cl.A.plays, playsB: cl.B.plays,
      completesA: cl.A.completes, completesB: cl.B.completes,
      slider: sl.value,
      score: standardizedScore(sl.value, trial.a),
      usedNoPrefButton: !!sl.viaButton,
      trialStart: S.cur.startedAt,
      trialSubmit: new Date().toISOString(),
      audioIssues: audioIssues(cl, MAX)
    };
    save(); // answer is stored locally before sending
    sendPending(false);
  }

  function sendPending(isResume) {
    if (saving) return;
    saving = true;
    ui.errBox.hidden = true;
    updateUI();
    Backend.call(S.cur.pending).then(function () {
      saving = false;
      stopAllAudio();
      S.idx += 1;
      if (S.idx >= S.trials.length) { S.done = true; S.cur = null; save(); renderThanks(); return; }
      S.cur = newTrialState();
      save();
      renderTrial();
      if (isResume) toast('Your previous answer was saved.');
    }).catch(function (err) {
      saving = false;
      ui.errBox.innerHTML = '';
      ui.errBox.appendChild(el('p', { text: 'Your answer has not been saved yet: ' + (err.message || err) }));
      ui.errBox.appendChild(el('p', { class: 'small', text: 'It is kept on this device. Check your connection and press Retry. Your answer can’t be lost or recorded twice.' }));
      ui.errBox.appendChild(el('button', { type: 'button', class: 'btn primary', text: 'Retry saving', onclick: function () { sendPending(false); } }));
      ui.errBox.hidden = false;
      updateUI();
    });
  }

  /* =========================================================
     Demo data viewer
     ========================================================= */
  function toCSV(rows) {
    if (!rows.length) return '';
    var cols = Object.keys(rows[0]);
    function q(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    return [cols.join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return q(r[c]); }).join(','); })).join('\n');
  }
  function table(rows) {
    if (!rows.length) return el('p', { class: 'muted', text: 'No rows yet.' });
    var cols = Object.keys(rows[0]);
    return el('table', {}, [
      el('thead', {}, [el('tr', {}, cols.map(function (c) { return el('th', { text: c }); }))]),
      el('tbody', {}, rows.slice().reverse().map(function (r) { return el('tr', {}, cols.map(function (c) { return el('td', { text: String(r[c]) }); })); }))
    ]);
  }
  function download(name, text) {
    var a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }
  function setupDemoUI() {
    document.getElementById('demo-banner').hidden = false;
    document.body.classList.add('demo');
    var dlg = document.getElementById('demo-dialog');
    function refresh() {
      var db = DemoBackend.db();
      var s = document.getElementById('demo-sessions'), r = document.getElementById('demo-responses');
      s.innerHTML = ''; r.innerHTML = '';
      s.appendChild(table(db.sessions)); r.appendChild(table(db.responses));
    }
    document.getElementById('demo-data-btn').addEventListener('click', function () {
      refresh();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
    dlg.querySelector('[data-close]').addEventListener('click', function () { dlg.close ? dlg.close() : dlg.removeAttribute('open'); });
    document.getElementById('demo-csv-resp').addEventListener('click', function () { download('demo_responses.csv', toCSV(DemoBackend.db().responses)); });
    document.getElementById('demo-csv-sess').addEventListener('click', function () { download('demo_sessions.csv', toCSV(DemoBackend.db().sessions)); });
    document.getElementById('demo-reset').addEventListener('click', function () {
      stopAllAudio();
      storeDel(STORE_KEY);
      if (confirm('Also erase the demo test data table?')) storeDel(DEMO_DB_KEY);
      location.reload();
    });
  }

  /* =========================================================
     Boot
     ========================================================= */
  function validateConfig() {
    if (!SONGS.length) return 'No songs are listed in config.js.';
    var seen = {};
    for (var i = 0; i < SONGS.length; i++) {
      var s = SONGS[i];
      if (!s || s.id == null || s.id === '') return 'Song #' + (i + 1) + ' in config.js has no id.';
      if (seen[s.id]) return 'Song id "' + s.id + '" appears twice in config.js.';
      seen[s.id] = true;
      if (!s.original || !s.ai) return 'Song "' + s.id + '" is missing an original or ai audio location.';
    }
    return '';
  }

  function boot() {
    if (DEMO) setupDemoUI();
    document.title = T.title || document.title;
    var problem = validateConfig();
    if (problem) return renderConfigError(problem);

    if (S && S.v === 1 && S.sessionId && S.trials && S.trials.length === SONGS.length) {
      if (S.done) return renderThanks();
      if (!S.nickname) { renderStarting(); return startOnServer(); }
      if (!S.cur) S.cur = newTrialState();
      renderTrial();
      if (S.idx > 0 || S.cur.clips.A.plays || S.cur.clips.B.plays) toast('Welcome back — your progress was restored.');
      return;
    }
    S = null;
    renderIntro();
  }

  window.addEventListener('beforeunload', function (e) {
    if (S && S.nickname && !S.done && (busy() || saving)) { e.preventDefault(); e.returnValue = ''; }
  });

  boot();
})();
