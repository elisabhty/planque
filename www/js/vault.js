// Pont vers le coffre : plugin natif sur iPhone, simulation chiffrée dans le navigateur (aperçu).
import { WebVault } from './vault-web.js';

const C = window.Capacitor;
export const isNative = !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform() && C.nativePromise);

const METHODS = ['status', 'unlock', 'confirmNew', 'lock', 'uncover', 'thumbs', 'photo', 'openItem',
  'importPhotos', 'importCamera', 'importFiles', 'deleteOriginals', 'share', 'remove', 'setSetting', 'destroy',
  'recoverStart', 'recoverFinish', 'newRecovery', 'biometry', 'authenticate',
  'restore', 'createAlbum', 'renameAlbum', 'deleteAlbum', 'moveToAlbum', 'exportToPhotos',
  'exportBackup', 'importBackup', 'setFaceDownLock', 'setIcon', 'getIcon', 'rekey'];

function nativeVault() {
  const api = {};
  for (const m of METHODS) api[m] = (opts = {}) => C.nativePromise('Vault', m, opts);
  api.on = (event, cb) => C.addListener('Vault', event, cb);
  return api;
}

export const Vault = isNative ? nativeVault() : new WebVault();

export function haptic(kind = 'light') {
  if (!isNative) return;
  try {
    if (kind === 'success' || kind === 'warning' || kind === 'error') {
      C.nativePromise('Haptics', 'notification', { type: kind.toUpperCase() }).catch(() => {});
    } else if (kind === 'select') {
      C.nativePromise('Haptics', 'selectionChanged', {}).catch(() => {});
    } else {
      C.nativePromise('Haptics', 'impact', { style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' }).catch(() => {});
    }
  } catch { /* pas de retour haptique : on continue */ }
}
