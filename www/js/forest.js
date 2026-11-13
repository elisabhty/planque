// La forêt de Noisette : 36 cachettes. L'ordre dans lequel on y cache ses noisettes est la clé.
// ⚠️ Les numéros des cachettes font partie de la clé : ne JAMAIS les renuméroter ni les réordonner
// après la mise en ligne (on peut les redessiner ou les déplacer un peu, pas changer leur id).

export const MIN_NUTS = 5;
export const MAX_NUTS = 16;

const C = {
  leaf: '#2B4A37', leafHi: '#3A6449', leafLo: '#1F3729',
  pine: '#1F3A2B', pineHi: '#2A4B39',
  bark: '#4B3222', barkLo: '#36231A', barkHi: '#62432F',
  stone: '#5C6862', stoneHi: '#7A8780', stoneLo: '#414A46',
  cream: '#F6E6CC', hole: '#160D07',
};

// --- Dessins (centrés sur 0,0, environ 44 × 44) ---------------------------------
const draw = {
  leaves: (v = 0) => {
    const [a, b, c] = v ? [C.pine, C.pineHi, '#18301F'] : [C.leaf, C.leafHi, C.leafLo];
    return `<circle cx="-11" cy="4" r="13" fill="${c}"/><circle cx="11" cy="3" r="14" fill="${a}"/>
      <circle cx="0" cy="-8" r="14" fill="${b}"/><circle cx="-4" cy="-12" r="5" fill="#fff" opacity=".06"/>
      <circle cx="6" cy="8" r="2.2" fill="#C8473B"/><circle cx="-8" cy="-2" r="1.8" fill="#C8473B"/>`;
  },
  nest: () => `<path d="M-19 0 Q0 18 19 0 Z" fill="#7A5634"/>
    <path d="M-19 0 Q0 18 19 0" fill="none" stroke="#A47A4E" stroke-width="2" stroke-dasharray="3 3"/>
    <ellipse cx="-6" cy="-1" rx="5" ry="6" fill="#DDE6E0"/><ellipse cx="5" cy="-2" rx="5" ry="6" fill="#C9D8CF"/>
    <path d="M-20 0 Q0 6 20 0" fill="none" stroke="#5E4128" stroke-width="3" stroke-linecap="round"/>`,
  birdhouse: () => `<line x1="0" y1="-38" x2="0" y2="-18" stroke="#9C8A70" stroke-width="1.4"/>
    <rect x="-13" y="-14" width="26" height="28" rx="3" fill="#8C5A35"/>
    <path d="M-17 -12 L0 -24 L17 -12 Z" fill="#5A3A22"/>
    <circle cx="0" cy="-1" r="5.5" fill="${C.hole}"/><rect x="-1.5" y="6" width="3" height="7" rx="1.5" fill="#5A3A22"/>`,
  lantern: () => `<line x1="0" y1="-64" x2="0" y2="-20" stroke="#9C8A70" stroke-width="1.4"/>
    <circle cx="0" cy="2" r="26" fill="url(#fz-glow)"/>
    <path d="M-8 -18 h16 l-3 -4 h-10 Z" fill="#2E2A26"/>
    <rect x="-9" y="-18" width="18" height="24" rx="3" fill="#FFD08A" opacity=".95"/>
    <rect x="-9" y="-18" width="18" height="24" rx="3" fill="none" stroke="#2E2A26" stroke-width="2.5"/>
    <line x1="0" y1="-18" x2="0" y2="6" stroke="#2E2A26" stroke-width="1.5"/>
    <rect x="-10" y="5" width="20" height="4" rx="2" fill="#2E2A26"/>`,
  pinecone: (hang) => `${hang ? '<line x1="0" y1="-30" x2="0" y2="-14" stroke="#4A3522" stroke-width="2"/>' : ''}
    <ellipse cx="0" cy="0" rx="9" ry="13" fill="#7E5530"/>
    <path d="M-8 -4 L0 1 L8 -4 M-8 4 L0 9 L8 4 M-6 -10 L0 -6 L6 -10" fill="none" stroke="#4E321B" stroke-width="2" stroke-linecap="round"/>`,
  hole: () => `<ellipse cx="0" cy="0" rx="14" ry="17" fill="${C.barkHi}"/>
    <ellipse cx="0" cy="1" rx="10.5" ry="13.5" fill="${C.hole}"/>
    <path d="M-9 -6 Q0 -14 9 -6" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="3"/>`,
  fungus: () => `<path d="M-16 0 Q-12 -12 4 -10 Q16 -8 16 0 Z" fill="#C99A5B"/>
    <path d="M-16 0 Q0 6 16 0" fill="none" stroke="#8E6634" stroke-width="2.5"/>
    <path d="M-10 9 Q-6 2 6 3 Q12 4 12 9 Z" fill="#B78748"/>
    <path d="M-8 -6 Q0 -9 8 -6" fill="none" stroke="#E5BE84" stroke-width="1.6" stroke-linecap="round"/>`,
  web: () => `<g fill="none" stroke="#F6EDE0" stroke-opacity=".5" stroke-width="1">
    <path d="M0 -20 V20 M-20 0 H20 M-14 -14 L14 14 M14 -14 L-14 14"/>
    <path d="M0 -7 L5 -5 L7 0 L5 5 L0 7 L-5 5 L-7 0 L-5 -5 Z"/>
    <path d="M0 -13 L9 -9 L13 0 L9 9 L0 13 L-9 9 L-13 0 L-9 -9 Z"/>
    <path d="M0 -19 L13 -13 L19 0 L13 13 L0 19 L-13 13 L-19 0 L-13 -13 Z"/></g>
    <circle cx="6" cy="4" r="2.6" fill="#1A1410"/>`,
  moon: () => `<circle cx="0" cy="0" r="30" fill="url(#fz-moon)"/>
    <circle cx="0" cy="0" r="16" fill="#F3E3C3"/><circle cx="-5" cy="-4" r="3" fill="#D9C7A4"/>
    <circle cx="6" cy="5" r="2.2" fill="#D9C7A4"/><circle cx="4" cy="-7" r="1.4" fill="#D9C7A4"/>`,
  rock: () => `<path d="M-22 12 L-16 -6 L-4 -14 L12 -10 L22 4 L18 12 Z" fill="#4E5853"/>
    <path d="M-16 -6 L-4 -14 L12 -10 L4 -2 Z" fill="#69756E"/>
    <path d="M-22 12 H18" stroke="#2C3330" stroke-width="2"/>`,
  bush: (v = 0) => `<circle cx="-12" cy="4" r="11" fill="${v ? '#2C523E' : '#2A4C39'}"/>
    <circle cx="11" cy="4" r="12" fill="${v ? '#356349' : '#325C45'}"/>
    <circle cx="0" cy="-5" r="13" fill="${v ? '#3E7055' : '#3A6A50'}"/>
    ${v ? '<circle cx="-6" cy="-4" r="2.4" fill="#5C82D6"/><circle cx="7" cy="0" r="2.4" fill="#5C82D6"/><circle cx="1" cy="-11" r="2.4" fill="#5C82D6"/>'
        : '<circle cx="-5" cy="-6" r="1.6" fill="#F6E6CC" opacity=".7"/><circle cx="8" cy="2" r="1.6" fill="#F6E6CC" opacity=".7"/>'}`,
  stump: () => `<path d="M-15 -6 V12 Q0 18 15 12 V-6 Z" fill="#6E4A30"/>
    <path d="M-15 12 L-20 16 M15 12 L20 16" stroke="#6E4A30" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="0" cy="-6" rx="15" ry="6" fill="#B08257"/>
    <ellipse cx="0" cy="-6" rx="9" ry="3.5" fill="none" stroke="#8A5F3A" stroke-width="1.4"/>
    <ellipse cx="0" cy="-6" rx="4" ry="1.6" fill="none" stroke="#8A5F3A" stroke-width="1.2"/>`,
  fern: () => `<g fill="none" stroke="#4A8A60" stroke-width="2.4" stroke-linecap="round">
    <path d="M0 16 Q-2 -2 -14 -14"/><path d="M0 16 Q2 -4 14 -16"/><path d="M0 16 Q0 -6 0 -20"/></g>
    <g fill="#4A8A60"><ellipse cx="-8" cy="-6" rx="5" ry="2" transform="rotate(-40 -8 -6)"/>
    <ellipse cx="9" cy="-8" rx="5" ry="2" transform="rotate(40 9 -8)"/><ellipse cx="-3" cy="-12" rx="2" ry="5"/>
    <ellipse cx="4" cy="-2" rx="5" ry="2" transform="rotate(30 4 -2)"/><ellipse cx="-5" cy="2" rx="5" ry="2" transform="rotate(-30 -5 2)"/></g>`,
  root: () => `<path d="M-14 12 Q-10 -2 2 -2 Q12 -2 14 12 Z" fill="${C.hole}"/>
    <path d="M-24 12 Q-14 -18 4 -10 Q18 -4 24 12" fill="none" stroke="#7A5236" stroke-width="9" stroke-linecap="round"/>
    <path d="M-18 2 Q-10 -10 2 -7" fill="none" stroke="#9A6B47" stroke-width="2.5" stroke-linecap="round"/>`,
  stone: (v = 0) => v === 1
    ? `<ellipse cx="0" cy="3" rx="16" ry="11" fill="${C.stone}"/><ellipse cx="-4" cy="-1" rx="8" ry="4" fill="${C.stoneHi}" opacity=".7"/>`
    : `<path d="M-20 8 Q-18 -4 -4 -6 Q14 -8 20 6 Q0 14 -20 8 Z" fill="${C.stone}"/>
       <path d="M-14 -2 Q-2 -6 10 -4" fill="none" stroke="${C.stoneHi}" stroke-width="2.5" stroke-linecap="round"/>
       <path d="M-6 4 Q-2 10 4 5" fill="none" stroke="#6D9A6A" stroke-width="2" opacity=".6"/>`,
  mushroom: (v = 0) => v
    ? `<rect x="-4" y="-2" width="8" height="15" rx="4" fill="#EADBC0"/>
       <path d="M-15 0 Q-14 -14 0 -15 Q14 -14 15 0 Z" fill="#9A6A3E"/>
       <rect x="9" y="4" width="5" height="9" rx="2.5" fill="#EADBC0"/><path d="M6 6 Q11 -2 17 6 Z" fill="#9A6A3E"/>`
    : `<rect x="-4" y="-2" width="8" height="15" rx="4" fill="#EADBC0"/>
       <path d="M-16 1 Q-15 -16 0 -17 Q15 -16 16 1 Z" fill="#C9473B"/>
       <circle cx="-7" cy="-7" r="2.6" fill="${C.cream}"/><circle cx="4" cy="-11" r="2" fill="${C.cream}"/><circle cx="8" cy="-3" r="2.2" fill="${C.cream}"/>`,
  burrow: () => `<path d="M-22 12 Q-20 -12 0 -13 Q20 -12 22 12 Z" fill="#3A3024"/>
    <path d="M-12 12 Q-11 -4 0 -4 Q11 -4 12 12 Z" fill="${C.hole}"/>
    <circle cx="-15" cy="10" r="2" fill="#5C4C38"/><circle cx="16" cy="9" r="2.4" fill="#5C4C38"/>`,
  log: () => `<rect x="-20" y="-8" width="36" height="17" rx="4" fill="#6E4A30"/>
    <path d="M-16 -3 H10 M-12 4 H6" stroke="#563823" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="16" cy="0.5" rx="6" ry="8.5" fill="#B08257"/>
    <ellipse cx="16" cy="0.5" rx="3" ry="4.5" fill="none" stroke="#8A5F3A" stroke-width="1.3"/>
    <path d="M-6 -8 Q-4 -15 2 -14" fill="none" stroke="#4A8A60" stroke-width="2" stroke-linecap="round"/>`,
  leafpile: () => `<path d="M-20 10 Q-14 -10 0 -12 Q14 -10 20 10 Z" fill="#9C5427"/>
    <ellipse cx="-9" cy="-1" rx="7" ry="3.5" fill="#D9944F" transform="rotate(-25 -9 -1)"/>
    <ellipse cx="6" cy="-6" rx="7" ry="3.5" fill="#C8743A" transform="rotate(20 6 -6)"/>
    <ellipse cx="9" cy="4" rx="7" ry="3.5" fill="#E0A55E" transform="rotate(-10 9 4)"/>
    <ellipse cx="-4" cy="6" rx="6" ry="3" fill="#B5632F" transform="rotate(15 -4 6)"/>`,
  flower: (color) => `<path d="M0 16 V0" stroke="#4A8A60" stroke-width="2.4"/>
    <ellipse cx="-5" cy="10" rx="5" ry="2.2" fill="#4A8A60" transform="rotate(-30 -5 10)"/>
    ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-7" rx="4.6" ry="7" fill="${color}" transform="rotate(${a} 0 0) translate(0 0)"/>`).join('')}
    <circle cx="0" cy="0" r="4" fill="#E0954F"/>`,
  puddle: () => `<ellipse cx="0" cy="2" rx="22" ry="9" fill="#24404A"/>
    <ellipse cx="0" cy="2" rx="22" ry="9" fill="none" stroke="#3C6270" stroke-width="1.5"/>
    <ellipse cx="7" cy="1" rx="5" ry="2.4" fill="#F3E3C3" opacity=".75"/>
    <path d="M-12 3 Q-6 0 0 3" fill="none" stroke="#6E95A3" stroke-width="1.4" opacity=".7"/>`,
  boot: () => `<path d="M-8 -16 H6 V4 Q14 4 16 9 Q16 14 10 14 H-8 Z" fill="#E8B84A"/>
    <rect x="-10" y="-18" width="18" height="5" rx="2" fill="#C9962E"/>
    <path d="M-8 12 H16" stroke="#7A5A1E" stroke-width="3" stroke-linecap="round"/>`,
  bucket: () => `<path d="M-13 -9 L-10 14 H10 L13 -9 Z" fill="#8E9A97"/>
    <ellipse cx="0" cy="-9" rx="13" ry="4" fill="#5E6966"/>
    <path d="M-11.5 2 H11.5" stroke="#6C7774" stroke-width="2.5"/>
    <path d="M-13 -9 Q0 -26 13 -9" fill="none" stroke="#6C7774" stroke-width="1.8"/>`,
  sign: () => `<rect x="-2.5" y="-6" width="5" height="22" fill="#6E4A30"/>
    <path d="M-17 -18 H12 L18 -12 L12 -6 H-17 Z" fill="#8A5C36"/>
    <path d="M-12 -12 H8" stroke="#5A3A22" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="3 2.5"/>`,
};

// --- Les 36 cachettes (id = rang dans ce tableau) ------------------------------------
export const SPOTS = [
  { t: 'leaves', x: 32, y: 52, n: 'le feuillage de gauche' },
  { t: 'leaves', x: 112, y: 22, n: 'le haut du chêne' },
  { t: 'leaves', x: 202, y: 70, n: 'le bout de la branche' },
  { t: 'leaves', v: 1, x: 322, y: 30, n: 'la cime du sapin' },
  { t: 'nest', x: 290, y: 98, n: 'le nid' },
  { t: 'leaves', v: 1, x: 346, y: 152, n: 'la branche droite du sapin' },
  { t: 'pinecone', v: 1, x: 268, y: 152, n: 'la pomme de pin suspendue' },
  { t: 'birdhouse', x: 162, y: 146, n: 'le nichoir' },
  { t: 'lantern', x: 222, y: 180, n: 'la lanterne' },
  { t: 'hole', x: 64, y: 140, n: 'le trou du haut du chêne' },
  { t: 'fungus', x: 102, y: 202, n: 'le champignon du chêne' },
  { t: 'web', x: 155, y: 226, n: 'la toile d’araignée' },
  { t: 'hole', x: 56, y: 252, n: 'le trou du bas du chêne' },
  { t: 'hole', x: 318, y: 238, n: 'le trou du sapin' },
  { t: 'bush', x: 140, y: 298, n: 'le buisson de gauche' },
  { t: 'stump', x: 206, y: 312, n: 'la souche' },
  { t: 'bush', v: 1, x: 266, y: 292, n: 'le buisson aux baies' },
  { t: 'fern', x: 340, y: 316, n: 'la fougère du sapin' },
  { t: 'root', x: 96, y: 340, n: 'la racine' },
  { t: 'stone', x: 30, y: 384, n: 'la pierre plate' },
  { t: 'mushroom', x: 160, y: 372, n: 'le champignon rouge' },
  { t: 'burrow', x: 234, y: 372, n: 'le terrier' },
  { t: 'log', x: 306, y: 382, n: 'la bûche' },
  { t: 'leafpile', x: 70, y: 428, n: 'le tas de feuilles' },
  { t: 'flower', v: '#E9A1C3', x: 136, y: 428, n: 'la fleur rose' },
  { t: 'puddle', x: 202, y: 432, n: 'la flaque' },
  { t: 'flower', v: '#F1CF63', x: 268, y: 426, n: 'la fleur jaune' },
  { t: 'boot', x: 336, y: 430, n: 'la botte' },
  { t: 'mushroom', v: 1, x: 26, y: 476, n: 'les champignons bruns' },
  { t: 'stone', v: 1, x: 90, y: 480, n: 'le galet' },
  { t: 'sign', x: 156, y: 478, n: 'le panneau' },
  { t: 'pinecone', x: 218, y: 482, n: 'la pomme de pin au sol' },
  { t: 'bucket', x: 280, y: 476, n: 'le seau' },
  { t: 'fern', x: 344, y: 482, n: 'la fougère du bas' },
  { t: 'moon', x: 252, y: 34, n: 'la lune' },
  { t: 'rock', x: 214, y: 250, n: 'le rocher' },
];

const NUT = `<g class="fz-nut"><ellipse cx="0" cy="2" rx="6" ry="7" fill="#A8692F"/>
  <path d="M-6 -1 C-5 -6 5 -6 6 -1 C3 -2.5 -3 -2.5 -6 -1 Z" fill="#5E3A1C"/></g>`;

function background() {
  const stars = [[150, 18], [176, 46], [228, 10], [276, 70], [196, 120], [240, 96], [136, 92], [300, 136], [182, 196]]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1 : 1.5}" fill="#F6EDE0" opacity="${i % 2 ? .35 : .6}"/>`).join('');
  return `
  <defs>
    <linearGradient id="fz-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1B2C29"/><stop offset=".55" stop-color="#172623"/><stop offset="1" stop-color="#14221F"/>
    </linearGradient>
    <linearGradient id="fz-ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1D2E27"/><stop offset="1" stop-color="#13201E"/>
    </linearGradient>
    <radialGradient id="fz-moon"><stop offset="0" stop-color="#FFE2AA" stop-opacity=".35"/><stop offset="1" stop-color="#FFE2AA" stop-opacity="0"/></radialGradient>
    <radialGradient id="fz-glow"><stop offset="0" stop-color="#FFC777" stop-opacity=".55"/><stop offset="1" stop-color="#FFC777" stop-opacity="0"/></radialGradient>
    <radialGradient id="fz-pool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFC777" stop-opacity=".12"/><stop offset="1" stop-color="#FFC777" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="360" height="510" fill="url(#fz-sky)"/>
  ${stars}
  <path d="M110 300 Q150 230 200 238 Q250 228 300 280 L300 340 L110 340 Z" fill="#182925"/>
  <g fill="#1A2B26">
    <path d="M128 300 L146 222 L164 300 Z"/><path d="M168 300 L184 240 L200 300 Z"/>
    <path d="M232 296 L252 214 L272 296 Z"/><path d="M196 300 L208 256 L220 300 Z"/>
  </g>
  <ellipse cx="222" cy="300" rx="90" ry="60" fill="url(#fz-pool)"/>
  <path d="M0 340 Q90 318 180 330 Q270 342 360 322 L360 510 L0 510 Z" fill="url(#fz-ground)"/>
  <path d="M150 510 Q170 440 196 400 Q214 372 204 344 L222 344 Q236 376 222 404 Q200 446 214 510 Z" fill="#26342A" opacity=".8"/>

  <!-- Sapin -->
  <rect x="312" y="60" width="12" height="290" fill="#3B2618"/>
  <g fill="${C.pine}">
    <path d="M318 6 L346 60 L290 60 Z"/><path d="M318 40 L354 110 L282 110 Z"/>
    <path d="M318 90 L362 176 L274 176 Z"/><path d="M318 150 L366 248 L270 248 Z" opacity=".95"/>
  </g>
  <g fill="${C.pineHi}" opacity=".5">
    <path d="M318 40 L330 110 L306 110 Z"/><path d="M318 90 L334 176 L302 176 Z"/>
  </g>

  <!-- Chêne -->
  <path d="M24 350 Q34 300 30 220 Q26 140 40 70 L92 70 Q100 150 96 230 Q94 300 116 350 Z" fill="${C.bark}"/>
  <path d="M40 330 Q46 250 42 160 M78 330 Q84 240 80 150" stroke="${C.barkLo}" stroke-width="3" fill="none" opacity=".6"/>
  <path d="M90 118 Q150 92 236 104" stroke="${C.bark}" stroke-width="11" fill="none" stroke-linecap="round"/>
  <path d="M150 100 Q170 78 196 72" stroke="${C.bark}" stroke-width="6" fill="none" stroke-linecap="round"/>
  <g>
    <circle cx="20" cy="40" r="44" fill="${C.leafLo}"/><circle cx="80" cy="20" r="48" fill="${C.leaf}"/>
    <circle cx="140" cy="38" r="40" fill="${C.leafLo}"/><circle cx="60" cy="70" r="34" fill="${C.leaf}"/>
    <circle cx="180" cy="62" r="28" fill="${C.leaf}"/><circle cx="104" cy="66" r="26" fill="${C.leafHi}" opacity=".6"/>
  </g>
  <path d="M10 352 Q24 340 30 350 M110 352 Q118 340 128 350" stroke="${C.bark}" stroke-width="8" fill="none" stroke-linecap="round"/>
  <g stroke="#2E4A36" stroke-width="2" stroke-linecap="round">
    <path d="M60 470 l-3 -8 M64 470 l1 -9 M68 470 l4 -7"/><path d="M250 506 l-3 -8 M254 506 l1 -9"/>
    <path d="M120 404 l-3 -7 M124 404 l2 -8"/><path d="M300 452 l-2 -8 M304 452 l3 -7"/>
  </g>`;
}

