import { Vault, haptic, isNative } from './vault.js';
import { PatternPad } from './pattern.js';
import { noisetteSVG, setNoisette, lookAt, resetLook } from './noisette.js';

// ---------------------------------------------------------------------------
// Icônes
// ---------------------------------------------------------------------------
const I = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M6 12v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  mask: '<path d="M3 8c3-2 15-2 18 0 0 6-3 10-9 10S3 14 3 8z"/><path d="M7.5 11.5c1-1 2.5-1 3.5 0M13 11.5c1-1 2.5-1 3.5 0"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
const icon = (name, size = 22) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ''}</svg>`;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function hydrate(root = document) {
  $$('[data-icon]', root).forEach((el) => {
    if (el.dataset.hydrated) return;
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
    el.dataset.hydrated = '1';
  });
  $$('[data-noisette]', root).forEach((el) => {
    if (el.dataset.hydrated) return;
    el.innerHTML = noisetteSVG({ state: el.dataset.noisette, size: +el.dataset.size || 160 });
    el.dataset.hydrated = '1';
  });
}

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------
const ONBOARDED = 'plq.onboarded';
const state = {
  items: [],
  isNew: false,
  settings: {},
  thumbs: new Map(),
  selecting: false,
  selected: new Set(),
  viewer: { list: [], index: -1, zoom: false },
  importing: false,
};

// ---------------------------------------------------------------------------
// Écrans, feuilles, toast
// ---------------------------------------------------------------------------
let current = null;
function show(id) {
  const next = document.getElementById(id);
  if (current === next) return;
  if (current) {
    const prev = current;
    prev.classList.add('leaving');
    prev.classList.remove('active');
    setTimeout(() => prev.classList.remove('leaving'), 450);
  }
  next.classList.add('active');
  current = next;
}

let sheetOnClose = null;
function openSheet(html, { onMount, dismissable = true, onClose } = {}) {
  const body = $('#sheet-body');
  body.innerHTML = html;
  hydrate(body);
  sheetOnClose = onClose || null;
  $('#scrim').classList.add('show');
  $('#scrim').onclick = dismissable ? () => closeSheet() : null;
  requestAnimationFrame(() => $('#sheet').classList.add('show'));
  onMount?.(body);
}
function closeSheet() {
  $('#sheet').classList.remove('show');
  $('#scrim').classList.remove('show');
  const cb = sheetOnClose;
  sheetOnClose = null;
  cb?.();
}

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function plural(n, one, many) { return `${n} ${n > 1 ? many : one}`; }
function fmtDuration(s) {
  if (!s && s !== 0) return '';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}
function fmtSize(b) {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} Ko`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} Go`;
}
function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function addedText(items) {
  const p = items.filter((i) => i.kind === 'photo').length;
  const v = items.filter((i) => i.kind === 'video').length;
  const f = items.filter((i) => i.kind === 'file').length;
  return [p && plural(p, 'photo', 'photos'), v && plural(v, 'vidéo', 'vidéos'), f && plural(f, 'fichier', 'fichiers')]
    .filter(Boolean).join(', ');
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
async function boot() {
  hydrate();
  if (!isNative) {
    document.body.insertAdjacentHTML('beforeend', '<div class="preview-banner">Aperçu navigateur — chiffrement simulé</div>');
  }
  Vault.on('locked', onLocked);
  Vault.on('progress', onProgress);

  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $('#retry').addEventListener('click', boot2);
  $('#lock-btn').addEventListener('click', lockNow);
  $('#settings-btn').addEventListener('click', openSettings);
  $('#select-btn').addEventListener('click', () => setSelecting(!state.selecting));
  $('#fab').addEventListener('click', openImport);
  $('#sel-share').addEventListener('click', () => shareItems([...state.selected]));
  $('#sel-delete').addEventListener('click', () => confirmDelete([...state.selected]));
  setupViewer();
  setupLock();
  setupCreate();
  await boot2();
}

async function boot2() {
  let st = { ready: true, problem: null };
  try { st = await Vault.status(); } catch { /* on tente quand même */ }
  if (st.problem === 'keyMissing') return show('problem');
  if (localStorage.getItem(ONBOARDED)) return showLock();
  show('intro');
}

function go(id) {
  haptic('light');
  if (id === 'how') {
    const m = $('#intro .intro-mascot');
    setNoisette(m, 'happy');
    setTimeout(() => show('how'), 650);
    return;
  }
  if (id === 'create') resetCreate();
  show(id);
}

// ---------------------------------------------------------------------------
// Création du schéma (onboarding)
// ---------------------------------------------------------------------------
let createPad;
let firstPattern = null;

function setupCreate() {
  const mascot = $('#create-mascot');
  createPad = new PatternPad($('#create-pad'), {
    onStart: () => setNoisette(mascot, 'awake'),
    onMove: (x, y) => lookAt(mascot, x, y),
    onPoint: () => haptic('light'),
    onEnd: (pts) => onCreateDrawn(pts),
  });
}

function resetCreate() {
  firstPattern = null;
  $('#create-title').textContent = 'Dessine ton schéma';
  $('#create-sub').textContent = 'Relie au moins 4 points. Plus il est long, plus il est solide.';
  setHint('#create-hint', '');
  createPad?.reset();
  setNoisette($('#create-mascot'), 'awake');
}

function setHint(sel, text, warn = false) {
  const h = $(sel);
  h.textContent = text;
  h.classList.toggle('warn', warn);
}

async function onCreateDrawn(pts) {
  const mascot = $('#create-mascot');
  resetLook(mascot);
  if (pts.length < 4) {
    haptic('warning');
    createPad.shake();
    setHint('#create-hint', 'Relie au moins 4 points.', true);
    setTimeout(() => createPad.reset(), 500);
    return;
  }
  if (!firstPattern) {
    firstPattern = pts;
    createPad.done();
    haptic('medium');
    setTimeout(() => {
      createPad.reset();
      $('#create-title').textContent = 'Encore une fois';
      $('#create-sub').textContent = 'Redessine le même schéma pour le confirmer.';
      setHint('#create-hint', '');
    }, 450);
    return;
  }
  if (firstPattern.join('-') !== pts.join('-')) {
    haptic('warning');
    createPad.shake();
    setHint('#create-hint', 'Ce n’est pas le même. On recommence depuis le début.', true);
    setTimeout(resetCreate, 1100);
    return;
  }
  createPad.done();
  createPad.busy(true);
  setNoisette(mascot, 'think');
  setHint('#create-hint', 'Je fabrique ta clé…');
  try {
    const res = await Vault.unlock({ pattern: pts });
    if (res.isNew) {
      const c = await Vault.confirmNew({ pattern: pts });
      if (!c.ok) throw new Error('confirm');
    }
    localStorage.setItem(ONBOARDED, '1');
    haptic('success');
    setNoisette(mascot, 'happy');
    await wait(650);
    openVault({ ...res, isNew: false });
  } catch {
    setHint('#create-hint', 'Un souci est survenu. Réessaie.', true);
    resetCreate();
  } finally {
    createPad.busy(false);
  }
}

// ---------------------------------------------------------------------------
// Verrouillage
// ---------------------------------------------------------------------------
let lockPad;

function setupLock() {
  const mascot = $('#lock-mascot');
  lockPad = new PatternPad($('#lock-pad'), {
    onStart: () => { setNoisette(mascot, 'awake'); setHint('#lock-hint', ''); },
    onMove: (x, y) => lookAt(mascot, x, y),
    onPoint: () => haptic('light'),
    onEnd: (pts) => onLockDrawn(pts),
  });
}

function showLock() {
  closeSheet();
  closeViewer(true);
  lockPad.reset();
  lockPad.busy(false);
  setHint('#lock-hint', '');
  setNoisette($('#lock-mascot'), 'sleep');
  resetLook($('#lock-mascot'));
  show('lock');
}

async function onLockDrawn(pts) {
  const mascot = $('#lock-mascot');
  resetLook(mascot);
  if (pts.length < 4) {
    haptic('warning');
    lockPad.shake();
    setHint('#lock-hint', 'Relie au moins 4 points.', true);
    setTimeout(() => { lockPad.reset(); setNoisette(mascot, 'sleep'); }, 600);
    return;
  }
  // Même déroulé, même durée minimale et même Noisette pour tous les schémas :
  // rien ne permet de savoir si ce schéma ouvre un vrai coffre, un leurre ou un coffre vide.
  lockPad.done();
  lockPad.busy(true);
  setNoisette(mascot, 'think');
  const started = performance.now();
  try {
    const res = await Vault.unlock({ pattern: pts });
    const elapsed = performance.now() - started;
    if (elapsed < 700) await wait(700 - elapsed);
    haptic('success');
    setNoisette(mascot, 'happy');
    await wait(420);
    openVault(res);
  } catch (e) {
    lockPad.busy(false);
    lockPad.reset();
    setNoisette(mascot, 'sleep');
    setHint('#lock-hint', e?.code === 'KEY_MISSING' ? 'Clé de l’iPhone introuvable.' : 'Réessaie.', true);
    if (e?.code === 'KEY_MISSING') show('problem');
  }
}

async function lockNow() {
  haptic('medium');
  clearVault();
  try { await Vault.lock(); } catch { /* déjà verrouillé */ }
  showLock();
}

function onLocked() {
  // Envoyé par iOS quand l'appli passe en arrière-plan : tout est déjà effacé côté natif.
  clearVault();
  if (localStorage.getItem(ONBOARDED)) showLock();
  requestAnimationFrame(() => requestAnimationFrame(() => Vault.uncover().catch(() => {})));
}

function clearVault() {
  state.items = [];
  state.thumbs.clear();
  state.selected.clear();
  state.settings = {};
  state.isNew = false;
  setSelecting(false);
  $('#grid').innerHTML = '';
  $('#busy').classList.remove('show');
  closeViewer(true);
  closeSheet();
}

// ---------------------------------------------------------------------------
// Coffre : galerie
// ---------------------------------------------------------------------------
function openVault(res) {
  state.items = res.items || [];
  state.isNew = !!res.isNew;
  state.settings = res.settings || {};
  state.thumbs.clear();
  renderGallery();
  show('vault');
  $('#scroll').scrollTop = 0;
}

function renderCount() {
  const n = state.items.length;
  $('#count').textContent = n ? addedText(state.items) : 'Chiffrée sur cet iPhone';
}

function tileHTML(item) {
  const sel = state.selected.has(item.id) ? ' sel' : '';
  let inner = '';
  if (item.kind === 'file' && !item.hasThumb) {
    inner = `<div class="doc">${icon('file', 30)}<b>${esc(item.ext || 'fichier')}</b><span>${esc(item.name)}</span></div>`;
  } else {
    inner = '<img alt="">';
    if (item.kind === 'video') inner += `<span class="badge">${icon('play', 11)}${fmtDuration(item.duration)}</span>`;
    if (item.kind === 'file') inner += `<span class="badge">${esc((item.ext || '').toUpperCase())}</span>`;
  }
  return `<button class="tile${sel}" data-id="${esc(item.id)}" aria-label="${esc(item.name)}">${inner}<span class="check">${icon('check', 14)}</span></button>`;
}

let observer;
function renderGallery() {
  const grid = $('#grid');
  grid.innerHTML = state.items.map(tileHTML).join('');
  $('#empty').classList.toggle('show', state.items.length === 0);
  setNoisette($('#empty-mascot'), 'awake');
  $('#select-btn').style.visibility = state.items.length ? 'visible' : 'hidden';
  renderCount();
  observeTiles();
}

function observeTiles() {
  observer?.disconnect();
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { queueThumb(e.target.dataset.id); observer.unobserve(e.target); }
    }
  }, { root: $('#scroll'), rootMargin: '600px 0px' });
  $$('.tile', $('#grid')).forEach((t) => {
    const item = state.items.find((i) => i.id === t.dataset.id);
    if (!item?.hasThumb) return;
    const src = state.thumbs.get(item.id);
    if (src) setThumb(t, src); else observer.observe(t);
  });
}

function setThumb(tile, src) {
  const img = tile.querySelector('img');
  if (!img) return;
  img.onload = () => img.classList.add('ready');
  img.src = src;
}

const thumbQueue = new Set();
let thumbTimer = null;
function queueThumb(id) {
  thumbQueue.add(id);
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(flushThumbs, 30);
}
async function flushThumbs() {
  const ids = [...thumbQueue].slice(0, 24);
  ids.forEach((id) => thumbQueue.delete(id));
  if (!ids.length) return;
  try {
    const { thumbs } = await Vault.thumbs({ ids });
    for (const [id, src] of Object.entries(thumbs || {})) {
      state.thumbs.set(id, src);
      const tile = $(`.tile[data-id="${CSS.escape(id)}"]`);
      if (tile) setThumb(tile, src);
    }
  } catch { /* verrouillé entre-temps */ }
  if (thumbQueue.size) flushThumbs();
}

$('#grid').addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const item = state.items.find((i) => i.id === tile.dataset.id);
  if (!item) return;
  if (state.selecting) {
    haptic('select');
    if (state.selected.has(item.id)) state.selected.delete(item.id); else state.selected.add(item.id);
    tile.classList.toggle('sel', state.selected.has(item.id));
    updateSelbar();
    return;
  }
  haptic('light');
  if (item.kind === 'photo') openViewer(item.id);
  else Vault.openItem({ id: item.id }).catch(() => toast('Impossible d’ouvrir ce fichier.'));
});

function setSelecting(on) {
  state.selecting = on;
  if (!on) state.selected.clear();
  $('#vault').classList.toggle('selecting', on);
  $('#select-btn').classList.toggle('on', on);
  $('#select-btn').textContent = on ? 'Annuler' : 'Choisir';
  $$('.tile.sel').forEach((t) => t.classList.remove('sel'));
  updateSelbar();
}

function updateSelbar() {
  const n = state.selected.size;
  $('#sel-share span:last-child').textContent = n ? `Partager (${n})` : 'Partager';
  $('#sel-delete span:last-child').textContent = n ? `Supprimer (${n})` : 'Supprimer';
  $('#sel-share').disabled = $('#sel-delete').disabled = n === 0;
  $('#sel-share').style.opacity = $('#sel-delete').style.opacity = n ? 1 : 0.45;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
function openImport() {
  haptic('light');
  openSheet(`
    <div class="row-mascot">
      <div data-noisette="awake" data-size="72"></div>
      <div class="txt"><h3>Qu’est-ce qu’on planque ?</h3></div>
    </div>
    <button class="opt" data-src="photos"><span class="ico">${icon('image')}</span><span><b>Photos et vidéos</b><small>Depuis ta pellicule</small></span></button>
    <button class="opt" data-src="camera"><span class="ico">${icon('camera')}</span><span><b>Appareil photo</b><small>Directement dans le coffre, sans passer par ta pellicule</small></span></button>
    <button class="opt" data-src="files"><span class="ico">${icon('folder')}</span><span><b>Fichiers</b><small>PDF, papiers, documents…</small></span></button>
  `, {
    onMount: (body) => $$('[data-src]', body).forEach((b) => b.addEventListener('click', () => {
      const src = b.dataset.src;
      closeSheet();
      if (state.isNew) confirmNewVault(() => runImport(src));
      else runImport(src);
    })),
  });
}

/** Un schéma qui n'ouvrait aucun coffre : on le fait redessiner avant de créer le coffre. */
function confirmNewVault(then) {
  setTimeout(() => openSheet(`
    <div class="row-mascot">
      <div data-noisette="awake" data-size="72" id="confirm-mascot"></div>
      <div class="txt"><h3>Nouveau coffre</h3></div>
    </div>
    <p>Redessine ton schéma pour créer ce coffre. Retiens-le bien : personne ne pourra le retrouver pour toi.</p>
    <div id="confirm-pad" style="width:min(76vw,280px)"></div>
    <div class="hint" id="confirm-hint" style="text-align:center"></div>
  `, {
    onMount: () => {
      const mascot = $('#confirm-mascot');
      const pad = new PatternPad($('#confirm-pad'), {
        onMove: (x, y) => lookAt(mascot, x, y),
        onPoint: () => haptic('light'),
        onEnd: async (pts) => {
          resetLook(mascot);
          pad.busy(true);
          setNoisette(mascot, 'think');
          let ok = false;
          try { ok = (await Vault.confirmNew({ pattern: pts })).ok; } catch { ok = false; }
          pad.busy(false);
          if (!ok) {
            haptic('warning');
            pad.shake();
            setNoisette(mascot, 'awake');
            setHint('#confirm-hint', 'Ce n’est pas le schéma qui a ouvert ce coffre.', true);
            setTimeout(() => pad.reset(), 600);
            return;
          }
          state.isNew = false;
          haptic('success');
          setNoisette(mascot, 'happy');
          await wait(500);
          closeSheet();
          then();
        },
      });
    },
  }), 260);
}

async function runImport(src) {
  if (state.importing) return;
  state.importing = true;
  const method = { photos: 'importPhotos', camera: 'importCamera', files: 'importFiles' }[src];
  try {
    const res = await Vault[method]();
    $('#busy').classList.remove('show');
    if (res.locked) return;
    const added = res.added || [];
    if (!added.length) return;
    state.items = [...added, ...state.items.filter((i) => !added.some((a) => a.id === i.id))];
    renderGallery();
    haptic('success');
    toast(`C’est planqué : ${addedText(added)}`);
    if (res.fromPhotos > 0 && state.settings.askDeleteOriginals !== 'no') askDeleteOriginals(res.fromPhotos);
  } catch (e) {
    $('#busy').classList.remove('show');
    if (e?.code === 'UNAVAILABLE') toast(e.message);
    else if (e?.code !== 'LOCKED') toast('L’import n’a pas abouti.');
  } finally {
    state.importing = false;
  }
}

function onProgress({ done, total }) {
  if (!total || !state.importing) return;
  $('#busy').classList.add('show');
  $('#busy-text').textContent = done < total ? `Je planque… ${done + 1} sur ${total}` : 'C’est planqué !';
  $('#busy-bar').style.width = `${Math.round((done / total) * 100)}%`;
}

function askDeleteOriginals(n) {
  setTimeout(() => openSheet(`
    <div class="row-mascot">
      <div data-noisette="awake" data-size="72"></div>
      <div class="txt"><h3>Et les originaux ?</h3></div>
    </div>
    <p>${n > 1 ? `Ces ${n} fichiers sont` : 'Ce fichier est'} encore dans ta pellicule, visible par n’importe qui. Tu veux les supprimer de Photos ? iOS va te demander de confirmer.</p>
    <div class="actions">
      <button class="btn" id="do-delete">Supprimer de Photos</button>
      <button class="btn ghost" id="keep">Les garder</button>
    </div>
    <div class="note">Ensuite, ils passent 30 jours dans l’album « Supprimés récemment » de Photos. Vide-le pour qu’ils disparaissent pour de bon.</div>
  `, {
    onMount: (body) => {
      $('#keep', body).onclick = closeSheet;
      $('#do-delete', body).onclick = async () => {
        closeSheet();
        try {
          const r = await Vault.deleteOriginals();
          if (r.deleted) toast('Supprimés de ta pellicule');
          else if (r.denied) toast('Planque n’a pas accès à Photos (Réglages › Planque).');
        } catch { /* annulé */ }
      };
    },
  }), 400);
}

// ---------------------------------------------------------------------------
// Partage et suppression
// ---------------------------------------------------------------------------
async function shareItems(ids) {
  if (!ids.length) return;
  haptic('light');
  try { await Vault.share({ ids }); } catch { toast('Partage impossible.'); }
}

function confirmDelete(ids, after) {
  if (!ids.length) return;
  haptic('medium');
  const n = ids.length;
  openSheet(`
    <h3>${n > 1 ? `Supprimer ces ${n} fichiers ?` : 'Supprimer ce fichier ?'}</h3>
    <p>${n > 1 ? 'Ils seront effacés' : 'Il sera effacé'} de ton coffre pour toujours. Impossible de revenir en arrière.</p>
    <div class="actions">
      <button class="btn danger" id="del-yes">Supprimer définitivement</button>
      <button class="btn ghost" id="del-no">Annuler</button>
    </div>
  `, {
    onMount: (body) => {
      $('#del-no', body).onclick = closeSheet;
      $('#del-yes', body).onclick = async () => {
        closeSheet();
        try {
          const { items } = await Vault.remove({ ids });
          state.items = items;
          ids.forEach((id) => state.thumbs.delete(id));
          setSelecting(false);
          renderGallery();
          haptic('success');
          toast(n > 1 ? `${n} fichiers supprimés` : 'Fichier supprimé');
          after?.();
        } catch { toast('Suppression impossible.'); }
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Visionneuse photo
// ---------------------------------------------------------------------------
function setupViewer() {
  const v = $('#viewer');
  const stage = $('#stage');
  const img = $('#viewer-img');
  $('#viewer-close').onclick = () => closeViewer();
  $('#viewer-share').onclick = () => { const id = currentViewerId(); if (id) shareItems([id]); };
  $('#viewer-delete').onclick = () => {
    const id = currentViewerId();
    if (id) confirmDelete([id], () => {
      state.viewer.list = state.viewer.list.filter((x) => x !== id);
      if (!state.viewer.list.length) return closeViewer();
      state.viewer.index = Math.min(state.viewer.index, state.viewer.list.length - 1);
      loadViewer();
    });
  };

  let x0 = null, y0 = null, t0 = 0, lastTap = 0;
  stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); });
  stage.addEventListener('pointermove', (e) => {
    if (x0 === null || state.viewer.zoom) return;
    img.style.transition = 'none';
    img.style.transform = `translateX(${e.clientX - x0}px)`;
  });
  stage.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    x0 = null;
    img.style.transition = '';
    const quick = Date.now() - t0 < 250 && Math.abs(dx) < 8 && Math.abs(dy) < 8;
    if (quick) {
      const now = Date.now();
      if (now - lastTap < 300) {
        state.viewer.zoom = !state.viewer.zoom;
        img.style.transform = state.viewer.zoom ? 'scale(2.2)' : '';
        lastTap = 0;
      } else {
        lastTap = now;
        setTimeout(() => { if (lastTap === now) v.classList.toggle('chrome-off'); }, 300);
      }
      return;
    }
    if (state.viewer.zoom) return;
    if (dy > 120 && Math.abs(dx) < 80) return closeViewer();
    if (Math.abs(dx) > 70) {
      const next = state.viewer.index + (dx < 0 ? 1 : -1);
      if (next >= 0 && next < state.viewer.list.length) { state.viewer.index = next; haptic('select'); loadViewer(); return; }
    }
    img.style.transform = '';
  });
}

function currentViewerId() { return state.viewer.list[state.viewer.index]; }

function openViewer(id) {
  state.viewer.list = state.items.filter((i) => i.kind === 'photo').map((i) => i.id);
  state.viewer.index = state.viewer.list.indexOf(id);
  $('#viewer').classList.remove('chrome-off');
  $('#viewer').classList.add('show');
  loadViewer();
}

let viewerToken = 0;
async function loadViewer() {
  const id = currentViewerId();
  const img = $('#viewer-img');
  const item = state.items.find((i) => i.id === id);
  const token = ++viewerToken;
  state.viewer.zoom = false;
  img.style.transform = '';
  img.removeAttribute('src');
  $('#viewer-spin').style.display = 'block';
  $('#viewer-meta').textContent = `${state.viewer.index + 1} / ${state.viewer.list.length}${item ? ' · ' + fmtDate(item.added) : ''}`;
  const thumb = state.thumbs.get(id);
  if (thumb) img.src = thumb;
  try {
    const { src } = await Vault.photo({ id });
    if (token !== viewerToken) return;
    img.src = src;
  } catch { if (token === viewerToken) toast('Impossible d’afficher cette photo.'); }
  if (token === viewerToken) $('#viewer-spin').style.display = 'none';
}

function closeViewer(silent) {
  const v = $('#viewer');
  if (!v.classList.contains('show')) return;
  v.classList.remove('show');
  $('#viewer-img').removeAttribute('src');
  state.viewer = { list: [], index: -1, zoom: false };
  viewerToken++;
  if (!silent) haptic('light');
}

// ---------------------------------------------------------------------------
// Réglages du coffre
// ---------------------------------------------------------------------------
function openSettings() {
  haptic('light');
  const size = state.items.reduce((a, i) => a + (i.size || 0), 0);
  const ask = state.settings.askDeleteOriginals !== 'no';
  openSheet(`
    <div class="row-mascot">
      <div data-noisette="awake" data-size="72"></div>
      <div class="txt"><h3>Ce coffre</h3><p style="margin:0">${state.items.length ? `${addedText(state.items)} · ${fmtSize(size)}` : 'Vide pour l’instant'}</p></div>
    </div>
    <div class="setting">
      <div class="txt"><b>Proposer de supprimer les originaux</b><small>Après un import depuis Photos</small></div>
      <button class="switch ${ask ? 'on' : ''}" id="sw-ask" role="switch" aria-checked="${ask}"></button>
    </div>
    <button class="opt" id="info-decoy"><span class="ico">${icon('mask')}</span><span><b>Créer un coffre leurre</b><small>Pour le jour où on te force à ouvrir Planque</small></span></button>
    <button class="opt" id="info-security"><span class="ico">${icon('shield')}</span><span><b>Comment tes fichiers sont protégés</b><small>Chiffrement, sauvegarde, changement d’iPhone</small></span></button>
    <div class="actions" style="margin-top:22px">
      <button class="btn danger small" id="destroy">Effacer ce coffre</button>
    </div>
  `, {
    onMount: (body) => {
      $('#sw-ask', body).onclick = async (e) => {
        const on = !e.currentTarget.classList.contains('on');
        e.currentTarget.classList.toggle('on', on);
        e.currentTarget.setAttribute('aria-checked', on);
        haptic('select');
        state.settings.askDeleteOriginals = on ? 'yes' : 'no';
        try { await Vault.setSetting({ key: 'askDeleteOriginals', value: on ? 'yes' : 'no' }); } catch { /* coffre non créé */ }
      };
      $('#info-decoy', body).onclick = showDecoyInfo;
      $('#info-security', body).onclick = showSecurityInfo;
      $('#destroy', body).onclick = confirmDestroy;
    },
  });
}

function showDecoyInfo() {
  openSheet(`
    <div class="row-mascot">
      <div data-noisette="awake" data-size="72"></div>
      <div class="txt"><h3>Le coffre leurre</h3></div>
    </div>
    <p>Chaque schéma ouvre son propre coffre. Un schéma inconnu n’affiche jamais d’erreur : il ouvre un coffre vide.</p>
    <p><b style="color:var(--text)">Pour en créer un :</b> verrouille Planque, dessine un autre schéma, puis mets-y quelques photos sans importance.</p>
    <p>Si quelqu’un te force à ouvrir l’appli, tu dessines celui-là. Rien n’indique combien de coffres existent, et Noisette réagit exactement pareil dans tous.</p>
    <div class="actions"><button class="btn ghost" id="back">Compris</button></div>
  `, { onMount: (b) => { $('#back', b).onclick = closeSheet; } });
}

function showSecurityInfo() {
  openSheet(`
    <div class="row-mascot">
      <div data-noisette="awake" data-size="72"></div>
      <div class="txt"><h3>Ce que fait Planque</h3></div>
    </div>
    <p>Chaque fichier est chiffré en AES-256 sur ton iPhone dès son arrivée. Les noms, les dates et les miniatures aussi.</p>
    <p>La clé vient de ton schéma et d’un secret rangé dans le trousseau de ton iPhone. Sans les deux, tes fichiers ne sont que des données illisibles. Pas de compte, pas de serveur : personne d’autre que toi ne peut les ouvrir, nous compris.</p>
    <p>Quand tu quittes l’appli, le coffre se verrouille et l’aperçu dans le sélecteur d’applis est masqué.</p>
    <div class="note"><b style="color:var(--text)">Changer d’iPhone :</b> tes coffres chiffrés suivent la sauvegarde iCloud de ton iPhone. Pour les rouvrir sur le nouveau, garde « Mots de passe et trousseau » activé dans iCloud.</div>
    <div class="actions"><button class="btn ghost" id="back">Fermer</button></div>
  `, { onMount: (b) => { $('#back', b).onclick = closeSheet; } });
}

function confirmDestroy() {
  openSheet(`
    <h3>Effacer ce coffre ?</h3>
    <p>${state.items.length ? `Les ${plural(state.items.length, 'fichier', 'fichiers')} de ce coffre seront effacés pour toujours.` : 'Ce coffre sera effacé.'} Les autres coffres ne sont pas touchés.</p>
    <div class="actions">
      <button class="btn danger" id="destroy-yes">Effacer pour toujours</button>
      <button class="btn ghost" id="destroy-no">Annuler</button>
    </div>
  `, {
    onMount: (b) => {
      $('#destroy-no', b).onclick = closeSheet;
      $('#destroy-yes', b).onclick = async () => {
        closeSheet();
        try { await Vault.destroy(); } catch { /* déjà verrouillé */ }
        haptic('success');
        clearVault();
        showLock();
        toast('Coffre effacé');
      };
    },
  });
}

boot();
