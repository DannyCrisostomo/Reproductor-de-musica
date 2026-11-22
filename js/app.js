(() => {
  const $ = s => document.querySelector(s);
  const A = new Audio();
  const pad = n => String(n).padStart(2, '0');
  const fmt = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
  const ico = (n, c = '') => `<svg class="i ${c}"><use href="#${n}"/></svg>`;
  const NO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><defs><linearGradient id="g"><stop stop-color="#00ffde"/><stop offset="1" stop-color="#6a2cff"/></linearGradient></defs><rect width="1" height="1" fill="url(#g)"/></svg>');
  const img = (src, alt = '') => `<img src="${src}" alt="${alt}" loading="lazy" onerror="this.onerror=null;this.src='${NO}'">`;

  const store = {
    get: k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
  };

  let cur = 0, view = 'all', query = '', shuffle = false, repeat = false;
  let recent = [];
  const liked = new Set(store.get('liked') || []);

  // ---------- Lista ----------
  const visible = () => {
    let ids = songs.map((_, i) => i);
    if (view === 'recent') ids = recent.slice();
    if (view === 'rec') ids = ids.filter(i => !recent.includes(i));
    const q = query.trim().toLowerCase();
    return q ? ids.filter(i => `${songs[i].title} ${songs[i].artist}`.toLowerCase().includes(q)) : ids;
  };

  function renderList() {
    const ids = visible();
    $('#lista').innerHTML = ids.length
      ? ids.map((i, k) => `<li data-i="${i}" class="${i === cur ? 'on' : ''}" tabindex="0" role="button" aria-label="Reproducir ${songs[i].title}">
          <span class="n"><span class="num">${pad(k + 1)}</span><i class="eq"><b></b><b></b><b></b></i></span>
          ${img(songs[i].cover)}<p>${songs[i].title}<br><span class="mut">${songs[i].artist}</span></p></li>`).join('')
      : '<li class="empty">No hay canciones para mostrar.</li>';
  }

  function renderRows() {
    $('#songs').innerHTML = songs.map((s, i) => `<button class="card ${i === cur ? 'on' : ''}" data-i="${i}">
      ${img(s.cover, s.title)}<p>${s.title}</p><span>${s.artist}</span></button>`).join('');
    const artists = [...new Map(songs.map(s => [s.artist, s])).values()];
    $('#artists').innerHTML = artists.map(s => `<button class="card art" data-artist="${s.artist}">
      ${img(s.cover, s.artist)}<p>${s.artist}</p></button>`).join('');
    updateArrows();
  }

  // ---------- Reproducción ----------
  function load(i, go) {
    cur = (i + songs.length) % songs.length;
    const s = songs[cur];
    A.src = s.src;
    $('#hCover').outerHTML = img(s.cover, `Portada de ${s.title}`).replace('<img', '<img id="hCover"');
    $('#pCover').outerHTML = img(s.cover, '').replace('<img', '<img id="pCover"');
    $('#hero').style.setProperty('--bg', `url("${s.cover}")`);
    $('#hTitle').textContent = $('#pTitle').textContent = s.title;
    $('#hArtist').textContent = $('#pArtist').textContent = s.artist;
    document.title = `${s.title} · ${s.artist}`;
    if (!recent.includes(cur) && go) recent.unshift(cur);
    renderList(); renderRows(); syncLike();
    $('#lista .on')?.scrollIntoView({ block: 'nearest' });
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist, artwork: [{ src: s.cover }] });
    if (go) A.play().catch(() => {});
  }

  const step = d => {
    if (shuffle && songs.length > 1) { let r; do r = Math.floor(Math.random() * songs.length); while (r === cur); return load(r, true); }
    load(cur + d, true);
  };
  const toggle = () => A.paused ? A.play().catch(() => {}) : A.pause();
  const prev = () => A.currentTime > 3 ? (A.currentTime = 0) : step(-1);

  A.addEventListener('play', () => ui(true));
  A.addEventListener('pause', () => ui(false));
  A.addEventListener('ended', () => repeat ? (A.currentTime = 0, A.play()) : step(1));
  A.addEventListener('loadedmetadata', tick);
  A.addEventListener('timeupdate', tick);

  function ui(on) {
    document.body.classList.toggle('playing', on);
    $('#bPlay').innerHTML = ico(on ? 'pause' : 'play');
    $('#bPlay').setAttribute('aria-label', on ? 'Pausar' : 'Reproducir');
    $('#hPlay').innerHTML = `${ico(on ? 'pause' : 'play')}${on ? 'Pausar' : 'Play'}`;
  }

  function tick() {
    const d = A.duration, ok = isFinite(d) && d > 0;
    const p = ok ? A.currentTime / d * 1000 : 0;
    $('#seek').value = p; $('#seek').style.setProperty('--p', p / 10 + '%');
    $('#tCur').textContent = fmt(A.currentTime || 0);
    $('#tLeft').textContent = ok ? '-' + fmt(d - A.currentTime) : '-0:00';
  }

  // ---------- Me gusta ----------
  function syncLike() {
    const on = liked.has(cur);
    $('#hLike').setAttribute('aria-pressed', on);
    $('#hLike').innerHTML = `${ico('heart')}${on ? 'Te gusta' : 'Me gusta'}`;
  }

  // ---------- Carruseles ----------
  function updateArrows() {
    ['songs', 'artists'].forEach(id => {
      const r = document.getElementById(id), max = r.scrollWidth - r.clientWidth - 2;
      document.querySelector(`[data-t="${id}"][data-d="-1"]`).disabled = r.scrollLeft <= 2;
      document.querySelector(`[data-t="${id}"][data-d="1"]`).disabled = r.scrollLeft >= max;
    });
  }
  document.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => {
    const r = document.getElementById(b.dataset.t);
    r.scrollBy({ left: b.dataset.d * r.clientWidth * .8 });
  }));
  ['songs', 'artists'].forEach(id => document.getElementById(id).addEventListener('scroll', updateArrows, { passive: true }));
  addEventListener('resize', updateArrows);

  // ---------- Eventos ----------
  $('#lista').addEventListener('click', e => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    const i = +li.dataset.i;
    i === cur ? toggle() : load(i, true);
  });
  $('#lista').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.click(); });
  $('#songs').addEventListener('click', e => {
    const c = e.target.closest('[data-i]'); if (c) +c.dataset.i === cur ? toggle() : load(+c.dataset.i, true);
  });
  $('#artists').addEventListener('click', e => {
    const c = e.target.closest('[data-artist]'); if (!c) return;
    $('#buscar').value = query = c.dataset.artist; view = 'all'; syncMenu(); renderList();
    $('.side').scrollIntoView({ behavior: 'smooth' });
  });

  const syncMenu = () => document.querySelectorAll('.menu button').forEach(b => {
    const on = b.dataset.view === view; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
  });
  document.querySelectorAll('.menu button').forEach(b => b.addEventListener('click', () => { view = b.dataset.view; syncMenu(); renderList(); }));
  $('#buscar').addEventListener('input', e => { query = e.target.value; renderList(); });

  $('#bPlay').onclick = $('#hPlay').onclick = toggle;
  $('#bNext').onclick = () => step(1);
  $('#bPrev').onclick = prev;
  $('#bShuffle').onclick = e => { shuffle = !shuffle; e.currentTarget.setAttribute('aria-pressed', shuffle); };
  $('#bRepeat').onclick = e => { repeat = !repeat; e.currentTarget.setAttribute('aria-pressed', repeat); };
  $('#hLike').onclick = () => { liked.has(cur) ? liked.delete(cur) : liked.add(cur); store.set('liked', [...liked]); syncLike(); };

  $('#seek').addEventListener('input', e => { if (isFinite(A.duration)) A.currentTime = e.target.value / 1000 * A.duration; });
  const vol = $('#volume');
  vol.addEventListener('input', () => { A.volume = +vol.value; vol.style.setProperty('--p', vol.value * 100 + '%'); store.set('vol', vol.value); });

  addEventListener('keydown', e => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
    if (e.code === 'Space' && !/BUTTON/.test(e.target.tagName)) { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowRight' && e.target.type !== 'range') A.currentTime += 5;
    if (e.code === 'ArrowLeft' && e.target.type !== 'range') A.currentTime -= 5;
  });

  if ('mediaSession' in navigator) {
    const m = navigator.mediaSession;
    m.setActionHandler('play', toggle); m.setActionHandler('pause', toggle);
    m.setActionHandler('previoustrack', prev); m.setActionHandler('nexttrack', () => step(1));
  }

  // ---------- Inicio ----------
  vol.value = store.get('vol') ?? .7; vol.dispatchEvent(new Event('input'));
  ui(false); load(0, false);
})();