/** Petite illustration isolée (pour les explications). */
export function miniSVG(type, v) {
  const art = draw[type] ? draw[type](v) : '';
  return `<svg viewBox="-26 -30 52 56" aria-hidden="true"><defs>
    <radialGradient id="fz-glow"><stop offset="0" stop-color="#FFC777" stop-opacity=".55"/><stop offset="1" stop-color="#FFC777" stop-opacity="0"/></radialGradient></defs>
    <g transform="${type === 'lantern' ? 'translate(0 8)' : ''}">${art}</g></svg>`;
}

export function forestSVG() {
  const spots = SPOTS.map((s, id) => {
    const art = draw[s.t](s.v);
    return `<g class="fz-spot" data-id="${id}" transform="translate(${s.x} ${s.y})" role="button" aria-label="${s.n}">
      <circle class="fz-hit" r="23" fill="transparent"/>
      <g class="fz-art">${art}</g>
      <circle class="fz-ring" r="21" fill="none"/>
      ${NUT}
    </g>`;
  }).join('');
  return `<svg class="forest" viewBox="0 0 360 510" preserveAspectRatio="xMidYMid meet" aria-label="La forêt de Noisette">${background()}${spots}</svg>`;
}

/** Forêt interactive : chaque toucher cache une noisette. */
export class Forest {
  constructor(host, { onNut, onStart } = {}) {
    this.host = host;
    this.cb = { onNut, onStart };
    this.seq = [];
    this.locked = false;
    host.classList.add('forest-wrap');
    host.innerHTML = forestSVG();
    host.addEventListener('pointerdown', (e) => {
      const spot = e.target.closest('.fz-spot');
      if (!spot || this.locked) return;
      e.preventDefault();
      if (this.seq.length >= MAX_NUTS) return;
      if (!this.seq.length) this.cb.onStart?.();
      const id = +spot.dataset.id;
      this.seq.push(id);
      spot.classList.remove('tap');
      void spot.getBoundingClientRect();
      spot.classList.add('tap');
      const r = spot.getBoundingClientRect();
      this.cb.onNut?.(id, this.seq.length, r.left + r.width / 2, r.top + r.height / 2);
    });
  }

