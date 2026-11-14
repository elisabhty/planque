import { Vault, haptic, isNative } from './vault.js?v=20261114a';
import { Dial, COMBO_LEN, weakCombo, dialSVG } from './dial.js?v=20261114a';
import qrcode from './vendor/qrcode.js?v=20261114a';
import { noisetteHTML, setNoisette, lookAt, resetLook } from './noisette.js?v=20261114a';
import { entropyToWords, wordsToEntropy, countKnown, suggest, choices } from './mnemonic.js?v=20261114a';

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
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  faceid: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5c1.4 1 3.6 1 5 0"/>',
  phrase: '<path d="M4 6h16M4 10h10M4 14h16M4 18h8"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  album: '<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M6 7V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V7"/>',
  restore: '<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  backup: '<path d="M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9"/><path d="M12 12v8M9 15l3-3 3 3"/>',
  flip: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M3 9.5a9 9 0 0 0 0 5M21 9.5a9 9 0 0 1 0 5"/>',
  apps: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  dial: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  print: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>',
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
    el.innerHTML = noisetteHTML({ state: el.dataset.noisette, size: +el.dataset.size || 160 });
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
  albums: [],
  album: 'all',        // 'all' | id d'album | 'trash'
  opens: [],
};
const FACEDOWN = 'plq.facedown';
const DAY = 864e5;
const when = (i) => i.taken || i.added;
const alive = () => state.items.filter((i) => !i.deleted);
const trashed = () => state.items.filter((i) => i.deleted);
function visible() {
  const list = state.album === 'trash' ? trashed()
    : alive().filter((i) => state.album === 'all' || i.album === state.album);
  return list.sort((a, b) => (state.album === 'trash' ? b.deleted - a.deleted : when(b) - when(a)));
}

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
const PREVIEW_COMBO = 'plq.preview.combo'; // aperçu navigateur uniquement : rouvrir sans repasser par le cadran
const DEMO_COMBO = [12, 34, 56, 78];
const rememberPreview = (seq) => { if (!isNative) localStorage.setItem(PREVIEW_COMBO, JSON.stringify(seq)); };

async function boot() {
  $('#intro-dial').innerHTML = dialSVG({ interactive: false });
  hydrate();
  if (!isNative) {
    document.body.insertAdjacentHTML('beforeend', '<div class="preview-banner">Aperçu navigateur — chiffrement simulé</div>');
  }
  Vault.on('locked', onLocked);
  Vault.on('progress', onProgress);

  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $('#retry').addEventListener('click', boot2);
  $('#problem-recover').addEventListener('click', () => openRecover('problem'));
  if (!isNative) { $('#demo-btn').hidden = false; $('#demo-btn').addEventListener('click', openDemo); }
  $('#lock-btn').addEventListener('click', lockNow);
  $('#settings-btn').addEventListener('click', openSettings);
  $('#select-btn').addEventListener('click', () => setSelecting(!state.selecting));
  $('#fab').addEventListener('click', openImport);
  $('#scroll').addEventListener('scroll', (e) => {
    $('#vault').classList.toggle('scrolled', e.currentTarget.scrollTop > 36);
  }, { passive: true });
  $('#selbar').addEventListener('click', onSelbar);
  $('#albums').addEventListener('click', onAlbumChip);
  $('#grid-foot').addEventListener('click', onFootClick);
  $('#banner').addEventListener('click', onBannerClick);
  if (localStorage.getItem(FACEDOWN) === '1') Vault.setFaceDownLock({ on: true }).catch(() => {});
  setupViewer();
  setupDial();
  setupPhrase();
  setupRecover();
  await refreshBio();
  await boot2();
}

async function boot2() {
  let st = { ready: true, problem: null };
  try { st = await Vault.status(); } catch { /* on tente quand même */ }
  if (st.problem === 'keyMissing') return show('problem');
  if (localStorage.getItem(ONBOARDED)) {
    // Aperçu navigateur : on rouvre directement le dernier coffre pour explorer les fonctions.
    const saved = !isNative && localStorage.getItem(PREVIEW_COMBO);
    if (saved) {
      try { return openVault(await Vault.unlock({ combo: JSON.parse(saved) })); } catch { /* on passe par le cadran */ }
    }
    return showEntry();
  }
  show('intro');
}

