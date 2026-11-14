import { Vault, haptic, isNative } from './vault.js';
import { Forest, MIN_NUTS, strength, forestSVG, miniSVG } from './forest.js';
import { noisetteSVG, setNoisette, lookAt, resetLook } from './noisette.js';
import { entropyToWords, wordsToEntropy, countKnown, suggest, choices } from './mnemonic.js';

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
  $$('[data-mini]', root).forEach((el) => {
    if (el.dataset.hydrated) return;
    el.innerHTML = miniSVG(el.dataset.mini, el.dataset.v === '1' ? 1 : undefined);
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
const FACEID = 'plq.faceid';

async function boot() {
  $('#intro-forest').innerHTML = forestSVG();
  hydrate();
  if (!isNative) {
    document.body.insertAdjacentHTML('beforeend', '<div class="preview-banner">Aperçu navigateur — chiffrement simulé</div>');
  }
  Vault.on('locked', onLocked);
  Vault.on('progress', onProgress);

  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $('#retry').addEventListener('click', boot2);
  $('#problem-recover').addEventListener('click', () => openRecover('problem'));
  $('#gate-go').addEventListener('click', gateAuth);
  $('#lock-btn').addEventListener('click', lockNow);
  $('#settings-btn').addEventListener('click', openSettings);
  $('#select-btn').addEventListener('click', () => setSelecting(!state.selecting));
  $('#fab').addEventListener('click', openImport);
  $('#scroll').addEventListener('scroll', (e) => {
    $('#vault').classList.toggle('scrolled', e.currentTarget.scrollTop > 36);
  }, { passive: true });
  $('#sel-share').addEventListener('click', () => shareItems([...state.selected]));
  $('#sel-delete').addEventListener('click', () => confirmDelete([...state.selected]));
  setupViewer();
  setupForest();
  setupPhrase();
  setupRecover();
  await boot2();
}

async function boot2() {
  let st = { ready: true, problem: null };
  try { st = await Vault.status(); } catch { /* on tente quand même */ }
  if (st.problem === 'keyMissing') return show('problem');
  if (localStorage.getItem(ONBOARDED)) return showEntry();
  show('intro');
}

/** Entrée dans l'appli : Face ID d'abord s'il est activé, puis la forêt. */
function showEntry() {
  if (localStorage.getItem(FACEID) === '1') {
    show('gate');
    setTimeout(gateAuth, 400);
  } else {
    showLock();
  }
}

let gateBusy = false;
async function gateAuth() {
  if (gateBusy) return;
  gateBusy = true;
  try {
    const r = await Vault.authenticate();
    if (r.ok) { haptic('success'); showLock(); }
  } catch { /* annulé */ } finally { gateBusy = false; }
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
// La forêt : verrouillage, création, confirmation, récupération
// ---------------------------------------------------------------------------
const MODES = {
  lock: { title: 'Où sont tes noisettes ?', sub: 'Touche tes cachettes dans le bon ordre.', go: 'Ouvrir', link: 'J’ai oublié mes cachettes', strength: false, mascot: 'sleep' },
  create1: { title: 'Choisis tes cachettes', sub: 'Touche-les dans l’ordre, 6 ou plus. Une cachette peut servir deux fois.', go: 'Valider', link: '', strength: true, mascot: 'awake' },
  create2: { title: 'Encore une fois', sub: 'Refais le même parcours, dans le même ordre.', go: 'Confirmer', link: 'Recommencer', strength: false, mascot: 'awake' },
  confirm: { title: 'Nouveau coffre', sub: 'Refais le parcours qui a ouvert ce coffre pour le créer.', go: 'Créer le coffre', link: 'Annuler', strength: false, mascot: 'awake' },
  recover1: { title: 'Coffre retrouvé !', sub: 'Choisis le parcours qui l’ouvrira désormais.', go: 'Valider', link: 'Annuler', strength: true, mascot: 'happy' },
  recover2: { title: 'Encore une fois', sub: 'Refais le même parcours, dans le même ordre.', go: 'Confirmer', link: 'Recommencer', strength: false, mascot: 'awake' },
};
let forest;
const secret = { mode: 'lock', first: null, then: null };

function setupForest() {
  const mascot = $('#secret-mascot');
  forest = new Forest($('#forest'), {
    onStart: () => setNoisette(mascot, 'awake'),
    onNut: (id, n, x, y) => { haptic('light'); lookAt(mascot, x, y); updateNuts(); },
  });
  $('#secret-clear').onclick = () => {
    haptic('light');
    forest.clear();
    resetLook(mascot);
    updateNuts();
  };
  $('#secret-go').onclick = submitSecret;
  $('#secret-link').onclick = secretLink;
}

function startSecret(mode, { keepFirst = false } = {}) {
  secret.mode = mode;
  if (!keepFirst) secret.first = null;
  const m = MODES[mode];
  $('#secret-title').textContent = m.title;
  $('#secret-sub').textContent = m.sub;
  $('#secret-go').textContent = m.go;
  $('#secret-link').textContent = m.link;
  $('#secret-link').style.visibility = m.link ? 'visible' : 'hidden';
  forest.clear();
  forest.busy(false);
  const mascot = $('#secret-mascot');
  setNoisette(mascot, m.mascot);
  resetLook(mascot);
  updateNuts();
  show('secret');
}

const NUT_ICON = (on) => `<svg viewBox="0 0 14 16" class="${on ? 'on' : 'off'}" aria-hidden="true">
  <path d="M7 15c3.3 0 5.5-2.6 5.5-6S10.3 4.5 7 4.5 1.5 5.6 1.5 9 3.7 15 7 15z"/>
  <path class="cap" d="M1.5 6.5C2 3 4.3 1.5 7 1.5s5 1.5 5.5 5C10.5 5.4 3.5 5.4 1.5 6.5z"/></svg>`;

function setBubble(text, level = 0) {
  const b = $('#bubble');
  b.textContent = text;
  b.className = `reaction l${level}`;
}

function updateNuts() {
  const seq = forest.sequence;
  const n = seq.length;
  $('#nuts').innerHTML = Array.from({ length: Math.max(MIN_NUTS, n) }, (_, i) => NUT_ICON(i < n)).join('');
  $('#nuts').setAttribute('aria-label', `${n} noisette${n > 1 ? 's' : ''} cachée${n > 1 ? 's' : ''}`);
  $('#secret-go').disabled = n < MIN_NUTS;
  $('#secret-clear').disabled = n === 0;
  if (MODES[secret.mode].strength) {
    const st = strength(seq);
    setBubble(st.text, st.level);
  } else {
    setBubble('');
  }
}

function shakeForest() {
  const f = $('#forest');
  f.classList.remove('shake');
  void f.offsetWidth;
  f.classList.add('shake');
}

function secretFail(text) {
  haptic('warning');
  shakeForest();
  forest.busy(false);
  forest.clear();
  updateNuts();
  setNoisette($('#secret-mascot'), 'awake');
  setBubble(text, 1);
}

async function submitSecret() {
  const seq = forest.sequence;
  if (seq.length < MIN_NUTS) return;
  const mascot = $('#secret-mascot');
  resetLook(mascot);
  switch (secret.mode) {
    case 'lock':
      return doUnlock(seq);
    case 'create1':
    case 'recover1':
      secret.first = seq;
      haptic('medium');
      setNoisette(mascot, 'happy');
      forest.busy(true);
      await wait(500);
      return startSecret(secret.mode === 'create1' ? 'create2' : 'recover2', { keepFirst: true });
    case 'create2':
    case 'recover2': {
      const first = secret.first || [];
      if (seq.join('-') !== first.join('-')) {
        secretFail('Ce n’est pas le même parcours. On recommence.');
        forest.busy(true);
        await wait(1300);
        return startSecret(secret.mode === 'create2' ? 'create1' : 'recover1');
      }
      return secret.mode === 'create2' ? finishCreate(seq) : finishRecover(seq);
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
    case 'confirm': secret.then = null; return show('vault');
    default: return undefined;
  }
}

// Même déroulé, même durée minimale et même Noisette pour tous les parcours :
// rien ne permet de savoir s'ils ouvrent un vrai coffre, un leurre ou un coffre vide.
async function doUnlock(seq) {
  const mascot = $('#secret-mascot');
  forest.busy(true);
  setNoisette(mascot, 'think');
  setBubble('');
  const started = performance.now();
  try {
    const res = await Vault.unlock({ nuts: seq });
    const elapsed = performance.now() - started;
    if (elapsed < 700) await wait(700 - elapsed);
    haptic('success');
    setNoisette(mascot, 'happy');
    await wait(420);
    openVault(res);
  } catch (e) {
    forest.busy(false);
    forest.clear();
    updateNuts();
    setNoisette(mascot, 'sleep');
    if (e?.code === 'KEY_MISSING') return show('problem');
    setBubble('Réessaie.', 1);
  }
  return undefined;
}

async function finishCreate(seq) {
  const mascot = $('#secret-mascot');
  forest.busy(true);
  setNoisette(mascot, 'think');
  setBubble('Je soude ta clé à la puce de l’iPhone…');
  try {
    const res = await Vault.unlock({ nuts: seq });
    let recovery = null;
    if (res.isNew) {
      const c = await Vault.confirmNew({ nuts: seq });
      if (!c.ok) throw new Error('confirm');
      recovery = c.recovery;
    }
    localStorage.setItem(ONBOARDED, '1');
    haptic('success');
    setNoisette(mascot, 'happy');
    await wait(600);
    const enter = () => openVault({ ...res, isNew: false });
    if (recovery) showPhrase(recovery, enter); else enter();
  } catch {
    secretFail('Un souci est survenu. Réessaie.');
    await wait(1200);
    startSecret('create1');
  }
}

async function finishConfirm(seq) {
  forest.busy(true);
  setNoisette($('#secret-mascot'), 'think');
  let c = { ok: false };
  try { c = await Vault.confirmNew({ nuts: seq }); } catch { c = { ok: false }; }
  if (!c.ok) return secretFail('Ce n’est pas le parcours qui a ouvert ce coffre.');
  state.isNew = false;
  haptic('success');
  setNoisette($('#secret-mascot'), 'happy');
  await wait(500);
  const then = secret.then;
  secret.then = null;
  const back = () => { show('vault'); then?.(); };
  if (c.recovery) showPhrase(c.recovery, back); else back();
  return undefined;
}

async function finishRecover(seq) {
  forest.busy(true);
  setNoisette($('#secret-mascot'), 'think');
  setBubble('Je remets la clé en place…');
  try {
    const res = await Vault.recoverFinish({ nuts: seq });
    localStorage.setItem(ONBOARDED, '1');
    haptic('success');
    setNoisette($('#secret-mascot'), 'happy');
    await wait(500);
    openVault(res);
    toast('Coffre retrouvé, avec tes nouvelles cachettes');
  } catch (e) {
    secretFail(e?.code === 'IO' && e.message ? e.message : 'Un souci est survenu. Réessaie.');
    await wait(1600);
    startSecret('recover1');
  }
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
  // Envoyé par iOS quand l'appli passe en arrière-plan : tout est déjà effacé côté natif.
  clearVault();
  const inside = ['vault', 'secret', 'phrase', 'quiz', 'recover', 'gate'].includes(current?.id);
  if (localStorage.getItem(ONBOARDED) && inside) showEntry();
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
  $('#words').innerHTML = '';
  $('#busy').classList.remove('show');
  closeViewer(true);
  closeSheet();
}

// ---------------------------------------------------------------------------
// Phrase de secours : affichage, vérification, saisie
// ---------------------------------------------------------------------------
let phraseState = { words: [], then: null };
let quizState = { idx: [], picks: {} };

async function showPhrase(hex, then) {
  phraseState = { words: await entropyToWords(hex), then };
  $('#words').innerHTML = phraseState.words.map((w) => `<li>${esc(w)}</li>`).join('');
  show('phrase');
  $('#phrase .scroll-body').scrollTop = 0;
}

function setupPhrase() {
  $('#phrase-done').onclick = () => { haptic('light'); showQuiz(); };
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
    toast('Ce n’est pas le bon mot. Relis ta phrase.');
    show('phrase');
    return;
  }
  haptic('success');
  const then = phraseState.then;
  phraseState = { words: [], then: null };
  $('#words').innerHTML = '';
  then?.();
}

let recoverFrom = 'lock';
function openRecover(from) {
  recoverFrom = from;
  $('#recover-input').value = '';
  $('#recover-suggest').innerHTML = '';
  setHint('#recover-hint', '');
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
}

async function submitRecover() {
  const r = await wordsToEntropy($('#recover-input').value);
  if (!r.ok) {
    haptic('warning');
    const msg = r.reason === 'unknown' ? `Mot inconnu : « ${r.unknown[0]} ».`
      : r.reason === 'count' ? `Il faut 12 mots (là, il y en a ${r.count}).`
        : 'Un des mots est faux ou pas à sa place.';
    setHint('#recover-hint', msg, true);
    return;
  }
  setHint('#recover-hint', 'Je cherche ton coffre…');
  try {
    const f = await Vault.recoverStart({ entropy: r.hex });
    if (!f.found) {
      haptic('warning');
      setHint('#recover-hint', 'Aucun coffre de cet iPhone ne correspond à cette phrase.', true);
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
  state.thumbs.clear();
  renderGallery();
  show('vault');
  $('#scroll').scrollTop = 0;
}

function renderCount() {
  const n = state.items.length;
  $('#count').textContent = n ? addedText(state.items) : '';
  $('#grid-foot').innerHTML = n ? `${esc(addedText(state.items))}<small>Chiffrés sur cet iPhone</small>` : '';
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

/** Des cachettes qui n'ouvraient aucun coffre : on refait le parcours avant de créer le coffre. */
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
async function openSettings() {
  haptic('light');
  const size = state.items.reduce((a, i) => a + (i.size || 0), 0);
  const ask = state.settings.askDeleteOriginals !== 'no';
  const faceOn = localStorage.getItem(FACEID) === '1';
  let bio = { available: false, type: 'none' };
  try { bio = await Vault.biometry(); } catch { /* indisponible */ }
  const bioName = bio.type === 'faceID' ? 'Face ID' : bio.type === 'touchID' ? 'Touch ID' : 'Code de l’iPhone';
  openSheet(`
    <div class="row-mascot">
      <div data-noisette="awake" data-size="54"></div>
      <div class="txt"><h3>Ce coffre</h3><p>${state.items.length ? `${addedText(state.items)}, ${fmtSize(size)}` : 'Vide pour l’instant'}</p></div>
    </div>
    <div class="group">
      <div class="setting">
        <div class="txt"><b>Supprimer les originaux</b><small>Le proposer après un import depuis Photos</small></div>
        <button class="switch ${ask ? 'on' : ''}" id="sw-ask" role="switch" aria-checked="${ask}" aria-label="Proposer de supprimer les originaux"></button>
      </div>
      <div class="setting">
        <div class="txt"><b>${bioName} à l’ouverture</b><small>En plus des cachettes, pour tous les coffres</small></div>
        <button class="switch ${faceOn ? 'on' : ''}" id="sw-face" role="switch" aria-checked="${faceOn}" aria-label="${bioName} à l’ouverture"></button>
      </div>
    </div>
    <div class="group">
      <button class="opt" id="new-phrase"><span class="ico">${icon('phrase')}</span><span><b>Nouvelle phrase de secours</b><small>Si tu as perdu celle de ce coffre</small></span></button>
      <button class="opt" id="info-decoy"><span class="ico purple">${icon('mask')}</span><span><b>Créer un coffre leurre</b><small>Pour le jour où on te force à ouvrir Planque</small></span></button>
      <button class="opt" id="info-security"><span class="ico green">${icon('shield')}</span><span><b>Comment tes fichiers sont protégés</b></span></button>
    </div>
    <div class="actions" style="margin-top:18px">
      <button class="btn danger small" id="destroy">Effacer ce coffre</button>
    </div>
  `, {
    onMount: (body) => {
      $('#sw-ask', body).onclick = async (e) => {
        const el = e.currentTarget;
        const on = !el.classList.contains('on');
        el.classList.toggle('on', on);
        el.setAttribute('aria-checked', on);
        haptic('select');
        state.settings.askDeleteOriginals = on ? 'yes' : 'no';
        try { await Vault.setSetting({ key: 'askDeleteOriginals', value: on ? 'yes' : 'no' }); } catch { /* coffre non créé */ }
      };
      $('#sw-face', body).onclick = async (e) => {
        const el = e.currentTarget;
        const on = !el.classList.contains('on');
        if (on) {
          const r = await Vault.authenticate().catch(() => ({ ok: false }));
          if (!r.ok) return;
          if (r.available === false && isNative) { toast('Active un code sur ton iPhone pour utiliser ce verrou.'); return; }
        }
        el.classList.toggle('on', on);
        el.setAttribute('aria-checked', on);
        haptic('select');
        if (on) localStorage.setItem(FACEID, '1'); else localStorage.removeItem(FACEID);
      };
      $('#new-phrase', body).onclick = confirmNewPhrase;
      $('#info-decoy', body).onclick = showDecoyInfo;
      $('#info-security', body).onclick = showSecurityInfo;
      $('#destroy', body).onclick = confirmDestroy;
    },
  });
}

function confirmNewPhrase() {
  if (state.isNew) { toast('Ajoute d’abord un fichier pour créer ce coffre.'); return; }
  openSheet(`
    <h3>Nouvelle phrase de secours ?</h3>
    <p>L’ancienne phrase de ce coffre ne marchera plus. Les autres coffres ne sont pas touchés.</p>
    <div class="actions">
      <button class="btn" id="np-yes">Créer une nouvelle phrase</button>
      <button class="btn ghost" id="np-no">Annuler</button>
    </div>
  `, {
    onMount: (b) => {
      $('#np-no', b).onclick = closeSheet;
      $('#np-yes', b).onclick = async () => {
        closeSheet();
        try {
          const { recovery } = await Vault.newRecovery();
          showPhrase(recovery, () => { show('vault'); toast('Nouvelle phrase enregistrée'); });
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
    <p>Chaque parcours ouvre son propre coffre. Des cachettes inconnues n’affichent jamais d’erreur : elles ouvrent un coffre vide.</p>
    <p><b>Pour en créer un :</b> verrouille Planque, cache tes noisettes ailleurs, puis mets-y quelques photos sans importance.</p>
    <p>Si quelqu’un te force à ouvrir l’appli, c’est ce parcours-là que tu fais. Rien n’indique combien de coffres existent, et Noisette réagit exactement pareil dans tous.</p>
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
    <p>La clé vient de tes cachettes et d’une clé rangée dans la puce de sécurité de ton iPhone, d’où elle ne peut pas sortir. Chaque essai doit donc passer par ton iPhone : copier tes fichiers ailleurs ne sert à rien.</p>
    <p>Pas de compte, pas de serveur : personne d’autre que toi ne peut ouvrir tes coffres, nous compris.</p>
    <div class="note"><b>Changer d’iPhone :</b> tes coffres chiffrés suivent la sauvegarde de ton iPhone, mais pas la clé de la puce. Sur le nouvel iPhone, rouvre chaque coffre avec sa phrase de secours.</div>
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
