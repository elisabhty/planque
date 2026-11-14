// Simulation du coffre pour l'aperçu dans un navigateur (développement uniquement).
// Même logique que le plugin iOS : combinaison du cadran → PBKDF2 → mélange avec la clé de l'appareil
// (simulée ici par un secret aléatoire, sur iPhone c'est la puce de sécurité) → HKDF → clé d'enveloppe
// + localisateur, clé maîtresse aléatoire, carte-clé de secours, AES-256-GCM, coffre vide si combinaison inconnue,
// frein aux essais ratés.
// Stockage : IndexedDB du navigateur. Sur iPhone, c'est le plugin Swift qui fait tout.

const DB = 'planque-sim';
const ITER = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function kv(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode);
    const out = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}
const get = (k) => kv('readonly', (s) => s.get(k));
const put = (k, v) => kv('readwrite', (s) => s.put(v, k));
const del = (k) => kv('readwrite', (s) => s.delete(k));
async function keysWithPrefix(prefix) {
  const db = await idb();
  return new Promise((resolve) => {
    const q = db.transaction('kv').objectStore('kv').getAllKeys(IDBKeyRange.bound(prefix, prefix + '\uffff'));
    q.onsuccess = () => resolve(q.result);
  });
}
async function delPrefix(prefix) {
  const db = await idb();
  return new Promise((resolve) => {
    const tx = db.transaction('kv', 'readwrite');
    const range = IDBKeyRange.bound(prefix, prefix + '￿');
    tx.objectStore('kv').delete(range);
    tx.oncomplete = () => resolve();
  });
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

async function seal(key, data, aad) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, data);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv); out.set(new Uint8Array(ct), 12);
  return out.buffer;
}
async function open(key, buf, aad) {
  const u = new Uint8Array(buf);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12), additionalData: enc.encode(aad) }, key, u.slice(12));
}
const aesKey = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', true, ['encrypt', 'decrypt']);
const fromHex = (h) => new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16)));
async function hkdf(ikm, salt, info, bits) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) }, k, bits);
}
async function recoveryKeys(entropy) {
  const b = await hkdf(entropy, enc.encode('plq-recovery'), 'plq2-rec', 512);
  return { kek: await aesKey(b.slice(0, 32)), rid: hex(await crypto.subtle.digest('SHA-256', b.slice(32, 64))).slice(0, 32) };
}

function blobToDataURL(blob) {
  return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
}

