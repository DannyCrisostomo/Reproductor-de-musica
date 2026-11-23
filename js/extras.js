/* extras.js · mejoras para el reproductor (colocar en js/extras.js)
   Requiere en app.js la línea: window.__player = { P, cp, step, songs, cur: () => cur }; */
(() => {
  const A = window.__player;
  if (!A) return;
  const $ = s => document.querySelector(s);
  const store = {
    get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  const status = m => { const el = $('#status'); if (el) el.textContent = m; };
  const key = () => A.songs[A.cur()]?.key;
  const anchor = $('#clearMine');

  const addSelect = (label, id, opts, value) => {
    const l = document.createElement('label');
    l.className = 'xf';
    l.innerHTML = `<span>${label}</span><select id="${id}" aria-label="${label}">` +
      opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('') + '</select>';
    anchor.before(l);
    const s = l.querySelector('select');
    s.value = String(value);
    return s;
  };

  // ---------- Velocidad de reproducción ----------
  const setRate = r => A.P.forEach(p => { p.defaultPlaybackRate = r; p.playbackRate = r; });
  const rateSel = addSelect('Velocidad', 'rate',
    [[0.75, '0.75x'], [1, '1x'], [1.25, '1.25x'], [1.5, '1.5x'], [2, '2x']], store.get('rate') ?? 1);
  setRate(+rateSel.value);
  rateSel.addEventListener('change', () => { setRate(+rateSel.value); store.set('rate', +rateSel.value); });

  // ---------- Temporizador de apagado (con fundido de salida) ----------
  let sleepT;
  const sleepSel = addSelect('Apagar en', 'sleep',
    [[0, 'No'], [15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '60 min']], 0);
  const fadeOut = () => {
    const v0 = A.P.map(p => p.volume);
    let k = 20;
    const t = setInterval(() => {
      k--;
      A.P.forEach((p, i) => { p.volume = Math.max(0, v0[i] * k / 20); });
      if (k <= 0) {
        clearInterval(t);
        A.P.forEach((p, i) => { p.pause(); p.volume = v0[i]; });
        sleepSel.value = '0';
        status('Temporizador: música pausada.');
      }
    }, 250);
  };
  sleepSel.addEventListener('change', () => {
    clearTimeout(sleepT);
    const m = +sleepSel.value;
    if (!m) return status('Temporizador desactivado.');
    status(`La música se pausará en ${m} min.`);
    sleepT = setTimeout(fadeOut, m * 60000);
  });

  // ---------- Botón "Instalar app" ----------
  let deferred;
  const inst = document.createElement('button');
  inst.type = 'button';
  inst.className = 'btn line add';
  inst.textContent = 'Instalar app';
  inst.style.display = 'none';
  anchor.before(inst);
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; inst.style.display = ''; });
  addEventListener('appinstalled', () => { inst.style.display = 'none'; });
  inst.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    inst.style.display = 'none';
  });

  // ---------- Contador de reproducciones (alimenta "Popular song") ----------
  const plays = window.__plays = store.get('plays') || {};
  let counted = null;
  A.P.forEach(p => p.addEventListener('timeupdate', () => {
    if (p !== A.cp()) return;
    if (p.currentTime < 2) counted = null;
    if (p.currentTime >= 20 && counted !== p.src && key()) {
      counted = p.src;
      plays[key()] = (plays[key()] || 0) + 1;
      store.set('plays', plays);
    }
  }));

  // ---------- Continuar donde lo dejaste ----------
  const saved = store.get('pos');
  let resumed = false, lastSave = 0;
  A.P.forEach(p => {
    p.addEventListener('loadedmetadata', () => {
      if (resumed || p !== A.cp() || !saved || key() !== saved.k) return;
      resumed = true;
      if (saved.t > 1 && saved.t < p.duration - 3) p.currentTime = saved.t;
    });
    p.addEventListener('play', () => { resumed = true; });
    p.addEventListener('timeupdate', () => {
      if (p !== A.cp() || !key()) return;
      const now = Date.now();
      if (now - lastSave < 3000) return;
      lastSave = now;
      store.set('pos', { k: key(), t: p.currentTime });
    });
  });

  // ---------- Media Session: barra de progreso y saltos en pantalla de bloqueo ----------
  if ('mediaSession' in navigator) {
    const m = navigator.mediaSession;
    try {
      m.setActionHandler('seekto', d => { A.cp().currentTime = d.seekTime; });
      m.setActionHandler('seekbackward', d => { A.cp().currentTime -= d.seekOffset || 10; });
      m.setActionHandler('seekforward', d => { A.cp().currentTime += d.seekOffset || 10; });
    } catch {}
    let last = 0;
    A.P.forEach(p => {
      p.addEventListener('play', () => { if (p === A.cp()) m.playbackState = 'playing'; });
      p.addEventListener('pause', () => { if (p === A.cp()) m.playbackState = 'paused'; });
      p.addEventListener('timeupdate', () => {
        if (p !== A.cp() || !isFinite(p.duration)) return;
        const now = Date.now();
        if (now - last < 1000) return;
        last = now;
        try {
          m.setPositionState({
            duration: p.duration,
            position: Math.min(p.currentTime, p.duration),
            playbackRate: p.playbackRate
          });
        } catch {}
      });
    });
  }

  // ---------- Archivo dañado: avisar y saltar (máx. 5 seguidos) ----------
  let errs = 0;
  A.P.forEach(p => {
    p.addEventListener('playing', () => { errs = 0; });
    p.addEventListener('error', () => {
      if (p !== A.cp() || !p.src) return;
      if (++errs > 5) return status('Varias canciones seguidas no se pudieron reproducir.');
      status('No se pudo reproducir esa canción. Pasando a la siguiente…');
      setTimeout(() => A.step(1), 800);
    });
  });

  // ---------- Atajos de teclado: N siguiente · P anterior · L me gusta ----------
  addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'n') A.step(1);
    else if (k === 'p') A.step(-1);
    else if (k === 'l') $('#hLike').click();
  });
})(); 