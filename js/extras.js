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
  let radio = null;   // emisora en curso (ver sección Radio)
  const isRadio = () => !!radio && A.cp().src === radio.href;
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
    if (p !== A.cp() || isRadio()) return;
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
      if (p !== A.cp() || !key() || isRadio()) return;
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
      if (isRadio()) return status('No se pudo reproducir esta emisora. Prueba con otra.');
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

  // ---------- Secciones estilo Spotify (parte baja de la página) ----------
  const css = document.createElement('style');
  css.textContent = `
.main>section{flex-shrink:0}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.tile{display:flex;align-items:center;gap:12px;height:56px;min-width:0;padding-right:10px;border-radius:8px;overflow:hidden;text-align:left;background:rgba(255,255,255,.08);transition:background .2s}
.tile:hover{background:rgba(255,255,255,.16)}
.tile img{width:56px;height:56px;flex-shrink:0}
.tile b{min-width:0;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tile.on b{color:var(--a)}
.top5{display:grid;gap:2px}
.top5 li{display:grid;grid-template-columns:28px 44px minmax(0,1fr) auto;align-items:center;gap:12px;padding:8px 10px;border-radius:8px;cursor:pointer;transition:background .2s}
.top5 li:hover{background:rgba(255,255,255,.08)}
.top5 img{width:44px;height:44px;border-radius:6px}
.top5 p{font-size:14px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.top5 em{font-style:normal;font-size:12.5px;color:var(--mut)}
.mix{position:relative;flex:0 0 170px;height:170px;padding:14px;display:flex;flex-direction:column;justify-content:flex-end;text-align:left;border-radius:14px;overflow:hidden;scroll-snap-align:start;transition:transform .2s}
.mix:hover{transform:translateY(-4px)}
.mix::after{content:"";position:absolute;right:-24px;top:-24px;width:90px;height:90px;border-radius:50%;background:rgba(255,255,255,.14)}
.mix b{font-size:18px;line-height:1.15;overflow-wrap:anywhere}
.mix span{font-size:12.5px;opacity:.85}
@media (max-width:480px){.mix{flex-basis:140px;height:140px}.tiles{grid-template-columns:1fr 1fr}.tile{height:52px}.tile img{width:52px;height:52px}.tile b{font-size:13px}}`;
  document.head.append(css);

  const main = $('.main');
  const idx = k => A.songs.findIndex(s => s.key === k);
  const act = i => (i === A.cur() ? ' on' : '');
  const hue = t => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const cover = s => {
    const fb = A.gen(s.title, s.artist);
    return `<img src="${s.cover || fb}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${fb}'">`;
  };
  const card = i => { const s = A.songs[i]; return `<button class="card${act(i)}" data-xi="${i}">${cover(s)}<p>${A.esc(s.title)}</p><span>${A.esc(s.artist)}</span></button>`; };
  const tile = i => { const s = A.songs[i]; return `<button class="tile${act(i)}" data-xi="${i}">${cover(s)}<b>${A.esc(s.title)}</b></button>`; };
  const row = ids => (ids.length ? `<div class="row">${ids.map(card).join('')}</div>` : '');
  const all = () => A.songs.map((_, i) => i);

  const defs = [
    ['x-cont', 'Seguir escuchando', () => {
      const ids = A.recent().map(idx).filter(i => i >= 0).slice(0, 6);
      return ids.length ? `<div class="tiles">${ids.map(tile).join('')}</div>` : '';
    }],
    ['x-fav', 'Tus favoritas', () => row([...A.liked].map(idx).filter(i => i >= 0).slice(0, 20))],
    ['x-new', 'Recién agregadas', () => row(
      all().filter(i => A.songs[i].file?.lastModified)
        .sort((a, b) => A.songs[b].file.lastModified - A.songs[a].file.lastModified).slice(0, 20))],
    ['x-top', 'Más escuchadas', () => {
      const ids = all().filter(i => plays[A.songs[i].key] > 0)
        .sort((a, b) => plays[A.songs[b].key] - plays[A.songs[a].key]).slice(0, 5);
      return ids.length ? `<ol class="top5">${ids.map((i, k) => {
        const s = A.songs[i], n = plays[s.key];
        return `<li data-xi="${i}"><span class="n">${k + 1}</span>${cover(s)}<p>${A.esc(s.title)}<br><span class="mut">${A.esc(s.artist)}</span></p><em>${n} ${n === 1 ? 'vez' : 'veces'}</em></li>`;
      }).join('')}</ol>` : '';
    }],
    ['x-mix', 'Mixes para ti', () => {
      const by = new Map();
      A.songs.forEach(s => { if (s.artist && s.artist !== 'Mi música') by.set(s.artist, (by.get(s.artist) || 0) + 1); });
      const arr = [...by].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8);
      return arr.length ? `<div class="row">${arr.map(([a, n]) => {
        const h = hue(a);
        return `<button class="mix" data-mix="${A.esc(a)}" style="background:linear-gradient(135deg,hsl(${h},70%,42%),hsl(${(h + 55) % 360},70%,20%))"><b>Mix ${A.esc(a)}</b><span>${n} canciones</span></button>`;
      }).join('')}</div>` : '';
    }]
  ];

  const onClick = e => {
    const m = e.target.closest('[data-mix]');
    if (m) {
      document.querySelector('.menu [data-view="all"]')?.click();
      const q = $('#buscar');
      q.value = m.dataset.mix;
      q.dispatchEvent(new Event('input', { bubbles: true }));
      $('#lista').scrollTop = 0;
      $('#lista').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const c = e.target.closest('[data-xi]');
    if (!c) return;
    const i = +c.dataset.xi;
    i === A.cur() ? A.toggle() : A.load(i, true);
  };

  const secs = defs.map(([id, title, fn]) => {
    const s = document.createElement('section');
    s.id = id;
    s.hidden = true;
    s.innerHTML = `<div class="sh"><h3>${title}</h3></div><div class="xb"></div>`;
    s.addEventListener('click', onClick);
    main.append(s);
    return { s, fn, last: '' };
  });

  const draw = () => secs.forEach(o => {
    let h = '';
    try { h = o.fn(); } catch {}
    if (h === o.last) return;
    o.last = h;
    o.s.querySelector('.xb').innerHTML = h;
    o.s.hidden = !h;
  });
  let drawT;
  new MutationObserver(() => { clearTimeout(drawT); drawT = setTimeout(draw, 400); })
    .observe($('#songs'), { childList: true });
  draw();
  // ---------- Radio (directorio gratuito Radio Browser) ----------
  const RBS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];
  const rb = async path => {
    for (const b of RBS) {
      try { const r = await fetch(b + '/json' + path); if (r.ok) return await r.json(); } catch {}
    }
    throw new Error('sin conexión con Radio Browser');
  };

  const rcss = document.createElement('style');
  rcss.textContent = `
.main:not(.radio-on)>#x-radio{display:none}
.main.radio-on>:not(#x-radio):not(.top){display:none!important}
.rbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.rbar input{flex:1 1 200px;min-width:0;background:rgba(255,255,255,.14);border:0;outline:0;border-radius:20px;padding:9px 14px;color:#fff;font-size:15px;-webkit-user-select:text;user-select:text}
.rbar input::placeholder{color:var(--mut)}
.rbar select{background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:20px;padding:9px 12px;font:inherit}
.rbar select option{background:#0f1a22;color:#fff}
.rchips{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin-bottom:14px}
.rchips::-webkit-scrollbar{display:none}
.rchips button{flex:none;padding:7px 14px;border-radius:18px;background:rgba(255,255,255,.08);font-weight:700;font-size:13.5px;color:var(--mut)}
.rchips button.on{background:var(--a);color:var(--ink)}
.rgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
.rcard{position:relative;min-width:0;cursor:pointer;transition:transform .2s}
.rcard:hover{transform:translateY(-4px)}
.rcard img{width:100%;aspect-ratio:1;border-radius:12px;margin-bottom:8px;background:#111}
.rcard p{font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rcard span{display:block;font-size:12.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rcard.on img{outline:3px solid var(--a);outline-offset:2px}
.rfav{position:absolute;top:6px;right:6px;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,.55);font-size:16px;line-height:1;color:#fff}
.rfav[aria-pressed=true]{color:var(--a)}
@media (max-width:820px){#x-radio{order:3}}
@media (max-width:480px){.rgrid{grid-template-columns:repeat(2,1fr)}}`;
  document.head.append(rcss);

  const rsec = document.createElement('section');
  rsec.id = 'x-radio';
  rsec.setAttribute('aria-label', 'Radio');
  rsec.innerHTML = `<div class="sh"><h3>Radio</h3></div>
    <div class="rbar">
      <input id="rq" type="search" placeholder="Buscar emisora" aria-label="Buscar emisora">
      <select id="rc" aria-label="País">
        <option value="PE">Perú</option><option value="MX">México</option><option value="CO">Colombia</option>
        <option value="AR">Argentina</option><option value="CL">Chile</option><option value="EC">Ecuador</option>
        <option value="BO">Bolivia</option><option value="ES">España</option><option value="US">EE. UU.</option>
        <option value="">Todo el mundo</option>
      </select>
    </div>
    <div class="rchips" id="rt"></div>
    <div class="rgrid" id="rg"></div>`;
  main.append(rsec);

  let rCountry = store.get('radioCountry') ?? 'PE', rTag = '', rName = '', rFavOnly = false, rLoaded = false, rTok = 0;
  const favs = store.get('radioFav') || [];
  const rmap = new Map(favs.map(s => [s.uuid, s]));
  const isFav = u => favs.some(f => f.uuid === u);
  const isCur = s => isRadio() && radio.uuid === s.uuid;
  $('#rc').value = rCountry;

  const TAGS = [['', 'Todas'], ['cumbia', 'Cumbia'], ['salsa', 'Salsa'], ['pop', 'Pop'], ['rock', 'Rock'],
    ['romantic', 'Románticas'], ['news', 'Noticias'], ['folk', 'Folklore']];
  const drawChips = () => {
    $('#rt').innerHTML = TAGS.map(([v, t]) => `<button data-tag="${v}" class="${!rFavOnly && rTag === v ? 'on' : ''}">${t}</button>`).join('') +
      `<button data-fav-only="1" class="${rFavOnly ? 'on' : ''}">★ Mis emisoras</button>`;
  };

  const norm = s => ({ uuid: s.stationuuid, name: (s.name || '').trim() || 'Emisora', url: s.url_resolved,
    logo: s.favicon || '', country: s.country || '', bitrate: s.bitrate || 0 });
  const rLogo = s => (s.logo && s.logo.startsWith('https') ? s.logo : A.gen(s.name, s.name));
  const rcard = s => {
    const fb = A.gen(s.name, s.name);
    const info = [s.country, s.bitrate ? s.bitrate + ' kbps' : ''].filter(Boolean).join(' · ');
    return `<div class="rcard${isCur(s) ? ' on' : ''}" data-ru="${A.esc(s.uuid)}" tabindex="0" role="button" aria-label="Escuchar ${A.esc(s.name)}">
      <img src="${A.esc(rLogo(s))}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${fb}'">
      <p>${A.esc(s.name)}</p><span>${A.esc(info)}</span>
      <button class="rfav" data-fav="${A.esc(s.uuid)}" aria-pressed="${isFav(s.uuid)}" aria-label="Guardar emisora">★</button></div>`;
  };
  const drawRadios = (list, empty = 'No se encontraron emisoras.') => {
    list.forEach(s => rmap.set(s.uuid, s));
    $('#rg').innerHTML = list.length ? list.map(rcard).join('') : `<p class="mut">${empty}</p>`;
  };

  async function loadRadios() {
    drawChips();
    if (rFavOnly) return drawRadios(favs, 'Aún no guardaste emisoras con ★.');
    const my = ++rTok;
    $('#rg').innerHTML = '<p class="mut">Buscando emisoras…</p>';
    const p = new URLSearchParams({ limit: 80, hidebroken: true, order: 'clickcount', reverse: true, is_https: true });
    if (rCountry) p.set('countrycode', rCountry);
    if (rTag) p.set('tag', rTag);
    if (rName) p.set('name', rName);
    try {
      const data = await rb('/stations/search?' + p);
      if (my !== rTok) return;
      const seen = new Set();
      drawRadios(data.filter(s => s.url_resolved && s.url_resolved.startsWith('https')).map(norm)
        .filter(s => { const k = s.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, 48));
    } catch {
      if (my === rTok) $('#rg').innerHTML = '<p class="mut">No se pudo conectar con el directorio de radios. Revisa tu conexión.</p>';
    }
  }

  const markOn = () => $('#rg').querySelectorAll('.rcard')
    .forEach(c => c.classList.toggle('on', isRadio() && radio.uuid === c.dataset.ru));
  A.P.forEach(p => p.addEventListener('loadstart', markOn));

  function playRadio(s) {
    radio = { ...s, href: new URL(s.url, location.href).href };
    const p = A.cp();
    A.P.forEach(x => { if (x !== p) x.pause(); });
    p.src = s.url;
    p.play().catch(() => status('No se pudo reproducir esta emisora. Prueba con otra.'));
    $('#pTitle').textContent = s.name;
    $('#pArtist').textContent = 'Radio' + (s.country ? ' · ' + s.country : '');
    $('#pCover').src = rLogo(s);
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: s.name, artist: 'Radio',
          artwork: s.logo && s.logo.startsWith('https') ? [{ src: s.logo }] : []
        });
      } catch {}
    }
    rb('/url/' + encodeURIComponent(s.uuid)).catch(() => {}); // cuenta la escucha en el directorio
    markOn();
    status('Radio: ' + s.name);
  }

  const toggleRadio = () => {
    const p = A.cp();
    if (p.paused) p.play().catch(() => {}); else A.P.forEach(x => x.pause());
  };
  // Con la radio sonando, los botones Play/Pausa controlan la emisora
  document.addEventListener('click', e => {
    if (isRadio() && e.target.closest('#bPlay, #hPlay')) { e.stopPropagation(); toggleRadio(); }
  }, true);

  const toggleFav = u => {
    const i = favs.findIndex(f => f.uuid === u);
    if (i >= 0) favs.splice(i, 1);
    else { const s = rmap.get(u); if (s) favs.push(s); }
    store.set('radioFav', favs);
    rsec.querySelectorAll('[data-fav]').forEach(b => b.setAttribute('aria-pressed', isFav(b.dataset.fav)));
    if (rFavOnly) drawRadios(favs, 'Aún no guardaste emisoras con ★.');
  };

  rsec.addEventListener('click', e => {
    const f = e.target.closest('[data-fav]');
    if (f) return toggleFav(f.dataset.fav);
    const t = e.target.closest('[data-tag]');
    if (t) { rTag = t.dataset.tag; rFavOnly = false; return loadRadios(); }
    if (e.target.closest('[data-fav-only]')) { rFavOnly = !rFavOnly; return loadRadios(); }
    const c = e.target.closest('[data-ru]');
    if (c) { const s = rmap.get(c.dataset.ru); if (s) isCur(s) ? toggleRadio() : playRadio(s); }
  });
  rsec.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.rcard')) e.target.click(); });

  let rT;
  $('#rq').addEventListener('input', e => {
    clearTimeout(rT);
    rT = setTimeout(() => { rName = e.target.value.trim(); rFavOnly = false; loadRadios(); }, 450);
  });
  $('#rc').addEventListener('change', e => {
    rCountry = e.target.value; store.set('radioCountry', rCountry); rFavOnly = false; loadRadios();
  });

  // Pestañas: Discover (música) y Radio
  const tabs = [...document.querySelectorAll('.tabs a')];
  const showRadio = on => {
    main.classList.toggle('radio-on', on);
    tabs.forEach((a, i) => {
      const act = on ? i === 2 : i === 0;
      a.classList.toggle('on', act);
      if (act) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (on && !rLoaded) { rLoaded = true; loadRadios(); }
  };
  tabs[0]?.addEventListener('click', e => { e.preventDefault(); showRadio(false); });
  tabs[2]?.addEventListener('click', e => { e.preventDefault(); showRadio(true); });
})();