/** Aperçu navigateur : coffre de démonstration déjà rempli (photos d'exemple, albums, corbeille). */
async function openDemo() {
  haptic('light');
  const btn = $('#demo-btn');
  btn.disabled = true;
  btn.textContent = 'Je prépare la démo…';
  try {
    let res = await Vault.unlock({ combo: DEMO_COMBO });
    if (res.isNew) {
      await Vault.confirmNew({ combo: DEMO_COMBO });
      res = await Vault.seedDemo();
    }
    localStorage.setItem(ONBOARDED, '1');
    rememberPreview(DEMO_COMBO);
    openVault(res);
    toast(`Démo : la combinaison ${DEMO_COMBO.join('-')} ouvre ce coffre`);
  } catch {
    toast('La démo n’a pas pu démarrer.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Voir la démo, avec des photos d’exemple';
  }
}

/** Entrée dans l'appli : le cadran, et Face ID tout de suite s'il est activé. */
function showEntry() {
  showLock();
  if (bio.enabled && !bioDue()) setTimeout(bioOpen, 450);
}

function go(id) {
  haptic('light');
  if (id === 'how') {
    setNoisette($('#intro .intro-noisette'), 'happy');
    setTimeout(() => show('how'), 650);
    return;
  }
  if (id === 'create') return startSecret('create1');
  show(id);
}

function setHint(sel, text, warn = false) {
  const h = $(sel);
  h.textContent = text;
  h.classList.toggle('warn', warn);
}

// ---------------------------------------------------------------------------
// Le cadran : verrouillage, création, confirmation, récupération
// ---------------------------------------------------------------------------
const MODES = {
  lock: { title: 'Ouvre ta planque', sub: 'Tourne le cadran sur chaque nombre, puis touche le centre.', link: 'Combinaison oubliée ?', weak: false, mascot: 'sleep' },
  create1: { title: 'Choisis ta combinaison', sub: '4 nombres de 0 à 99. Tourne jusqu’au nombre, puis touche le centre.', link: '', weak: true, mascot: 'awake' },
  create2: { title: 'Encore une fois', sub: 'Refais la même combinaison, dans le même ordre.', link: 'Recommencer', weak: false, mascot: 'awake' },
  confirm: { title: 'Nouveau coffre', sub: 'Refais la combinaison qui a ouvert ce coffre pour le créer.', link: 'Annuler', weak: false, mascot: 'awake' },
  recover1: { title: 'Coffre retrouvé !', sub: 'Choisis la combinaison qui l’ouvrira désormais.', link: 'Annuler', weak: true, mascot: 'happy' },
  recover2: { title: 'Encore une fois', sub: 'Refais la même combinaison, dans le même ordre.', link: 'Recommencer', weak: false, mascot: 'awake' },
  rekey1: { title: 'Nouvelle combinaison', sub: 'Choisis la nouvelle combinaison de ce coffre. L’ancienne n’ouvrira plus rien.', link: 'Annuler', weak: true, mascot: 'awake' },
  rekey2: { title: 'Encore une fois', sub: 'Refais la même combinaison, dans le même ordre.', link: 'Recommencer', weak: false, mascot: 'awake' },
};
let dial;
const secret = { mode: 'lock', first: null, then: null };

function setupDial() {
  const mascot = $('#secret-mascot');
  dial = new Dial($('#dial'), {
    onStart: () => { setNoisette(mascot, 'shy'); setBubble(''); },
    onTick: () => haptic('select'),
    onNumber: (n, count) => {
      haptic('medium');
      updateSlots();
      if (count >= COMBO_LEN) submitSecret();
    },
  });
  $('#secret-clear').onclick = () => {
    haptic('light');
    dial.clear();
    setNoisette(mascot, MODES[secret.mode].mascot);
    updateSlots();
  };
  $('#secret-go').onclick = () => bioOpen();
  $('#secret-link').onclick = secretLink;
}

function startSecret(mode, { keepFirst = false } = {}) {
  secret.mode = mode;
  if (!keepFirst) secret.first = null;
  const m = MODES[mode];
  $('#secret-title').textContent = m.title;
  $('#secret-sub').textContent = m.sub;
  $('#secret-link').textContent = m.link;
  $('#secret-link').style.visibility = m.link ? 'visible' : 'hidden';
  $('#secret-go').hidden = !(mode === 'lock' && bio.enabled);
  dial.clear();
  dial.busy(false);
  setNoisette($('#secret-mascot'), m.mascot);
  setBubble('');
  updateSlots();
  show('secret');
}

function setBubble(text, level = 0) {
  const b = $('#bubble');
  b.textContent = text;
  b.className = `reaction l${level}`;
}

function updateSlots() {
  const n = dial.sequence.length;
  $('#slots').innerHTML = Array.from({ length: COMBO_LEN }, (_, i) =>
    `<span class="slot${i < n ? ' on' : ''}${i === n ? ' next' : ''}"></span>`).join('');
  $('#slots').setAttribute('aria-label', `${n} nombre${n > 1 ? 's' : ''} sur ${COMBO_LEN}`);
  $('#secret-clear').disabled = n === 0;
}

function secretFail(text) {
  haptic('warning');
  dial.shake();
  dial.busy(false);
  dial.clear();
  updateSlots();
  setNoisette($('#secret-mascot'), 'awake');
  setBubble(text, 1);
}

async function submitSecret() {
  const seq = dial.sequence;
  if (seq.length < COMBO_LEN) return;
  const mascot = $('#secret-mascot');
  resetLook(mascot);
  switch (secret.mode) {
    case 'lock':
      return doUnlock(seq);
    case 'create1':
    case 'recover1':
    case 'rekey1': {
      const weak = weakCombo(seq);
      if (weak) return secretFail(`${weak} Choisis-en une autre.`);
      secret.first = seq;
      haptic('medium');
      setNoisette(mascot, 'happy');
      dial.busy(true);
      await wait(500);
      return startSecret(secret.mode.replace('1', '2'), { keepFirst: true });
    }
    case 'create2':
    case 'recover2':
    case 'rekey2': {
      const first = secret.first || [];
      if (seq.join('-') !== first.join('-')) {
        secretFail('Ce n’est pas la même combinaison. On recommence.');
        dial.busy(true);
        await wait(1300);
        return startSecret(secret.mode.replace('2', '1'));
      }
      if (secret.mode === 'create2') return finishCreate(seq);
      if (secret.mode === 'rekey2') return finishRekey(seq);
      return finishRecover(seq);
    }
    case 'confirm':
      return finishConfirm(seq);
    default:
      return undefined;
  }
}

function secretLink() {
  haptic('light');
  switch (secret.mode) {
    case 'lock': return openRecover('lock');
    case 'create2': return startSecret('create1');
    case 'recover2': return startSecret('recover1');
    case 'recover1': return lockNow();
    case 'rekey2': return startSecret('rekey1');
    case 'rekey1': return show('vault');
    case 'confirm': secret.then = null; return show('vault');
    default: return undefined;
  }
}

const noteCombo = (res) => { if (res && !res.isNew) localStorage.setItem(BIO_LAST, String(Date.now())); };

// Même déroulé, même durée minimale et même Noisette pour toutes les combinaisons :
// rien ne permet de savoir si elles ouvrent un vrai coffre, un leurre ou un coffre vide.
async function doUnlock(seq) {
  const mascot = $('#secret-mascot');
  dial.busy(true);
  setNoisette(mascot, 'think');
  setBubble('');
  const started = performance.now();
  try {
    const res = await Vault.unlock({ combo: seq });
    rememberPreview(seq);
    noteCombo(res);
    const elapsed = performance.now() - started;
    if (elapsed < 700) await wait(700 - elapsed);
    haptic('heavy');
    dial.open();
    setNoisette(mascot, 'happy');
    await wait(520);
    openVault(res);
  } catch (e) {
    dial.busy(false);
    dial.clear();
    updateSlots();
    setNoisette(mascot, 'sleep');
    if (e?.code === 'KEY_MISSING') return show('problem');
    if (e?.code === 'WAIT') { haptic('warning'); setBubble(e.message, 1); return undefined; }
    setBubble('Réessaie.', 1);
  }
  return undefined;
}

async function finishCreate(seq) {
  const mascot = $('#secret-mascot');
  dial.busy(true);
  setNoisette(mascot, 'think');
  setBubble('Je soude ta clé à la puce de l’iPhone…');
  try {
    const res = await Vault.unlock({ combo: seq });
    let recovery = null;
    if (res.isNew) {
      const c = await Vault.confirmNew({ combo: seq });
      if (!c.ok) throw new Error('confirm');
      recovery = c.recovery;
    }
    localStorage.setItem(ONBOARDED, '1');
    localStorage.setItem(BIO_LAST, String(Date.now()));
    rememberPreview(seq);
    haptic('success');
    dial.open();
    setNoisette(mascot, 'happy');
    await wait(600);
    const enter = () => openVault({ ...res, isNew: false });
    if (recovery) showCard(recovery, enter); else enter();
  } catch (e) {
    secretFail(e?.code === 'WAIT' ? e.message : 'Un souci est survenu. Réessaie.');
    await wait(1200);
    startSecret('create1');
  }
}

async function finishConfirm(seq) {
  dial.busy(true);
  setNoisette($('#secret-mascot'), 'think');
  let c = { ok: false };
  try { c = await Vault.confirmNew({ combo: seq }); } catch { c = { ok: false }; }
  if (!c.ok) return secretFail('Ce n’est pas la combinaison qui a ouvert ce coffre.');
  state.isNew = false;
  haptic('success');
  dial.open();
  setNoisette($('#secret-mascot'), 'happy');
  await wait(500);
  const then = secret.then;
  secret.then = null;
  const back = () => { show('vault'); then?.(); };
  if (c.recovery) showCard(c.recovery, back); else back();
  return undefined;
}

async function finishRecover(seq) {
  dial.busy(true);
  setNoisette($('#secret-mascot'), 'think');
  setBubble('Je remets la clé en place…');
  try {
    const res = await Vault.recoverFinish({ combo: seq });
    localStorage.setItem(ONBOARDED, '1');
    localStorage.setItem(BIO_LAST, String(Date.now()));
    rememberPreview(seq);
    haptic('success');
    dial.open();
    setNoisette($('#secret-mascot'), 'happy');
    await wait(500);
    openVault(res);
    toast('Coffre retrouvé, avec ta nouvelle combinaison');
  } catch (e) {
    secretFail(e?.code === 'IO' && e.message ? e.message : 'Un souci est survenu. Réessaie.');
    await wait(1600);
    startSecret('recover1');
  }
}

async function finishRekey(seq) {
  dial.busy(true);
  setNoisette($('#secret-mascot'), 'think');
  setBubble('Je change la serrure…');
  try {
    const res = await Vault.rekey({ combo: seq });
    rememberPreview(seq);
    haptic('success');
    dial.open();
    setNoisette($('#secret-mascot'), 'happy');
    await wait(500);
    openVault(res);
    toast(bio.enabled ? 'Nouvelle combinaison en place. Si Face ID ouvrait ce coffre, réactive-le dans les réglages.' : 'Nouvelle combinaison en place');
  } catch (e) {
    secretFail(e?.code === 'IO' && e.message ? e.message : 'Un souci est survenu. Réessaie.');
    await wait(1600);
    startSecret('rekey1');
  }
}

// ---------------------------------------------------------------------------
// Face ID : ouvre directement le coffre où il a été activé
// ---------------------------------------------------------------------------
const BIO_LAST = 'plq.bio.last'; // dernière ouverture avec la combinaison
let bio = { available: false, enabled: false, type: 'none' };
const bioName = () => (bio.type === 'touchID' ? 'Touch ID' : 'Face ID');
const bioDue = () => Date.now() - Number(localStorage.getItem(BIO_LAST) || 0) > 7 * DAY;

async function refreshBio() {
  try { bio = await Vault.bioStatus(); } catch { bio = { available: false, enabled: false, type: 'none' }; }
}

async function bioOpen() {
  if (!bio.enabled || secret.mode !== 'lock') return;
  if (bioDue()) {
    setBubble('Une fois par semaine, je te demande ta combinaison, pour que tu ne l’oublies pas.');
    return;
  }
  try {
    const r = await Vault.bioUnlock();
    if (r.ok) {
      haptic('heavy');
      dial.open();
      setNoisette($('#secret-mascot'), 'happy');
      await wait(420);
      openVault(r);
      return;
    }
    if (r.reset) {
      bio.enabled = false;
      $('#secret-go').hidden = true;
      setBubble(`${bioName()} a été désactivé : tape ta combinaison.`);
    }
  } catch { /* annulé */ }
}

function showLock() {
  closeSheet();
  closeViewer(true);
  startSecret('lock');
}

async function lockNow() {
  haptic('medium');
  clearVault();
  try { await Vault.lock(); } catch { /* déjà verrouillé */ }
  showLock();
}

function onLocked() {
  // Envoyé par iOS quand l'appli passe en arrière-plan (ou iPhone retourné) : tout est déjà effacé côté natif.
  clearVault();
  const inside = ['vault', 'secret', 'phrase', 'quiz', 'recover'].includes(current?.id);
  if (localStorage.getItem(ONBOARDED) && inside) showEntry();
  requestAnimationFrame(() => requestAnimationFrame(() => Vault.uncover().catch(() => {})));
}

function clearVault() {
  state.items = [];
  state.thumbs.clear();
  state.selected.clear();
  state.settings = {};
  state.isNew = false;
  state.albums = [];
  state.opens = [];
  state.album = 'all';
  setSelecting(false);
  $('#grid').innerHTML = '';
  $('#albums').innerHTML = '';
  $('#banner').innerHTML = '';
  $('#words').innerHTML = '';
  $('#busy').classList.remove('show');
  closeViewer(true);
  closeSheet();
}

// ---------------------------------------------------------------------------
// Carte-clé de secours : un QR code + les mêmes 128 bits en 12 mots
// ---------------------------------------------------------------------------
let phraseState = { words: [], then: null, png: null, hex: null };
let quizState = { idx: [], picks: {} };

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hexBytes = (hex) => new Uint8Array(hex.match(/../g).map((b) => parseInt(b, 16)));
const cardPayload = (hex) => `PLQR1.${b64url(hexBytes(hex))}`;
function cardHex(text) {
  const m = /PLQR1\.([A-Za-z0-9_-]{16,40})/.exec(text || '');
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (m[1].length % 4)) % 4));
    if (bin.length !== 16) return null;
    return [...bin].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

