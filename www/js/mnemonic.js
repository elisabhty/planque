// Phrase de récupération : 128 bits ⇄ 12 mots (norme BIP39, liste française).
import { WORDS } from './words-fr.js';

export const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const INDEX = new Map(WORDS.map((w, i) => [norm(w), i]));

// SHA-256 minimal (au cas où crypto.subtle serait indisponible dans la vue web).
function sha256Fallback(bytes) {
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb,
    0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f,
    0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = bytes.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const m = new Uint8Array(total);
  m.set(bytes); m[len] = 0x80;
  const bits = len * 8;
  m[total - 4] = bits >>> 24; m[total - 3] = bits >>> 16; m[total - 2] = bits >>> 8; m[total - 1] = bits;
  const W = new Uint32Array(64);
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  H.forEach((v, i) => { out[i * 4] = v >>> 24; out[i * 4 + 1] = v >>> 16; out[i * 4 + 2] = v >>> 8; out[i * 4 + 3] = v; });
  return out;
}

async function sha256(bytes) {
  try {
    if (globalThis.crypto?.subtle) return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  } catch { /* repli */ }
  return sha256Fallback(bytes);
}

const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((b) => parseInt(b, 16)));
const toHex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');

/** 16 octets (hex) → 12 mots. */
export async function entropyToWords(hex) {
  const bytes = fromHex(hex);
  const check = (await sha256(bytes))[0] >>> 4;
  let bits = [...bytes].map((b) => b.toString(2).padStart(8, '0')).join('') + check.toString(2).padStart(4, '0');
  const words = [];
  for (let i = 0; i < 12; i++) words.push(WORDS[parseInt(bits.slice(i * 11, i * 11 + 11), 2)]);
  return words;
}

/** Texte saisi → { ok, hex } ou { ok:false, reason, unknown }. Accents et majuscules ignorés. */
export async function wordsToEntropy(text) {
  const list = norm(text).split(/[\s,;.\-]+/).filter(Boolean);
  const unknown = list.filter((w) => !INDEX.has(w));
  if (unknown.length) return { ok: false, reason: 'unknown', unknown };
  if (list.length !== 12) return { ok: false, reason: 'count', count: list.length };
  const bits = list.map((w) => INDEX.get(w).toString(2).padStart(11, '0')).join('');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  const check = parseInt(bits.slice(128), 2);
  if (((await sha256(bytes))[0] >>> 4) !== check) return { ok: false, reason: 'checksum' };
  return { ok: true, hex: toHex(bytes) };
}

/** Mots reconnus dans le texte (pour le compteur). */
export function countKnown(text) {
  return norm(text).split(/[\s,;.\-]+/).filter((w) => INDEX.has(w)).length;
}

/** Suggestions pour le mot en cours de frappe. */
export function suggest(prefix, max = 4) {
  const p = norm(prefix);
  if (p.length < 2) return [];
  const out = [];
  for (const w of WORDS) {
    if (norm(w).startsWith(p)) { out.push(w); if (out.length >= max) break; }
  }
  return out;
}

/** Quatre propositions dont la bonne, pour la vérification. */
export function choices(right, n = 4) {
  const set = new Set([right]);
  while (set.size < n) set.add(WORDS[Math.floor(Math.random() * WORDS.length)]);
  return [...set].sort(() => Math.random() - 0.5);
}