  get sequence() { return [...this.seq]; }
  undo() { this.seq.pop(); return this.seq.length; }
  clear() {
    this.seq = [];
    this.host.querySelectorAll('.fz-spot.tap').forEach((s) => s.classList.remove('tap'));
  }
  busy(on) { this.locked = !!on; this.host.classList.toggle('busy', !!on); }
}

/** Solidité estimée d'un parcours, pour les conseils de Noisette. */
export function strength(seq) {
  const n = seq.length;
  if (n < MIN_NUTS) return { level: 0, text: n ? `Encore ${MIN_NUTS - n} noisette${MIN_NUTS - n > 1 ? 's' : ''}…` : 'Touche une cachette pour commencer.' };
  const distinct = new Set(seq).size;
  let doubles = 0;
  for (let i = 1; i < n; i++) if (seq[i] === seq[i - 1]) doubles++;
  const score = distinct + 0.5 * (n - distinct) - doubles;
  if (score < 5.5) return { level: 1, text: 'Un peu facile, ça. Varie tes cachettes.' };
  if (score < 7) return { level: 2, text: 'Ça tient. Une ou deux de plus ?' };
  if (score < 9) return { level: 3, text: 'Solide ! Personne ne devinera.' };
  return { level: 4, text: 'Imprenable. Bien joué !' };
}