function loadImage(src) {
  return new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });
}

/** Dessine la carte-clé (1200 × 760, format carte bancaire). */
async function drawCard(hex, words) {
  const W = 1200, H = 760;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (w, px) => `${w} ${px}px -apple-system, "SF Pro Display", system-ui, sans-serif`;
  const round = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
  // fond
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1C1C1E'); bg.addColorStop(1, '#050505');
  round(0, 0, W, H, 48); g.fillStyle = bg; g.fill();
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; round(1, 1, W - 2, H - 2, 47); g.stroke();
  // QR code
  const qr = qrcode(0, 'M');
  qr.addData(cardPayload(hex));
  qr.make();
  const n = qr.getModuleCount();
  const box = 500, x0 = 56, y0 = 130;
  round(x0, y0, box, box, 28); g.fillStyle = '#fff'; g.fill();
  const cell = Math.floor((box - 56) / n), off = x0 + (box - cell * n) / 2, offY = y0 + (box - cell * n) / 2;
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect(off + k * cell, offY + r * cell, cell, cell);
  // en-tête
  const mascot = await loadImage('img/noisette/awake.webp');
  if (mascot) g.drawImage(mascot, 56, 28, 84, 84);
  g.fillStyle = '#fff'; g.font = font(700, 44); g.textBaseline = 'middle';
  g.fillText('Carte-clé Planque', 152, 62);
  g.fillStyle = 'rgba(235,235,245,.6)'; g.font = font(500, 22);
  g.fillText(`Créée le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, 154, 98);
  // 12 mots
  const cx = 604;
  g.fillStyle = 'rgba(235,235,245,.6)'; g.font = font(600, 20);
  g.fillText('OU LES 12 MOTS, DANS L’ORDRE', cx, 152);
  words.forEach((w, i) => {
    const col = i < 6 ? 0 : 1, row = i % 6;
    const x = cx + col * 280, y = 200 + row * 50;
    g.fillStyle = 'rgba(235,235,245,.45)'; g.font = font(500, 20);
    g.fillText(String(i + 1).padStart(2, ' '), x, y);
    g.fillStyle = '#fff'; g.font = font(600, 28);
    g.fillText(w, x + 36, y);
  });
  // consigne
  g.fillStyle = 'rgba(235,235,245,.6)'; g.font = font(500, 21);
  ['Avec cette carte et ton iPhone (ou ta sauvegarde Planque),', 'on peut rouvrir ce coffre. Range-la comme une clé,', 'loin de ton téléphone.']
    .forEach((line, i) => g.fillText(line, cx, 540 + i * 32));
  g.fillStyle = '#FF9F0A'; g.font = font(600, 21);
  g.fillText('Planque › Combinaison oubliée › Scanner ma carte-clé', cx, 650);
  return c.toDataURL('image/png');
}

async function showCard(hex, then) {
  const words = await entropyToWords(hex);
  phraseState = { words, then, png: await drawCard(hex, words), hex };
  $('#card-img').src = phraseState.png;
  $('#card-img').hidden = false;
  $('#words').innerHTML = words.map((w) => `<li>${esc(w)}</li>`).join('');
  $('#words').hidden = true;
  $('#card-words').hidden = false;
  $('#phrase-done').disabled = true;
  $('#phrase-done').textContent = 'C’est fait';
  $('#phrase-done').dataset.next = 'done';
  show('phrase');
  $('#phrase .scroll-body').scrollTop = 0;
}

function finishCard() {
  haptic('success');
  const then = phraseState.then;
  phraseState = { words: [], then: null, png: null, hex: null };
  $('#words').innerHTML = '';
  $('#card-img').removeAttribute('src');
  then?.();
}

function setupPhrase() {
  $('#card-save').onclick = async () => {
    haptic('light');
    try {
      const r = await Vault.saveCard({ png: phraseState.png.split(',')[1] });
      if (r.locked) return;
      if (r.done) {
        $('#phrase-done').disabled = false;
        toast(r.via && /print/i.test(r.via) ? 'Carte envoyée à l’imprimante' : 'Carte enregistrée');
      }
    } catch { toast('Impossible pour le moment.'); }
  };
  $('#card-words').onclick = () => {
    haptic('light');
    $('#card-img').hidden = true;
    $('#words').hidden = false;
    $('#card-words').hidden = true;
    $('#phrase-done').disabled = false;
    $('#phrase-done').textContent = 'Je les ai recopiés';
    $('#phrase-done').dataset.next = 'quiz';
  };
  $('#phrase-done').onclick = () => {
    haptic('light');
    if ($('#phrase-done').dataset.next === 'quiz') showQuiz(); else finishCard();
  };
  $('#quiz-back').onclick = () => show('phrase');
  $('#quiz-ok').onclick = checkQuiz;
}

function showQuiz() {
  const w = phraseState.words;
  const a = Math.floor(Math.random() * 6);
  const b = 6 + Math.floor(Math.random() * 6);
  quizState = { idx: [a, b], picks: {} };
  $('#quiz-body').innerHTML = [a, b].map((i) => `
    <b>Quel est le mot n° ${i + 1} ?</b>
    <div class="chips" data-q="${i}">${choices(w[i]).map((c) => `<button class="chip" data-w="${esc(c)}">${esc(c)}</button>`).join('')}</div>`).join('');
  $$('#quiz-body .chips').forEach((row) => row.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    haptic('select');
    $$('.chip', row).forEach((x) => x.classList.toggle('on', x === chip));
    quizState.picks[row.dataset.q] = chip.dataset.w;
    $('#quiz-ok').disabled = Object.keys(quizState.picks).length < 2;
  }));
  $('#quiz-ok').disabled = true;
  show('quiz');
}

function checkQuiz() {
  const w = phraseState.words;
  if (!quizState.idx.every((i) => quizState.picks[i] === w[i])) {
    haptic('warning');
    toast('Ce n’est pas le bon mot. Relis tes 12 mots.');
    show('phrase');
    return;
  }
  finishCard();
}

let recoverFrom = 'lock';
function openRecover(from) {
  recoverFrom = from;
  $('#recover-input').value = '';
  $('#recover-suggest').innerHTML = '';
  setHint('#recover-hint', '');
  $('#recover-scan').hidden = !isNative;
  show('recover');
}

function setupRecover() {
  const input = $('#recover-input');
  input.addEventListener('input', () => {
    const v = input.value;
    const n = countKnown(v);
    const last = /\s$/.test(v) ? '' : (v.split(/\s+/).pop() || '');
    $('#recover-suggest').innerHTML = suggest(last).map((w) => `<button class="chip" data-w="${esc(w)}">${esc(w)}</button>`).join('');
    setHint('#recover-hint', n ? `${n} / 12 mots reconnus` : '');
  });
  $('#recover-suggest').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const parts = input.value.split(/\s+/);
    parts[parts.length - 1] = chip.dataset.w;
    input.value = `${parts.join(' ')} `;
    input.dispatchEvent(new Event('input'));
    input.focus();
  });
  $('#recover-back').onclick = () => (recoverFrom === 'problem' ? show('problem') : showLock());
  $('#recover-go').onclick = submitRecover;
  $('#recover-scan').onclick = scanCard;
  $('#recover-file').onclick = importBackupFile;
}

async function importBackupFile() {
  haptic('light');
  let r = { imported: false };
  try { r = await Vault.importBackup(); } catch { r = { imported: false, error: 'Import impossible.' }; }
  if (r.locked) return;
  if (r.error) { haptic('warning'); setHint('#recover-hint', r.error, true); return; }
  if (!r.imported) return;
  if (r.already) { setHint('#recover-hint', 'Ce coffre est déjà sur cet iPhone : ouvre-le avec ta combinaison, ou avec sa carte-clé.'); return; }
  haptic('success');
  setHint('#recover-hint', 'Sauvegarde ajoutée. Scanne maintenant la carte-clé de ce coffre, ou tape ses 12 mots.');
  $('#recover-input').focus();
}

async function scanCard() {
  haptic('light');
  let r = { text: '' };
  try { r = await Vault.scanCard(); } catch (e) { setHint('#recover-hint', e?.message || 'Appareil photo indisponible.', true); return; }
  if (r.denied) { setHint('#recover-hint', 'Autorise l’appareil photo pour Planque (Réglages › Planque), ou tape les 12 mots.', true); return; }
  const hex = cardHex(r.text);
  if (hex) findVault(hex);
}

async function submitRecover() {
  const typed = $('#recover-input').value;
  const fromCard = cardHex(typed);
  if (fromCard) return findVault(fromCard);
  const r = await wordsToEntropy(typed);
  if (!r.ok) {
    haptic('warning');
    const msg = r.reason === 'unknown' ? `Mot inconnu : « ${r.unknown[0]} ».`
      : r.reason === 'count' ? `Il faut 12 mots (là, il y en a ${r.count}).`
        : 'Un des mots est faux ou pas à sa place.';
    setHint('#recover-hint', msg, true);
    return undefined;
  }
  return findVault(r.hex);
}

async function findVault(hex) {
  setHint('#recover-hint', 'Je cherche ton coffre…');
  try {
    const f = await Vault.recoverStart({ entropy: hex });
    if (!f.found) {
      haptic('warning');
      setHint('#recover-hint', 'Aucun coffre de cet iPhone ne correspond à cette carte-clé.', true);
      return;
    }
    $('#recover-input').value = '';
    haptic('success');
    startSecret('recover1');
  } catch {
    setHint('#recover-hint', 'Un souci est survenu. Réessaie.', true);
  }
}

// ---------------------------------------------------------------------------
// Coffre : galerie
// ---------------------------------------------------------------------------
function openVault(res) {
  state.items = res.items || [];
  state.isNew = !!res.isNew;
  state.settings = res.settings || {};
  state.albums = res.albums || [];
  state.opens = res.opens || [];
  if (state.album !== 'all' && state.album !== 'trash' && !state.albums.some((a) => a.id === state.album)) state.album = 'all';
  state.thumbs.clear();
  renderGallery();
  show('vault');
  $('#scroll').scrollTop = 0;
}

function applyItems(items) {
  if (items) state.items = items;
  renderGallery();
}

const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const monthLabel = (ms) => { const t = monthFmt.format(new Date(ms)); return t.charAt(0).toUpperCase() + t.slice(1); };

function renderCount() {
  const list = visible();
  const albumName = state.album === 'trash' ? 'Supprimés récemment' : state.albums.find((a) => a.id === state.album)?.name;
  $('#count').textContent = list.length ? addedText(list) : '';
  $('.vault-title h2').textContent = albumName || 'Ma planque';
  $('.mini-title').textContent = albumName || 'Ma planque';
  let foot = list.length ? `${esc(addedText(list))}` : '';
  if (state.album === 'trash') {
    foot += `<small>Effacés pour de bon 30 jours après leur suppression.</small>`;
    if (list.length) foot += `<span class="foot-links"><button data-foot="restore-all">Tout récupérer</button><button data-foot="empty" class="red">Tout supprimer</button></span>`;
  } else if (albumName) {
    foot += `<span class="foot-links"><button data-foot="rename">Renommer l’album</button><button data-foot="del-album" class="red">Supprimer l’album</button></span>`;
  } else if (list.length) {
    foot += '<small>Chiffrés sur cet iPhone</small>';
  }
  $('#grid-foot').innerHTML = foot;
}

function renderAlbums() {
  const all = alive();
  const t = trashed().length;
  const chip = (id, label, n) => `<button class="chip${state.album === id ? ' on' : ''}" data-album="${esc(id)}" role="tab" aria-selected="${state.album === id}">${esc(label)}${n != null ? ` <span>${n}</span>` : ''}</button>`;
  $('#albums').innerHTML = (all.length || state.albums.length || t)
    ? chip('all', 'Tout', all.length)
      + state.albums.map((a) => chip(a.id, a.name, all.filter((i) => i.album === a.id).length)).join('')
      + `<button class="chip add" data-album="new" aria-label="Nouvel album">${icon('plus', 16)}Album</button>`
      + (t ? chip('trash', 'Supprimés', t) : '')
    : '';
}

function renderBanner() {
  const last = Number(state.settings.lastBackup || 0);
  const snooze = Number(state.settings.backupSnooze || 0);
  const n = alive().length;
  const due = n >= 5 && Date.now() - last > 30 * DAY && Date.now() > snooze && state.album !== 'trash';
  $('#banner').innerHTML = due ? `
    <div class="banner">
      <span class="ico">${icon('backup', 20)}</span>
      <div class="txt"><b>${last ? 'Ta sauvegarde date un peu' : 'Aucune sauvegarde pour l’instant'}</b>
        <small>Un fichier chiffré à ranger dans Fichiers ou iCloud Drive : si tu perds ton iPhone, tes photos ne sont pas perdues.</small>
        <span class="banner-actions"><button class="btn small" data-banner="go">Sauvegarder</button><button class="text-btn" data-banner="later">Plus tard</button></span>
      </div>
    </div>` : '';
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
  if (item.deleted) {
    const left = Math.max(0, 30 - Math.floor((Date.now() - item.deleted) / DAY));
    inner += `<span class="days">${left} j</span>`;
  }
  return `<button class="tile${sel}" data-id="${esc(item.id)}" aria-label="${esc(item.name)}">${inner}<span class="check">${icon('check', 14)}</span></button>`;
}

let observer;
function renderGallery() {
  const list = visible();
  let html = '';
  if (state.album === 'trash') {
    html = list.length ? `<div class="grid">${list.map(tileHTML).join('')}</div>` : '';
  } else {
    let month = '';
    for (const it of list) {
      const m = monthLabel(when(it));
      if (m !== month) { html += `${month ? '</div>' : ''}<h4 class="month">${m}</h4><div class="grid">`; month = m; }
      html += tileHTML(it);
    }
    if (month) html += '</div>';
  }
  $('#grid').innerHTML = html;
  const empty = alive().length === 0 && state.album === 'all';
  $('#empty').classList.toggle('show', empty);
  setNoisette($('#empty-mascot'), 'awake');
  $('#select-btn').style.visibility = list.length ? 'visible' : 'hidden';
  $('#fab').style.display = state.album === 'trash' ? 'none' : '';
  $('#vault').classList.toggle('in-trash', state.album === 'trash');
  renderAlbums();
  renderBanner();
  renderCount();
  observeTiles();
  updateSelbar();
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
  if (state.selecting || state.album === 'trash') {
    if (!state.selecting) setSelecting(true);
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
  const b = (act, ic, label, cls = '') => `<button class="sel-act ${cls}" data-act="${act}"${n ? '' : ' disabled'}>${icon(ic, 22)}<span>${label}</span></button>`;
  $('#selbar').innerHTML = state.album === 'trash'
    ? b('restore', 'restore', 'Récupérer') + b('purge', 'trash', 'Supprimer', 'red')
    : b('share', 'share', 'Partager') + b('album', 'album', 'Album') + b('photos', 'download', 'Photos') + b('delete', 'trash', 'Supprimer', 'red');
  const label = $('#count');
  if (state.selecting) label.textContent = n ? plural(n, 'élément choisi', 'éléments choisis') : 'Choisis des éléments';
}

function onSelbar(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  const ids = [...state.selected];
  if (!ids.length) return;
  ({
    share: () => shareItems(ids),
    album: () => pickAlbum(ids),
    photos: () => saveToPhotos(ids),
    delete: () => confirmDelete(ids),
    restore: () => restoreItems(ids),
    purge: () => confirmPurge(ids),
  })[act]?.();
}

function onAlbumChip(e) {
  const chip = e.target.closest('[data-album]');
  if (!chip) return;
  const id = chip.dataset.album;
  haptic('select');
  if (id === 'new') return newAlbum();
  if (id === state.album && id !== 'all' && id !== 'trash') return albumOptions(id);
  setSelecting(false);
  state.album = id;
  renderGallery();
  $('#scroll').scrollTop = 0;
}

function onFootClick(e) {
  const a = e.target.closest('[data-foot]')?.dataset.foot;
  if (!a) return;
  const ids = trashed().map((i) => i.id);
  ({
    'restore-all': () => restoreItems(ids),
    empty: () => confirmPurge(ids),
    rename: () => renameAlbum(state.album),
    'del-album': () => confirmDeleteAlbum(state.album),
  })[a]?.();
}

function onBannerClick(e) {
  const a = e.target.closest('[data-banner]')?.dataset.banner;
  if (a === 'go') runBackup();
  if (a === 'later') {
    const until = String(Date.now() + 7 * DAY);
    state.settings.backupSnooze = until;
    Vault.setSetting({ key: 'backupSnooze', value: until }).catch(() => {});
    renderBanner();
  }
}

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------
function nameSheet({ title, value = '', ok, onOk }) {
  openSheet(`
    <h3>${esc(title)}</h3>
    <input class="field" id="name-input" maxlength="40" value="${esc(value)}" placeholder="Nom de l’album" autocomplete="off" enterkeyhint="done">
    <div class="actions">
      <button class="btn" id="name-ok">${esc(ok)}</button>
      <button class="btn ghost" id="name-no">Annuler</button>
    </div>
  `, {
    onMount: (b) => {
      const input = $('#name-input', b);
      setTimeout(() => input.focus(), 350);
      const go = async () => {
        const v = input.value.trim();
        if (!v) { input.focus(); return; }
        try { await onOk(v); closeSheet(); } catch (err) { toast(err?.message || 'Impossible pour le moment.'); }
      };
      $('#name-ok', b).onclick = go;
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      $('#name-no', b).onclick = closeSheet;
    },
  });
}

async function ensureCreated() {
  if (!state.isNew) return true;
  toast('Ajoute d’abord un fichier pour créer ce coffre.');
  return false;
}

async function newAlbum(thenMove) {
  if (!await ensureCreated()) return;
  nameSheet({
    title: 'Nouvel album',
    ok: 'Créer',
    onOk: async (name) => {
      const r = await Vault.createAlbum({ name });
      state.albums = r.albums;
      if (thenMove) {
        const m = await Vault.moveToAlbum({ ids: thenMove, album: r.album.id });
        state.items = m.items;
        setSelecting(false);
        toast(`Rangé dans « ${r.album.name} »`);
      }
      state.album = r.album.id;
      renderGallery();
      haptic('success');
    },
  });
}

function albumOptions(id) {
  const a = state.albums.find((x) => x.id === id);
  if (!a) return;
  openSheet(`
    <h3>${esc(a.name)}</h3>
    <div class="group">
      <button class="opt" id="ao-rename"><span class="ico gray">${icon('pencil')}</span><span><b>Renommer</b></span></button>
      <button class="opt" id="ao-delete"><span class="ico" style="background:var(--red)">${icon('trash')}</span><span><b>Supprimer l’album</b><small>Les photos restent dans « Tout »</small></span></button>
    </div>
  `, {
    onMount: (b) => {
      $('#ao-rename', b).onclick = () => { closeSheet(); setTimeout(() => renameAlbum(id), 300); };
      $('#ao-delete', b).onclick = () => { closeSheet(); setTimeout(() => confirmDeleteAlbum(id), 300); };
    },
  });
}

function renameAlbum(id) {
  const a = state.albums.find((x) => x.id === id);
  if (!a) return;
  nameSheet({
    title: 'Renommer l’album',
    value: a.name,
    ok: 'Renommer',
    onOk: async (name) => { const r = await Vault.renameAlbum({ id, name }); state.albums = r.albums; renderGallery(); },
  });
}

function confirmDeleteAlbum(id) {
  const a = state.albums.find((x) => x.id === id);
  if (!a) return;
  openSheet(`
    <h3>Supprimer « ${esc(a.name)} » ?</h3>
    <p>L’album disparaît, pas les photos : elles restent dans « Tout ».</p>
    <div class="actions">
      <button class="btn danger" id="da-yes">Supprimer l’album</button>
      <button class="btn ghost" id="da-no">Annuler</button>
    </div>
  `, {
    onMount: (b) => {
      $('#da-no', b).onclick = closeSheet;
      $('#da-yes', b).onclick = async () => {
        closeSheet();
        try {
          const r = await Vault.deleteAlbum({ id });
          state.albums = r.albums;
          state.items = r.items;
          state.album = 'all';
          renderGallery();
          haptic('success');
        } catch { toast('Impossible pour le moment.'); }
      };
    },
  });
}

function pickAlbum(ids) {
  const inAlbum = state.items.some((i) => ids.includes(i.id) && i.album);
  openSheet(`
    <h3>Ranger ${ids.length > 1 ? `ces ${ids.length} éléments` : 'cet élément'}</h3>
    <div class="group">
      ${state.albums.map((a) => `<button class="opt" data-to="${esc(a.id)}"><span class="ico blue">${icon('album')}</span><span><b>${esc(a.name)}</b></span></button>`).join('')}
      <button class="opt" data-to="new"><span class="ico">${icon('plus')}</span><span><b>Nouvel album…</b></span></button>
      ${inAlbum ? `<button class="opt" data-to=""><span class="ico gray">${icon('x')}</span><span><b>Retirer de l’album</b></span></button>` : ''}
    </div>
  `, {
    onMount: (b) => $$('[data-to]', b).forEach((btn) => btn.addEventListener('click', async () => {
      const to = btn.dataset.to;
      closeSheet();
      if (to === 'new') { setTimeout(() => newAlbum(ids), 300); return; }
      try {
        const r = await Vault.moveToAlbum({ ids, album: to });
        state.items = r.items;
        setSelecting(false);
        renderGallery();
        haptic('success');
        toast(to ? `Rangé dans « ${state.albums.find((a) => a.id === to)?.name} »` : 'Retiré de l’album');
      } catch { toast('Impossible pour le moment.'); }
    })),
  });
}

// ---------------------------------------------------------------------------
// Sortir du coffre : Photos, sauvegarde chiffrée
// ---------------------------------------------------------------------------
async function saveToPhotos(ids) {
  haptic('light');
  try {
    const r = await Vault.exportToPhotos({ ids });
    if (r.denied) { toast('Autorise Planque à ajouter dans Photos (Réglages › Planque).'); return; }
    if (r.saved) {
      haptic('success');
      toast(r.skipped ? `${plural(r.saved, 'élément remis', 'éléments remis')} dans Photos. Les documents, avec Partager.` : `${plural(r.saved, 'élément remis', 'éléments remis')} dans Photos`);
      setSelecting(false);
    } else if (r.skipped) {
      toast('Les documents ne vont pas dans Photos : utilise Partager.');
    }
  } catch { toast('Impossible pour le moment.'); }
}

async function runBackup() {
  if (!await ensureCreated()) return;
  haptic('light');
  try {
    const r = await Vault.exportBackup();
    if (r.done) {
      state.settings.lastBackup = String(r.at || Date.now());
      haptic('success');
      toast('Sauvegarde enregistrée');
      renderBanner();
    }
  } catch { toast('La sauvegarde n’a pas abouti.'); }
}

function lastBackupText() {
  const last = Number(state.settings.lastBackup || 0);
  if (!last) return 'Jamais faite';
  const days = Math.floor((Date.now() - last) / DAY);
  return days === 0 ? 'Dernière : aujourd’hui' : days === 1 ? 'Dernière : hier' : `Dernière : il y a ${days} jours`;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
function openImport() {
  haptic('light');
  openSheet(`
    <div class="row-mascot">
      <div data-noisette="awake" data-size="54"></div>
      <div class="txt"><h3>Qu’est-ce qu’on planque ?</h3></div>
    </div>
    <div class="group">
      <button class="opt" data-src="photos"><span class="ico blue">${icon('image')}</span><span><b>Photos et vidéos</b><small>Depuis ta pellicule</small></span></button>
      <button class="opt" data-src="camera"><span class="ico gray">${icon('camera')}</span><span><b>Appareil photo</b><small>Directement dans le coffre, sans passer par ta pellicule</small></span></button>
      <button class="opt" data-src="files"><span class="ico teal">${icon('folder')}</span><span><b>Fichiers</b><small>PDF, papiers, documents</small></span></button>
    </div>
  `, {
    onMount: (body) => $$('[data-src]', body).forEach((b) => b.addEventListener('click', () => {
      const src = b.dataset.src;
      closeSheet();
      if (state.isNew) confirmNewVault(() => runImport(src));
      else runImport(src);
    })),
  });
}

/** Une combinaison qui n'ouvrait aucun coffre : on la retape avant de créer le coffre. */
function confirmNewVault(then) {
  secret.then = then;
  startSecret('confirm');
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
      <div data-noisette="awake" data-size="54"></div>
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
    <h3>${n > 1 ? `Supprimer ces ${n} éléments ?` : 'Supprimer cet élément ?'}</h3>
    <p>${n > 1 ? 'Ils restent' : 'Il reste'} 30 jours dans « Supprimés récemment » de ce coffre, au cas où.</p>
    <div class="actions">
      <button class="btn danger" id="del-yes">${n > 1 ? `Supprimer ${n} éléments` : 'Supprimer'}</button>
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
          setSelecting(false);
          renderGallery();
          haptic('success');
          toast(n > 1 ? `${n} éléments dans Supprimés récemment` : 'Dans Supprimés récemment');
          after?.();
        } catch { toast('Suppression impossible.'); }
      };
    },
  });
}

async function restoreItems(ids) {
  try {
    const { items } = await Vault.restore({ ids });
    state.items = items;
    setSelecting(false);
    if (!trashed().length) state.album = 'all';
    renderGallery();
    haptic('success');
    toast(ids.length > 1 ? `${ids.length} éléments récupérés` : 'Élément récupéré');
  } catch { toast('Impossible pour le moment.'); }
}

function confirmPurge(ids) {
  const n = ids.length;
  openSheet(`
    <h3>${n > 1 ? `Supprimer définitivement ${n} éléments ?` : 'Supprimer définitivement ?'}</h3>
    <p>Impossible de revenir en arrière, même avec la carte-clé.</p>
    <div class="actions">
      <button class="btn danger" id="pg-yes">Supprimer définitivement</button>
      <button class="btn ghost" id="pg-no">Annuler</button>
    </div>
  `, {
    onMount: (b) => {
      $('#pg-no', b).onclick = closeSheet;
      $('#pg-yes', b).onclick = async () => {
        closeSheet();
        try {
          const { items } = await Vault.remove({ ids, forever: true });
          state.items = items;
          ids.forEach((id) => state.thumbs.delete(id));
          setSelecting(false);
          if (!trashed().length) state.album = 'all';
          renderGallery();
          haptic('success');
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
  $('#viewer-save').onclick = () => { const id = currentViewerId(); if (id) saveToPhotos([id]); };
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
  state.viewer.list = visible().filter((i) => i.kind === 'photo').map((i) => i.id);
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
  $('#viewer-meta').textContent = `${state.viewer.index + 1} / ${state.viewer.list.length}${item ? ' · ' + fmtDate(when(item)) : ''}`;
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
async function openSettings() {
  haptic('light');
  const items = alive();
  const size = items.reduce((a, i) => a + (i.size || 0), 0);
  const ask = state.settings.askDeleteOriginals !== 'no';
  const downOn = localStorage.getItem(FACEDOWN) === '1';
  await refreshBio();
  const t = trashed().length;
  openSheet(`
    <div class="row-mascot">
      <div data-noisette="awake" data-size="54"></div>
      <div class="txt"><h3>Ce coffre</h3><p>${items.length ? `${addedText(items)}, ${fmtSize(size)}` : 'Vide pour l’instant'}</p></div>
    </div>

    <p class="group-label">Ne rien perdre</p>
    <div class="group">
      <button class="opt" id="st-backup"><span class="ico blue">${icon('backup')}</span><span><b>Sauvegarde chiffrée</b><small>${lastBackupText()}. À ranger dans Fichiers, iCloud Drive ou sur un ordinateur.</small></span></button>
      <button class="opt" id="st-phrase"><span class="ico">${icon('qr')}</span><span><b>Nouvelle carte-clé</b><small>Si tu as perdu celle de ce coffre</small></span></button>
      ${t ? `<button class="opt" id="st-trash"><span class="ico gray">${icon('trash')}</span><span><b>Supprimés récemment</b><small>${plural(t, 'élément', 'éléments')}, gardés 30 jours</small></span></button>` : ''}
    </div>

    <p class="group-label">Sécurité</p>
    <div class="group">
      <button class="opt" id="st-opens"><span class="ico teal">${icon('clock')}</span><span><b>Dernières ouvertures</b><small>Repère si quelqu’un connaît ta combinaison</small></span></button>
      <button class="opt" id="st-rekey"><span class="ico green">${icon('dial')}</span><span><b>Changer de combinaison</b><small>L’ancienne n’ouvrira plus ce coffre</small></span></button>
      <button class="opt" id="st-decoy"><span class="ico purple">${icon('mask')}</span><span><b>Créer un coffre leurre</b><small>Pour le jour où on te force à ouvrir Planque</small></span></button>
    </div>

    <p class="group-label">Discrétion</p>
    <div class="group">
      <div class="setting">
        <div class="txt"><b>Verrouiller en retournant l’iPhone</b><small>Écran contre la table : le coffre se ferme aussitôt</small></div>
        <button class="switch ${downOn ? 'on' : ''}" id="sw-down" role="switch" aria-checked="${downOn}" aria-label="Verrouiller en retournant l’iPhone"></button>
      </div>
      <div class="setting${bio.available ? '' : ' off'}">
        <div class="txt"><b>Ouvrir ce coffre avec ${bioName()}</b><small>${bio.available ? 'La combinaison reste demandée une fois par semaine' : 'Dans l’app iPhone, avec Face ID activé'}</small></div>
        <button class="switch ${bio.enabled ? 'on' : ''}" id="sw-face" role="switch" aria-checked="${bio.enabled}" aria-label="Ouvrir ce coffre avec ${bioName()}"${bio.available ? '' : ' disabled'}></button>
      </div>
      <div class="setting">
        <div class="txt"><b>Supprimer les originaux</b><small>Le proposer après un import depuis Photos</small></div>
        <button class="switch ${ask ? 'on' : ''}" id="sw-ask" role="switch" aria-checked="${ask}" aria-label="Proposer de supprimer les originaux"></button>
      </div>
    </div>
    <div class="group">
      <button class="opt" id="st-icon"><span class="ico gray">${icon('apps')}</span><span><b>Icône de l’app</b><small>Une icône plus discrète sur l’écran d’accueil</small></span></button>
      <button class="opt" id="st-security"><span class="ico green">${icon('shield')}</span><span><b>Comment tes fichiers sont protégés</b></span></button>
    </div>

    <div class="actions" style="margin-top:18px">
      <button class="btn danger small" id="destroy">Effacer ce coffre</button>
    </div>
  `, {
    onMount: (body) => {
      const toggle = (el, on) => { el.classList.toggle('on', on); el.setAttribute('aria-checked', on); haptic('select'); };
      $('#sw-ask', body).onclick = async (e) => {
        const el = e.currentTarget;
        const on = !el.classList.contains('on');
        toggle(el, on);
        state.settings.askDeleteOriginals = on ? 'yes' : 'no';
        try { await Vault.setSetting({ key: 'askDeleteOriginals', value: on ? 'yes' : 'no' }); } catch { /* coffre non créé */ }
      };
      $('#sw-face', body).onclick = async (e) => {
        const el = e.currentTarget;
        const on = !el.classList.contains('on');
        if (on && state.isNew) { toast('Ajoute d’abord un fichier pour créer ce coffre.'); return; }
        try {
          const r = on ? await Vault.bioEnable() : await Vault.bioDisable();
          if (on && !r.enabled) return;
          bio.enabled = !!r.enabled;
          toggle(el, bio.enabled);
          if (bio.enabled) { localStorage.setItem(BIO_LAST, String(Date.now())); toast(`${bioName()} ouvrira ce coffre`); }
        } catch (err) { toast(err?.message || 'Impossible pour le moment.'); }
      };
      $('#sw-down', body).onclick = async (e) => {
        const el = e.currentTarget;
        const on = !el.classList.contains('on');
        toggle(el, on);
        if (on) localStorage.setItem(FACEDOWN, '1'); else localStorage.removeItem(FACEDOWN);
        Vault.setFaceDownLock({ on }).catch(() => {});
        if (on && !isNative) toast('Fonctionne dans l’app iPhone');
      };
      $('#st-backup', body).onclick = () => { closeSheet(); setTimeout(runBackup, 300); };
      $('#st-phrase', body).onclick = confirmNewPhrase;
      if (t) $('#st-trash', body).onclick = () => { closeSheet(); setSelecting(false); state.album = 'trash'; renderGallery(); };
      $('#st-opens', body).onclick = showOpens;
      $('#st-rekey', body).onclick = () => {
        if (state.isNew) { toast('Ajoute d’abord un fichier pour créer ce coffre.'); return; }
        closeSheet();
        startSecret('rekey1');
      };
      $('#st-decoy', body).onclick = showDecoyInfo;
      $('#st-icon', body).onclick = pickIcon;
      $('#st-security', body).onclick = showSecurityInfo;
      $('#destroy', body).onclick = confirmDestroy;
    },
  });
}

function showOpens() {
  const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const list = state.opens.slice(0, 20);
  openSheet(`
    <div class="row-mascot">
      <div data-noisette="think" data-size="54"></div>
      <div class="txt"><h3>Dernières ouvertures</h3><p>De ce coffre uniquement</p></div>
    </div>
    <div class="group opens">
      ${list.map((t, i) => `<div class="setting"><div class="txt"><b>${esc(fmt.format(new Date(t)))}</b>${i === 0 ? '<small>Celle-ci</small>' : ''}</div></div>`).join('') || '<div class="setting"><div class="txt"><small>Aucune ouverture depuis la création de ce coffre.</small></div></div>'}
    </div>
    <div class="note">Une ouverture que tu ne reconnais pas ? Quelqu’un connaît ta combinaison. Change-la tout de suite : l’ancienne n’ouvrira plus rien.</div>
    <div class="actions">
      <button class="btn" id="op-rekey">Changer de combinaison</button>
      <button class="btn ghost" id="op-close">Fermer</button>
    </div>
  `, {
    onMount: (b) => {
      $('#op-close', b).onclick = closeSheet;
      $('#op-rekey', b).onclick = () => {
        if (state.isNew) { toast('Ajoute d’abord un fichier pour créer ce coffre.'); return; }
        closeSheet();
        startSecret('rekey1');
      };
    },
  });
}

async function pickIcon() {
  let cur = { name: 'default', supported: false };
  try { cur = await Vault.getIcon(); } catch { /* indisponible */ }
  const icons = [['default', 'Noisette', 'img/icon-default.png'], ['AppIconLune', 'Lune', 'img/icon-lune.png'], ['AppIconForet', 'Sapin', 'img/icon-foret.png']];
  openSheet(`
    <h3>Icône de l’app</h3>
    <p>Une icône plus neutre sur ton écran d’accueil. Le nom « Planque » reste écrit dessous.</p>
    <div class="icon-pick">
      ${icons.map(([id, label, src]) => `<button class="${cur.name === id ? 'on' : ''}" data-icon-name="${id}"${cur.supported ? '' : ' disabled'}><img src="${src}" alt=""><span>${label}</span></button>`).join('')}
    </div>
    ${cur.supported ? '' : '<div class="note">Disponible dans l’app iPhone.</div>'}
  `, {
    onMount: (b) => $$('[data-icon-name]', b).forEach((btn) => btn.addEventListener('click', async () => {
      const r = await Vault.setIcon({ name: btn.dataset.iconName }).catch(() => ({ ok: false }));
      if (r.ok) { $$('[data-icon-name]', b).forEach((x) => x.classList.toggle('on', x === btn)); haptic('success'); }
    })),
  });
}

function confirmNewPhrase() {
  if (state.isNew) { toast('Ajoute d’abord un fichier pour créer ce coffre.'); return; }
  openSheet(`
    <h3>Nouvelle carte-clé ?</h3>
    <p>L’ancienne carte de ce coffre (et ses 12 mots) ne marchera plus. Les autres coffres ne sont pas touchés.</p>
    <div class="actions">
      <button class="btn" id="np-yes">Créer une nouvelle carte</button>
      <button class="btn ghost" id="np-no">Annuler</button>
    </div>
  `, {
    onMount: (b) => {
      $('#np-no', b).onclick = closeSheet;
      $('#np-yes', b).onclick = async () => {
        closeSheet();
        try {
          const { recovery } = await Vault.newRecovery();
          showCard(recovery, () => { show('vault'); toast('Nouvelle carte-clé en place'); });
        } catch { toast('Impossible pour le moment.'); }
      };
    },
  });
}

function showDecoyInfo() {
  openSheet(`
    <div class="row-mascot">
      <div data-noisette="awake" data-size="54"></div>
      <div class="txt"><h3>Le coffre leurre</h3></div>
    </div>
    <p>Chaque combinaison ouvre son propre coffre. Une combinaison inconnue n’affiche jamais d’erreur : elle ouvre un coffre vide.</p>
    <p><b>Pour en créer un :</b> verrouille Planque, tape une autre combinaison, puis mets-y quelques photos sans importance.</p>
    <p>Si quelqu’un te force à ouvrir l’appli, c’est cette combinaison-là que tu tapes. Rien n’indique combien de coffres existent, et Noisette réagit exactement pareil dans tous.</p>
    <div class="actions"><button class="btn ghost" id="back">Compris</button></div>
  `, { onMount: (b) => { $('#back', b).onclick = closeSheet; } });
}

function showSecurityInfo() {
  openSheet(`
    <div class="row-mascot">
      <div data-noisette="awake" data-size="54"></div>
      <div class="txt"><h3>Ce que fait Planque</h3></div>
    </div>
    <p>Chaque fichier est chiffré en AES-256 sur ton iPhone dès son arrivée. Les noms, les dates et les miniatures aussi.</p>
    <p>La clé vient de ta combinaison et d’une clé rangée dans la puce de sécurité de ton iPhone, d’où elle ne peut pas sortir. Chaque essai doit donc passer par ton iPhone, qui impose une attente de plus en plus longue après plusieurs erreurs : copier tes fichiers ailleurs ne sert à rien.</p>
    <p>Pas de compte, pas de serveur : personne d’autre que toi ne peut ouvrir tes coffres, nous compris.</p>
    <div class="note"><b>Changer d’iPhone :</b> tes coffres chiffrés suivent la sauvegarde de ton iPhone, ou ta sauvegarde chiffrée Planque. La clé de la puce, elle, reste sur l’ancien. Sur le nouvel iPhone, rouvre chaque coffre avec sa carte-clé.</div>
    <div class="actions"><button class="btn ghost" id="back">Fermer</button></div>
  `, { onMount: (b) => { $('#back', b).onclick = closeSheet; } });
}

function confirmDestroy() {
  openSheet(`
    <h3>Effacer ce coffre ?</h3>
    <p>${state.items.length ? `Les ${plural(state.items.length, 'élément', 'éléments')} de ce coffre seront effacés pour toujours, sans passer par Supprimés récemment.` : 'Ce coffre sera effacé.'} Les autres coffres ne sont pas touchés.</p>
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
