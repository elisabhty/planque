// Noisette — la mascotte de Planque (écureuil original, SVG animé).
// États : sleep (dort), awake (éveillée), think (réfléchit), stash (planque), happy (contente).
// Règle de sécurité : ses réactions ne dépendent JAMAIS du coffre ouvert (vrai ou leurre).

let uid = 0;

export function noisetteSVG({ state = 'sleep', size = 180, label = 'Noisette, l’écureuil de Planque' } = {}) {
  const id = `nz${++uid}`;
  return `
<svg class="noisette is-${state}" viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="${label}">
  <defs>
    <linearGradient id="${id}-tail" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#E39552"/>
      <stop offset="1" stop-color="#A3592A"/>
    </linearGradient>
    <radialGradient id="${id}-head" cx=".42" cy=".38" r=".75">
      <stop offset="0" stop-color="#DE8A4B"/>
      <stop offset="1" stop-color="#BF6A32"/>
    </radialGradient>
    <radialGradient id="${id}-shadow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#000" stop-opacity=".35"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <ellipse class="nz-shadow" cx="100" cy="190" rx="62" ry="8" fill="url(#${id}-shadow)"/>

  <g class="nz-tail">
    <path d="M112 176 C150 182 186 160 186 118 C186 86 162 76 164 52 C166 36 180 30 188 40
             C192 20 170 8 152 18 C130 30 132 60 140 86 C148 112 138 140 106 152 Z"
          fill="url(#${id}-tail)"/>
    <path d="M150 168 C172 156 178 132 172 108 C166 86 152 74 154 52 C156 40 166 32 176 34"
          fill="none" stroke="#F6E6CC" stroke-opacity=".28" stroke-width="5" stroke-linecap="round"/>
  </g>

  <g class="nz-body">
    <ellipse cx="98" cy="150" rx="41" ry="37" fill="#C46E35"/>
    <ellipse cx="98" cy="157" rx="25" ry="27" fill="#F6E6CC"/>
    <ellipse cx="76" cy="184" rx="15" ry="7" fill="#A3592A"/>
    <ellipse cx="120" cy="184" rx="15" ry="7" fill="#A3592A"/>

    <g class="nz-head">
      <g class="nz-ear nz-ear-l">
        <path d="M66 74 C58 58 56 42 60 30 C70 36 80 48 86 62 Z" fill="#C46E35"/>
        <path d="M68 66 C64 56 63 46 65 39 C71 44 76 52 79 60 Z" fill="#E9A08A" opacity=".8"/>
        <path d="M59 33 C55 25 56 17 61 11 C61 18 64 25 67 31 Z" fill="#A3592A"/>
      </g>
      <g class="nz-ear nz-ear-r">
        <path d="M130 74 C138 58 140 42 136 30 C126 36 116 48 110 62 Z" fill="#C46E35"/>
        <path d="M128 66 C132 56 133 46 131 39 C125 44 120 52 117 60 Z" fill="#E9A08A" opacity=".8"/>
        <path d="M137 33 C141 25 140 17 135 11 C135 18 132 25 129 31 Z" fill="#A3592A"/>
      </g>

      <ellipse cx="98" cy="93" rx="43" ry="37" fill="url(#${id}-head)"/>
      <ellipse class="nz-pouch nz-pouch-l" cx="68" cy="108" rx="14" ry="11" fill="#D27D40"/>
      <ellipse class="nz-pouch nz-pouch-r" cx="128" cy="108" rx="14" ry="11" fill="#D27D40"/>
      <ellipse cx="98" cy="108" rx="23" ry="15" fill="#F6E6CC"/>
      <ellipse cx="74" cy="104" rx="7.5" ry="4.5" fill="#E8907A" opacity=".55"/>
      <ellipse cx="122" cy="104" rx="7.5" ry="4.5" fill="#E8907A" opacity=".55"/>

      <g class="nz-eyes">
        <g class="nz-eye"><g class="nz-look">
          <ellipse cx="82" cy="91" rx="7.5" ry="8.5" fill="#24170F"/>
          <circle cx="79.6" cy="87.8" r="2.7" fill="#fff"/>
          <circle cx="84.5" cy="94" r="1.1" fill="#fff" opacity=".7"/>
        </g></g>
        <g class="nz-eye"><g class="nz-look">
          <ellipse cx="114" cy="91" rx="7.5" ry="8.5" fill="#24170F"/>
          <circle cx="111.6" cy="87.8" r="2.7" fill="#fff"/>
          <circle cx="116.5" cy="94" r="1.1" fill="#fff" opacity=".7"/>
        </g></g>
      </g>
      <g class="nz-lids" fill="none" stroke="#24170F" stroke-width="3" stroke-linecap="round">
        <path d="M74 92 Q82 98 90 92"/>
        <path d="M106 92 Q114 98 122 92"/>
      </g>
      <g class="nz-joy" fill="none" stroke="#24170F" stroke-width="3.2" stroke-linecap="round">
        <path d="M75 94 Q82 85 89 94"/>
        <path d="M107 94 Q114 85 121 94"/>
      </g>

      <path d="M93 101 Q98 98 103 101 Q101 106 98 106.5 Q95 106 93 101 Z" fill="#4A2414"/>
      <path class="nz-mouth" d="M92 111 Q95 114 98 111 Q101 114 104 111" fill="none" stroke="#4A2414" stroke-width="2" stroke-linecap="round"/>
    </g>
    <g class="nz-nut">
      <ellipse cx="98" cy="137" rx="9.5" ry="11" fill="#A8692F"/>
      <path d="M88.5 132 C90 124 106 124 107.5 132 C102 129.5 94 129.5 88.5 132 Z" fill="#5E3A1C"/>
      <path d="M98 124 l1.5 -4" stroke="#5E3A1C" stroke-width="2" stroke-linecap="round"/>
      <ellipse cx="94.5" cy="139" rx="2.2" ry="4" fill="#fff" opacity=".18"/>
    </g>
    <ellipse class="nz-paw" cx="86" cy="147" rx="8.5" ry="6.5" fill="#A3592A"/>
    <ellipse class="nz-paw" cx="110" cy="147" rx="8.5" ry="6.5" fill="#A3592A"/>

  </g>

  <g class="nz-zzz" fill="#F6E6CC" font-family="ui-rounded, -apple-system, system-ui" font-weight="800">
    <text x="140" y="62" font-size="14">z</text>
    <text x="152" y="46" font-size="18">z</text>
    <text x="166" y="28" font-size="22">z</text>
  </g>
</svg>`;
}

/** Change l'état d'une Noisette déjà affichée. */
export function setNoisette(el, state) {
  const svg = el?.matches?.('svg.noisette') ? el : el?.querySelector?.('svg.noisette');
  if (!svg) return;
  svg.classList.remove('is-sleep', 'is-awake', 'is-think', 'is-stash', 'is-happy');
  svg.classList.add(`is-${state}`);
}

/** Les yeux de Noisette suivent un point (coordonnées écran). */
export function lookAt(el, x, y) {
  const svg = el?.matches?.('svg.noisette') ? el : el?.querySelector?.('svg.noisette');
  if (!svg) return;
  const r = svg.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height * 0.45;
  const dx = Math.max(-1, Math.min(1, (x - cx) / 160));
  const dy = Math.max(-1, Math.min(1, (y - cy) / 160));
  svg.querySelectorAll('.nz-look').forEach((g) => {
    g.style.transform = `translate(${(dx * 2.6).toFixed(2)}px, ${(dy * 2.4).toFixed(2)}px)`;
  });
}

export function resetLook(el) {
  const svg = el?.matches?.('svg.noisette') ? el : el?.querySelector?.('svg.noisette');
  svg?.querySelectorAll('.nz-look').forEach((g) => { g.style.transform = ''; });
}
