// Le cadran de coffre-fort : 100 crans (0 à 99). On tourne jusqu'au nombre, on touche le centre
// pour le valider. 4 nombres = la combinaison (100 millions de possibilités).

export const COMBO_LEN = 4;
const STEP = 3.6; // degrés par cran
const mod = (n, m) => ((n % m) + m) % m;
const pad = (n) => String(n).padStart(2, '0');

/** Refuse les combinaisons trop faciles à deviner. Renvoie un message, ou null. */
export function weakCombo(seq) {
  if (new Set(seq).size === 1) return 'Quatre fois le même nombre, c’est trop facile à deviner.';
  const d = seq.slice(1).map((n, i) => n - seq[i]);
  if (d.every((x) => x === d[0]) && Math.abs(d[0]) <= 10) return 'Une suite régulière, c’est trop facile à deviner.';
  if (new Set(seq).size === 2 && seq[0] === seq[2] && seq[1] === seq[3]) return 'Un motif qui se répète, c’est trop facile à deviner.';
  return null;
}

let uid = 0;

/** Le dessin du cadran (SVG). `interactive` ajoute le repère et laisse la place au bouton central. */
export function dialSVG({ interactive = true } = {}) {
  const id = `dl${++uid}`;
  let ticks = '';
  for (let i = 0; i < 100; i++) {
    const long = i % 10 === 0;
    const mid = i % 5 === 0;
    const len = long ? 15 : mid ? 10 : 6;
    ticks += `<line x1="0" y1="-129" x2="0" y2="${-129 + len}" transform="rotate(${(i * STEP).toFixed(1)})" class="${long ? 'tk-l' : mid ? 'tk-m' : 'tk-s'}"/>`;
  }
  let nums = '';
  for (let i = 0; i < 100; i += 10) {
    nums += `<text transform="rotate(${(i * STEP).toFixed(1)}) translate(0 -97)" class="dn">${i}</text>`;
  }
  let grip = '';
  for (let i = 0; i < 48; i++) grip += `<line x1="0" y1="-146" x2="0" y2="-140" transform="rotate(${(i * 7.5).toFixed(1)})"/>`;
  return `
<svg class="dial-svg" viewBox="-150 -150 300 300" aria-hidden="true">
  <defs>
    <radialGradient id="${id}-bz" cx="35%" cy="25%" r="85%">
      <stop offset="0" stop-color="#5A5A5F"/><stop offset=".55" stop-color="#2A2A2D"/><stop offset="1" stop-color="#121214"/>
    </radialGradient>
    <radialGradient id="${id}-dk" cx="40%" cy="30%" r="80%">
      <stop offset="0" stop-color="#2E2E31"/><stop offset=".7" stop-color="#1A1A1C"/><stop offset="1" stop-color="#0E0E0F"/>
    </radialGradient>
    <linearGradient id="${id}-sh" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <circle r="149" fill="url(#${id}-bz)"/>
  <g class="grip">${grip}</g>
  <circle r="138" fill="#0A0A0B"/>
  <g class="dial-disc">
    <circle r="134" fill="url(#${id}-dk)"/>
    <g class="ticks">${ticks}</g>
    <g class="nums">${nums}</g>
  </g>
  <circle r="134" fill="url(#${id}-sh)" pointer-events="none"/>
  ${interactive ? '<path class="dial-marker" d="M0 -131 L-8 -146 L8 -146 Z"/>' : ''}
  <circle r="66" class="hub"/>
</svg>`;
}

export class Dial {
  constructor(el, { onStart, onTick, onNumber } = {}) {
    this.el = el;
    this.cb = { onStart, onTick, onNumber };
    this.seq = [];
    this.rot = 0;
    this.current = 0;
    this.locked = false;
    this.started = false;
    el.innerHTML = `
      <div class="dial" tabindex="0" role="slider" aria-label="Cadran du coffre" aria-valuemin="0" aria-valuemax="99" aria-valuenow="0">
        ${dialSVG()}
        <button class="dial-knob" type="button" aria-label="Valider ce nombre"><b>00</b><span>Valider</span></button>
      </div>`;
    this.root = el.querySelector('.dial');
    this.disc = el.querySelector('.dial-disc');
    this.knob = el.querySelector('.dial-knob');
    this.readout = this.knob.querySelector('b');
    this.bind();
  }

  get sequence() { return [...this.seq]; }

  clear() {
    this.seq = [];
    this.started = false;
  }

  busy(on) {
    this.locked = on;
    this.root.classList.toggle('busy', on);
  }

  /** Petite animation d'ouverture (« clac »). */
  open() {
    this.root.classList.remove('opened');
    void this.root.offsetWidth;
    this.root.classList.add('opened');
    setTimeout(() => this.root.classList.remove('opened'), 900);
  }

  shake() {
    this.root.classList.remove('shake');
    void this.root.offsetWidth;
    this.root.classList.add('shake');
  }

  setRotation(deg, animate = false) {
    this.rot = deg;
    this.disc.style.transition = animate ? 'transform .25s cubic-bezier(.2,.8,.2,1)' : 'none';
    this.disc.style.transform = `rotate(${deg}deg)`;
    const n = mod(Math.round(-deg / STEP), 100);
    if (n !== this.current) {
      this.current = n;
      this.readout.textContent = pad(n);
      this.root.setAttribute('aria-valuenow', n);
      this.cb.onTick?.(n);
    }
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.cb.onStart?.();
  }

  commit() {
    if (this.locked || this.seq.length >= COMBO_LEN) return;
    this.begin();
    this.seq.push(this.current);
    this.knob.classList.remove('pulse');
    void this.knob.offsetWidth;
    this.knob.classList.add('pulse');
    this.cb.onNumber?.(this.current, this.seq.length);
  }

  bind() {
    const r = this.root;
    let last = null;
    let moved = 0;
    const angle = (e) => {
      const b = r.getBoundingClientRect();
      return Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180 / Math.PI;
    };
    r.addEventListener('pointerdown', (e) => {
      if (this.locked || e.target.closest('.dial-knob')) return;
      last = angle(e);
      moved = 0;
      r.setPointerCapture(e.pointerId);
      r.classList.add('turning');
      this.begin();
    });
    r.addEventListener('pointermove', (e) => {
      if (last === null) return;
      const a = angle(e);
      let d = a - last;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      last = a;
      moved += Math.abs(d);
      this.setRotation(this.rot + d);
    });
    const end = () => {
      if (last === null) return;
      last = null;
      r.classList.remove('turning');
      this.setRotation(-this.current * STEP + Math.round((this.rot + this.current * STEP) / 360) * 360, true);
    };
    r.addEventListener('pointerup', end);
    r.addEventListener('pointercancel', end);
    this.knob.addEventListener('click', (e) => { e.stopPropagation(); this.commit(); });
    r.addEventListener('keydown', (e) => {
      if (this.locked) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); this.begin(); this.setRotation(this.rot - STEP, true); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); this.begin(); this.setRotation(this.rot + STEP, true); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.commit(); }
    });
    r.addEventListener('wheel', (e) => {
      if (this.locked) return;
      e.preventDefault();
      this.begin();
      this.setRotation(this.rot + (e.deltaY > 0 ? STEP : -STEP), true);
    }, { passive: false });
  }
}