async function thumbFromImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 420 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
    return { thumb: await blob.arrayBuffer(), width: bmp.width, height: bmp.height };
  } catch { return {}; }
}
function thumbFromVideo(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url;
    const done = (r) => { URL.revokeObjectURL(url); resolve(r); };
    v.onloadedmetadata = () => { v.currentTime = Math.min(0.5, (v.duration || 0) / 2); };
    v.onseeked = async () => {
      const s = Math.min(1, 420 / Math.max(v.videoWidth, v.videoHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
      done({ thumb: await blob.arrayBuffer(), width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    };
    v.onerror = () => done({});
    setTimeout(() => done({}), 5000);
  });
}

function pickFiles({ accept = '', capture = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = !capture; input.accept = accept;
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = () => { resolve([...input.files]); input.remove(); };
    input.oncancel = () => { resolve([]); input.remove(); };
    document.body.appendChild(input);
    input.click();
  });
}

export class WebVault {
  constructor() {
    this.s = null;
    this.listeners = {};
    // Aperçu navigateur : on ne verrouille pas en quittant l'onglet, pour pouvoir explorer.
    // (Sur iPhone, le plugin natif verrouille toujours dès que l'appli passe en arrière-plan.)
  }
  on(event, cb) { (this.listeners[event] ||= []).push(cb); return { remove: () => {} }; }
  emit(event, data) { (this.listeners[event] || []).forEach((cb) => cb(data)); }

  async device() {
    let d = await get('device');
    if (!d) { d = { salt: rand(16).buffer, secret: rand(32).buffer }; await put('device', d); }
    return d;
  }

  async derive(combo) {
    const { salt, secret } = await this.device();
    const pw = await crypto.subtle.importKey('raw', enc.encode(`plq3|cadran100|${combo.join('-')}`), 'PBKDF2', false, ['deriveBits']);
    const pre = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, pw, 256);
    const hk = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mixed = await crypto.subtle.sign('HMAC', hk, pre); // sur iPhone : ECDH avec la puce de sécurité
    const bits = await hkdf(mixed, pre, 'plq2-keys', 512);
    return { kek: await aesKey(bits.slice(0, 32)), vaultId: hex(await crypto.subtle.digest('SHA-256', bits.slice(32, 64))).slice(0, 32) };
  }

  check(combo) {
    if (!Array.isArray(combo) || combo.length !== 4 || combo.some((n) => !Number.isInteger(n) || n < 0 || n > 99)) {
      throw Object.assign(new Error('Choisis 4 nombres sur le cadran.'), { code: 'BAD_PATTERN' });
    }
  }

  // Frein aux essais ratés (même règle que sur iPhone ; ici dans le stockage du navigateur).
  throttle() {
    try { return JSON.parse(localStorage.getItem('plq.sim.throttle')) || { misses: 0, last: 0 }; } catch { return { misses: 0, last: 0 }; }
  }
  effectiveMisses(st, now) { return st.misses > 0 ? Math.max(0, st.misses - Math.floor((now - st.last) / 3600)) : 0; }
  waitLeft() {
    const st = this.throttle();
    const now = Date.now() / 1000;
    const m = this.effectiveMisses(st, now);
    const delay = m < 5 ? 0 : [30, 60, 300, 900, 3600][Math.min(m - 5, 4)];
    return Math.max(0, Math.ceil(st.last + delay - now));
  }
  recordAttempt(opened) {
    if (opened) return;
    const now = Date.now() / 1000;
    const st = this.throttle();
    localStorage.setItem('plq.sim.throttle', JSON.stringify({ misses: this.effectiveMisses(st, now) + 1, last: now }));
  }

  async writeRecovery(s) {
    const entropy = rand(16);
    const rk = await recoveryKeys(entropy);
    const raw = await crypto.subtle.exportKey('raw', s.master);
    await put(`v:${s.vaultId}:rec`, await seal(rk.kek, raw, 'plq-rec'));
    await put(`v:${s.vaultId}:rid`, rk.rid);
    return hex(entropy);
  }

  need() { if (!this.s) throw Object.assign(new Error('Le coffre est verrouillé.'), { code: 'LOCKED' }); return this.s; }
  needPersisted() { const s = this.need(); if (!s.persisted) throw Object.assign(new Error('Ce coffre n’est pas encore créé.'), { code: 'NOT_CREATED' }); return s; }

  async saveIndex() {
    const s = this.s;
    if (!s?.persisted) return;
    await put(`v:${s.vaultId}:index`, await seal(s.master, enc.encode(JSON.stringify(s.index)), 'plq-index'));
  }

  async status() { return { ready: true, problem: null, enclave: false }; }

  async unlock({ combo }) {
    this.check(combo);
    this.s = null;
    const left = this.waitLeft();
    if (left > 0) {
      const msg = left >= 60 ? `Trop d’essais. Réessaie dans ${Math.ceil(left / 60)} min.` : `Trop d’essais. Réessaie dans ${left} s.`;
      throw Object.assign(new Error(msg), { code: 'WAIT' });
    }
    const { kek, vaultId } = await this.derive(combo);
    let s = { vaultId, kek, master: await aesKey(rand(32)), persisted: false, index: { v: 1, items: [], settings: {} } };
    const wrapped = await get(`v:${vaultId}:key`);
    if (wrapped) {
      try {
        const raw = await open(kek, wrapped, `plq-key|${vaultId}`);
        const master = await aesKey(raw);
        let index = { v: 1, items: [], settings: {} };
        const ei = await get(`v:${vaultId}:index`);
        if (ei) index = JSON.parse(dec.decode(await open(master, ei, 'plq-index')));
        s = { vaultId, kek, master, persisted: true, index };
      } catch { /* coffre vide, sans erreur */ }
    }
    this.s = s;
    this.recordAttempt(s.persisted);
    if (s.persisted) {
      const now = Date.now();
      s.index.opens = [...(s.index.opens || []), now].slice(-30);
      const expired = s.index.items.filter((i) => i.deleted && i.deleted < now - 30 * 864e5).map((i) => i.id);
      if (expired.length) await this.purge(expired);
      await this.saveIndex();
    }
    return { ...this.unlockState(), byCombo: true };
  }

  async purge(ids) {
    const s = this.s;
    const set = new Set(ids);
    s.index.items = s.index.items.filter((i) => !set.has(i.id));
    for (const id of ids) { await del(`v:${s.vaultId}:b:${id}`); await del(`v:${s.vaultId}:t:${id}`); }
  }

  async confirmNew({ combo }) {
    const s = this.need();
    if (s.persisted) return { ok: true };
    try { this.check(combo); } catch { return { ok: false }; }
    const { vaultId } = await this.derive(combo);
    if (vaultId !== s.vaultId) return { ok: false };
    const raw = await crypto.subtle.exportKey('raw', s.master);
    await put(`v:${vaultId}:key`, await seal(s.kek, raw, `plq-key|${vaultId}`));
    s.persisted = true;
    await this.saveIndex();
    return { ok: true, recovery: await this.writeRecovery(s) };
  }

  async recoverStart({ entropy }) {
    this.s = null;
    this.pending = null;
    if (!/^[0-9a-f]{32}$/.test(entropy || '')) return { found: false };
    const rk = await recoveryKeys(fromHex(entropy));
    for (const k of await keysWithPrefix('v:')) {
      if (!k.endsWith(':rid') || (await get(k)) !== rk.rid) continue;
      const vaultId = k.split(':')[1];
      try {
        const raw = await open(rk.kek, await get(`v:${vaultId}:rec`), 'plq-rec');
        this.pending = { vaultId, raw };
        return { found: true };
      } catch { /* pas celui-là */ }
    }
    return { found: false };
  }

  async recoverFinish({ combo }) {
    this.check(combo);
    const p = this.pending;
    if (!p) throw Object.assign(new Error('Le coffre est verrouillé.'), { code: 'LOCKED' });
    const { kek, vaultId } = await this.derive(combo);
    if (vaultId !== p.vaultId && await get(`v:${vaultId}:key`)) {
      throw Object.assign(new Error('Cette combinaison ouvre déjà un autre coffre. Choisis-en une autre.'), { code: 'IO' });
    }
    if (vaultId !== p.vaultId) {
      for (const k of await keysWithPrefix(`v:${p.vaultId}:`)) {
        await put(k.replace(`v:${p.vaultId}:`, `v:${vaultId}:`), await get(k));
        await del(k);
      }
    }
    await put(`v:${vaultId}:key`, await seal(kek, p.raw, `plq-key|${vaultId}`));
    this.pending = null;
    return this.openWith(kek, vaultId);
  }

  async newRecovery() { const s = this.needPersisted(); return { recovery: await this.writeRecovery(s) }; }
  async biometry() { return { available: false, type: 'none' }; }
  async authenticate() { return { ok: true, available: false }; }

  // Face ID et appareil photo : seulement dans l'app iPhone.
  async bioStatus() { return { available: false, enabled: false, type: 'faceID' }; }
  async bioEnable() { throw Object.assign(new Error('Face ID fonctionne dans l’app iPhone.'), { code: 'UNAVAILABLE' }); }
  async bioDisable() { return { enabled: false }; }
  async bioUnlock() { return { ok: false }; }
  async scanCard() { return { text: '', unavailable: true }; }
  async saveCard({ png }) {
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${png}`;
    a.download = 'Carte-cle-Planque.png';
    a.click();
    return { done: true, via: 'download' };
  }

  /** Rouvre un coffre à partir de sa clé d'enveloppe (récupération, nouvelle combinaison). */
  async openWith(kek, vaultId) {
    const wrapped = await get(`v:${vaultId}:key`);
    const raw = await open(kek, wrapped, `plq-key|${vaultId}`);
    const master = await aesKey(raw);
    let index = { v: 1, items: [], settings: {} };
    const ei = await get(`v:${vaultId}:index`);
    if (ei) index = JSON.parse(dec.decode(await open(master, ei, 'plq-index')));
    this.s = { vaultId, kek, master, persisted: true, index };
    return this.unlockState();
  }

  async lock() { this.s = null; }
  async uncover() {}

  async thumbs({ ids }) {
    const s = this.need();
    const out = {};
    for (const id of ids) {
      const b = await get(`v:${s.vaultId}:t:${id}`);
      if (!b) continue;
      const plain = await open(s.master, b, `plq-thumb|${id}`);
      out[id] = await blobToDataURL(new Blob([plain], { type: 'image/jpeg' }));
    }
    return { thumbs: out };
  }

  async raw(id) {
    const s = this.need();
    const item = s.index.items.find((i) => i.id === id);
    if (!item) throw Object.assign(new Error('Fichier introuvable.'), { code: 'NOT_FOUND' });
    const b = await get(`v:${s.vaultId}:b:${id}`);
    return { item, data: await open(s.master, b, `plq-blob|${id}`) };
  }

  async photo({ id }) {
    const { item, data } = await this.raw(id);
    return { src: await blobToDataURL(new Blob([data], { type: item.mime || 'image/jpeg' })) };
  }

  async openItem({ id }) {
    const { item, data } = await this.raw(id);
    const url = URL.createObjectURL(new Blob([data], { type: item.mime || 'application/octet-stream' }));
    await new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:60;background:#000;display:flex;align-items:center;justify-content:center';
      wrap.innerHTML = item.kind === 'video'
        ? `<video src="${url}" controls autoplay playsinline style="max-width:100%;max-height:100%"></video>`
        : `<iframe src="${url}" style="width:100%;height:100%;border:0;background:#fff"></iframe>`;
      const x = document.createElement('button');
      x.textContent = '✕';
      x.style.cssText = 'position:absolute;top:16px;left:16px;width:40px;height:40px;border-radius:20px;background:rgba(255,255,255,.15);color:#fff;font-size:18px';
      x.onclick = () => { wrap.remove(); URL.revokeObjectURL(url); resolve(); };
      wrap.appendChild(x);
      document.body.appendChild(wrap);
    });
    return {};
  }

  async ingest(files) {
    const s = this.needPersisted();
    const added = [];
    this.emit('progress', { done: 0, total: files.length });
    for (const [i, f] of files.entries()) {
      if (this.s !== s) break;
      const kind = f.type.startsWith('image/') ? 'photo' : f.type.startsWith('video/') ? 'video' : 'file';
      const id = crypto.randomUUID();
      const buf = await f.arrayBuffer();
      const dot = f.name.lastIndexOf('.');
      const meta = kind === 'photo' ? await thumbFromImage(f) : kind === 'video' ? await thumbFromVideo(f) : {};
      await put(`v:${s.vaultId}:b:${id}`, await seal(s.master, buf, `plq-blob|${id}`));
      if (meta.thumb) await put(`v:${s.vaultId}:t:${id}`, await seal(s.master, meta.thumb, `plq-thumb|${id}`));
      const item = {
        id, kind, mime: f.type,
        name: dot > 0 ? f.name.slice(0, dot) : f.name,
        ext: dot > 0 ? f.name.slice(dot + 1).toLowerCase() : '',
        size: f.size, added: Date.now(), taken: f.lastModified || undefined, hasThumb: !!meta.thumb,
        width: meta.width, height: meta.height, duration: meta.duration,
      };
      s.index.items.unshift(item);
      await this.saveIndex();
      added.push(item);
      this.emit('progress', { done: i + 1, total: files.length });
    }
    return added;
  }

  async importPhotos() { this.needPersisted(); const f = await pickFiles({ accept: 'image/*,video/*' }); return { added: await this.ingest(f), fromPhotos: 0 }; }
  async importCamera() { this.needPersisted(); const f = await pickFiles({ accept: 'image/*', capture: true }); return { added: await this.ingest(f), fromPhotos: 0 }; }
  async importFiles() { this.needPersisted(); const f = await pickFiles(); return { added: await this.ingest(f), fromPhotos: 0 }; }
  async deleteOriginals() { return { deleted: false }; }

  async share({ ids }) {
    for (const id of ids) {
      const { item, data } = await this.raw(id);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: item.mime }));
      a.download = item.ext ? `${item.name}.${item.ext}` : item.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    return {};
  }

  async remove({ ids, forever = false }) {
    const s = this.needPersisted();
    if (forever) await this.purge(ids);
    else { const set = new Set(ids); const now = Date.now(); s.index.items.forEach((i) => { if (set.has(i.id)) i.deleted = now; }); }
    await this.saveIndex();
    return { items: s.index.items };
  }

  async restore({ ids }) {
    const s = this.needPersisted();
    const set = new Set(ids);
    s.index.items.forEach((i) => { if (set.has(i.id)) delete i.deleted; });
    await this.saveIndex();
    return { items: s.index.items };
  }

  async createAlbum({ name }) {
    const s = this.needPersisted();
    const n = String(name || '').trim().slice(0, 40);
    if (!n) throw Object.assign(new Error('Donne un nom à l’album.'), { code: 'IO' });
    const album = { id: crypto.randomUUID(), name: n };
    s.index.albums = [...(s.index.albums || []), album];
    await this.saveIndex();
    return { album, albums: s.index.albums };
  }

  async renameAlbum({ id, name }) {
    const s = this.needPersisted();
    const n = String(name || '').trim().slice(0, 40);
    if (!n) throw Object.assign(new Error('Donne un nom à l’album.'), { code: 'IO' });
    (s.index.albums || []).forEach((a) => { if (a.id === id) a.name = n; });
    await this.saveIndex();
    return { albums: s.index.albums || [] };
  }

  async deleteAlbum({ id }) {
    const s = this.needPersisted();
    s.index.albums = (s.index.albums || []).filter((a) => a.id !== id);
    s.index.items.forEach((i) => { if (i.album === id) delete i.album; });
    await this.saveIndex();
    return { albums: s.index.albums, items: s.index.items };
  }

  async moveToAlbum({ ids, album }) {
    const s = this.needPersisted();
    const set = new Set(ids);
    s.index.items.forEach((i) => { if (set.has(i.id)) { if (album) i.album = album; else delete i.album; } });
    await this.saveIndex();
    return { items: s.index.items };
  }

  async exportToPhotos({ ids }) {
    let saved = 0, skipped = 0;
    for (const id of ids) {
      const { item } = await this.raw(id);
      if (item.kind === 'file') { skipped++; continue; }
      await this.share({ ids: [id] });
      saved++;
    }
    return { saved, skipped };
  }

  // Sauvegarde : toutes les entrées chiffrées du coffre, telles quelles (simulation du fichier .planque).
  async exportBackup() {
    const s = this.needPersisted();
    const prefix = `v:${s.vaultId}:`;
    const entries = {};
    for (const k of await keysWithPrefix(prefix)) {
      const v = await get(k);
      entries[k.slice(prefix.length)] = typeof v === 'string' ? { s: v } : { b: btoa(String.fromCharCode(...new Uint8Array(v))) };
    }
    const blob = new Blob([JSON.stringify({ magic: 'PLQBAK1', entries })], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Planque-${new Date().toISOString().slice(0, 10)}.planque`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const at = Date.now();
    s.index.settings.lastBackup = String(at);
    await this.saveIndex();
    return { done: true, at };
  }

  async importBackup() {
    const [file] = await pickFiles({ accept: '.planque,application/octet-stream' });
    if (!file) return { imported: false };
    let data;
    try { data = JSON.parse(await file.text()); } catch { data = null; }
    if (!data || data.magic !== 'PLQBAK1' || !data.entries?.rid || !data.entries?.rec) {
      return { imported: false, error: 'Ce fichier n’est pas une sauvegarde Planque, ou il est abîmé.' };
    }
    for (const k of await keysWithPrefix('v:')) {
      if (k.endsWith(':rid') && (await get(k)) === data.entries.rid.s) return { imported: true, already: true };
    }
    const id = hex(rand(16));
    for (const [name, v] of Object.entries(data.entries)) {
      const val = v.s !== undefined ? v.s : Uint8Array.from(atob(v.b), (c) => c.charCodeAt(0)).buffer;
      await put(`v:${id}:${name}`, val);
    }
    return { imported: true, already: false };
  }

  async rekey({ combo }) {
    this.check(combo);
    const s = this.needPersisted();
    const { kek, vaultId } = await this.derive(combo);
    if (vaultId === s.vaultId) return this.unlockState();
    if (await get(`v:${vaultId}:key`)) throw Object.assign(new Error('Cette combinaison ouvre déjà un autre coffre. Choisis-en une autre.'), { code: 'IO' });
    for (const k of await keysWithPrefix(`v:${s.vaultId}:`)) {
      await put(k.replace(`v:${s.vaultId}:`, `v:${vaultId}:`), await get(k));
      await del(k);
    }
    const raw = await crypto.subtle.exportKey('raw', s.master);
    await put(`v:${vaultId}:key`, await seal(kek, raw, `plq-key|${vaultId}`));
    return this.openWith(kek, vaultId);
  }

  // Remplit le coffre ouvert avec des photos d'exemple (aperçu navigateur uniquement).
  async seedDemo() {
    const s = this.needPersisted();
    const scenes = [
      ['Coucher de soleil', ['#FF7E5F', '#FEB47B', '#2B1B3D'], 0], ['Plage', ['#56CCF2', '#F2E3B3', '#2F80ED'], 0],
      ['Montagne', ['#A1C4FD', '#C2E9FB', '#3A4A5C'], 0], ['Forêt', ['#134E5E', '#71B280', '#0B2A22'], 1],
      ['Lac', ['#2193B0', '#6DD5ED', '#1B3B4B'], 1], ['Ville de nuit', ['#0F2027', '#2C5364', '#F2C94C'], 1],
      ['Brunch', ['#F6D365', '#FDA085', '#7A4B2A'], 2], ['Concert', ['#41295A', '#2F0743', '#FF5F6D'], 2],
      ['Anniversaire', ['#F857A6', '#FF5858', '#FFE29F'], 2], ['Neige', ['#E6DADA', '#274046', '#FFFFFF'], 3],
    ];
    const draw = (c, title) => {
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 900;
      const g = cv.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 900); grad.addColorStop(0, c[0]); grad.addColorStop(1, c[1]);
      g.fillStyle = grad; g.fillRect(0, 0, 1200, 900);
      g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(850, 300, 90, 0, Math.PI * 2); g.fill();
      g.fillStyle = c[2];
      g.beginPath(); g.moveTo(0, 900); g.lineTo(0, 620); g.lineTo(260, 430); g.lineTo(520, 640); g.lineTo(760, 470); g.lineTo(1200, 700); g.lineTo(1200, 900); g.fill();
      g.globalAlpha = .35; g.beginPath(); g.moveTo(0, 900); g.lineTo(0, 740); g.lineTo(400, 600); g.lineTo(900, 760); g.lineTo(1200, 650); g.lineTo(1200, 900); g.fill(); g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,.92)'; g.font = '600 56px -apple-system, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(title, 600, 170);
      return new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
    };
    const now = Date.now();
    const files = [];
    for (const [i, [title, colors, monthsAgo]] of scenes.entries()) {
      const blob = await draw(colors, title);
      files.push(new File([blob], `${title}.jpg`, { type: 'image/jpeg', lastModified: now - monthsAgo * 31 * 864e5 - i * 36e5 }));
    }
    files.push(new File(['Box : 3F9K-77QA-PLNQ\nCode porte : 4821\n'], 'Codes et mots de passe.txt', { type: 'text/plain', lastModified: now - 5 * 864e5 }));
    const added = await this.ingest(files);
    const byName = (n) => added.find((a) => a.name === n)?.id;
    const vac = (await this.createAlbum({ name: 'Vacances' })).album;
    const pap = (await this.createAlbum({ name: 'Papiers' })).album;
    await this.moveToAlbum({ ids: ['Plage', 'Montagne', 'Lac'].map(byName), album: vac.id });
    await this.moveToAlbum({ ids: [byName('Codes et mots de passe')], album: pap.id });
    await this.remove({ ids: [byName('Neige')] });
    s.index.opens = [now - 2 * 864e5, now - 864e5 - 3 * 36e5, now];
    await this.saveIndex();
    return this.unlockState();
  }

  unlockState() {
    const s = this.s;
    return { items: s.index.items, isNew: !s.persisted, settings: s.index.settings, albums: s.index.albums || [],
      opens: [...(s.index.opens || [])].reverse(), shared: [], invite: null, pendingKeys: 0 };
  }

  async setFaceDownLock() { return {}; }
  async setIcon() { return { ok: false }; }
  async getIcon() { return { name: 'default', supported: false }; }

  async setSetting({ key, value }) { const s = this.need(); s.index.settings[key] = value; await this.saveIndex(); return {}; }

  async destroy() {
    const s = this.need();
    if (s.persisted) await delPrefix(`v:${s.vaultId}:`);
    this.s = null;
    return {};
  }
}
