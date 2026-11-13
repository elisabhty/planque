// Simulation du coffre pour l'aperçu dans un navigateur (développement uniquement).
// Même logique que le plugin iOS : PBKDF2 → clé d'enveloppe + localisateur, clé maîtresse
// aléatoire, AES-256-GCM, index et miniatures chiffrés, coffre vide si schéma inconnu.
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
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.s) { this.s = null; this.emit('locked', {}); }
    });
  }
  on(event, cb) { (this.listeners[event] ||= []).push(cb); return { remove: () => {} }; }
  emit(event, data) { (this.listeners[event] || []).forEach((cb) => cb(data)); }

  async pepper(create) {
    let p = await get('pepper');
    if (!p && create) { p = rand(32).buffer; await put('pepper', p); }
    return p;
  }

  async derive(pattern) {
    const pepper = await this.pepper(true);
    const pw = await crypto.subtle.importKey('raw', enc.encode(`plq1|5x5|${pattern.join('-')}`), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: pepper, iterations: ITER, hash: 'SHA-256' }, pw, 512);
    const kek = await aesKey(bits.slice(0, 32));
    const vaultId = hex(await crypto.subtle.digest('SHA-256', bits.slice(32, 64))).slice(0, 32);
    return { kek, vaultId };
  }

  check(pattern) {
    if (!Array.isArray(pattern) || pattern.length < 4 || new Set(pattern).size !== pattern.length) {
      throw Object.assign(new Error('Relie au moins 4 points.'), { code: 'BAD_PATTERN' });
    }
  }

  need() { if (!this.s) throw Object.assign(new Error('Le coffre est verrouillé.'), { code: 'LOCKED' }); return this.s; }
  needPersisted() { const s = this.need(); if (!s.persisted) throw Object.assign(new Error('Ce coffre n’est pas encore créé.'), { code: 'NOT_CREATED' }); return s; }

  async saveIndex() {
    const s = this.s;
    if (!s?.persisted) return;
    await put(`v:${s.vaultId}:index`, await seal(s.master, enc.encode(JSON.stringify(s.index)), `plq-index|${s.vaultId}`));
  }

  async status() { return { ready: true, problem: null }; }

  async unlock({ pattern }) {
    this.check(pattern);
    this.s = null;
    const { kek, vaultId } = await this.derive(pattern);
    let s = { vaultId, kek, master: await aesKey(rand(32)), persisted: false, index: { v: 1, items: [], settings: {} } };
    const wrapped = await get(`v:${vaultId}:key`);
    if (wrapped) {
      try {
        const raw = await open(kek, wrapped, `plq-key|${vaultId}`);
        const master = await aesKey(raw);
        let index = { v: 1, items: [], settings: {} };
        const ei = await get(`v:${vaultId}:index`);
        if (ei) index = JSON.parse(dec.decode(await open(master, ei, `plq-index|${vaultId}`)));
        s = { vaultId, kek, master, persisted: true, index };
      } catch { /* coffre vide, sans erreur */ }
    }
    this.s = s;
    return { items: s.index.items, isNew: !s.persisted, settings: s.index.settings };
  }

  async confirmNew({ pattern }) {
    const s = this.need();
    if (s.persisted) return { ok: true };
    try { this.check(pattern); } catch { return { ok: false }; }
    const { vaultId } = await this.derive(pattern);
    if (vaultId !== s.vaultId) return { ok: false };
    const raw = await crypto.subtle.exportKey('raw', s.master);
    await put(`v:${vaultId}:key`, await seal(s.kek, raw, `plq-key|${vaultId}`));
    s.persisted = true;
    await this.saveIndex();
    return { ok: true };
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
        size: f.size, added: Date.now(), hasThumb: !!meta.thumb,
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

  async remove({ ids }) {
    const s = this.needPersisted();
    const set = new Set(ids);
    s.index.items = s.index.items.filter((i) => !set.has(i.id));
    await this.saveIndex();
    for (const id of ids) { await del(`v:${s.vaultId}:b:${id}`); await del(`v:${s.vaultId}:t:${id}`); }
    return { items: s.index.items };
  }

  async setSetting({ key, value }) { const s = this.need(); s.index.settings[key] = value; await this.saveIndex(); return {}; }

  async destroy() {
    const s = this.need();
    if (s.persisted) await delPrefix(`v:${s.vaultId}:`);
    this.s = null;
    return {};
  }
}
