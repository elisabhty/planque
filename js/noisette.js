// Noisette — la mascotte de Planque.
// Trois expressions (yeux ouverts, endormie, contente) superposées ; l'état choisit laquelle
// est visible et quelle animation joue.
// États : sleep (dort), awake (éveillée), think (réfléchit), stash (planque), happy (contente).
// Règle de sécurité : ses réactions ne dépendent JAMAIS du coffre ouvert (vrai ou leurre).

const IMG = 'img/noisette/';

export function noisetteHTML({ state = 'sleep', size = 160, label = 'Noisette, l’écureuil de Planque' } = {}) {
  return `
<div class="noisette is-${state}" style="--nz:${size}px" role="img" aria-label="${label}">
  <div class="nz-look"><div class="nz-fig">
    <img class="nz-awake" src="${IMG}awake.webp" alt="" draggable="false" decoding="async">
    <img class="nz-sleep" src="${IMG}sleep.webp" alt="" draggable="false" decoding="async">
    <img class="nz-joy" src="${IMG}joy.webp" alt="" draggable="false" decoding="async">
  </div></div>
  <div class="nz-zzz" aria-hidden="true"><span>z</span><span>z</span><span>z</span></div>
</div>`;
}

const find = (el) => (el?.matches?.('.noisette') ? el : el?.querySelector?.('.noisette'));

/** Change l'état d'une Noisette déjà affichée. */
export function setNoisette(el, state) {
  const n = find(el);
  if (!n) return;
  n.classList.remove('is-sleep', 'is-awake', 'is-think', 'is-stash', 'is-happy');
  // relancer l'animation même si l'état ne change pas (ex. deux « contente » d'affilée)
  void n.offsetWidth;
  n.classList.add(`is-${state}`);
}

/** Noisette se penche vers un point (coordonnées écran). */
export function lookAt(el, x, y) {
  const n = find(el);
  if (!n) return;
  const r = n.getBoundingClientRect();
  const dx = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / 180));
  const dy = Math.max(-1, Math.min(1, (y - (r.top + r.height * 0.4)) / 220));
  const look = n.querySelector('.nz-look');
  look.style.transform = `translate(${(dx * 4).toFixed(1)}%, ${(dy * 2).toFixed(1)}%) rotate(${(dx * 5).toFixed(1)}deg)`;
}

export function resetLook(el) {
  const look = find(el)?.querySelector('.nz-look');
  if (look) look.style.transform = '';
}
