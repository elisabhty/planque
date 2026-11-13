// Grille de schéma 5×5 (comme Vaultaire, mais avec Noisette qui suit le doigt).
// Les points traversés en ligne droite sont ajoutés automatiquement.

const NS = 'http://www.w3.org/2000/svg';
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

export class PatternPad {
  constructor(host, { size = 5, onStart, onPoint, onMove, onEnd } = {}) {
    this.host = host;
    this.size = size;
    this.cb = { onStart, onPoint, onMove, onEnd };
    this.points = [];
    this.active = false;
    this.render();
    this.bind();
  }

  render() {
    const n = this.size;
    const step = 100 / n;
    this.host.classList.add('pattern-wrap');
    this.host.innerHTML = '';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    this.line = document.createElementNS(NS, 'polyline');
    this.line.setAttribute('class', 'pattern-line');
    this.line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(this.line);
    this.dots = [];
    this.halos = [];
    for (let i = 0; i < n * n; i++) {
      const cx = (i % n + 0.5) * step;
      const cy = (Math.floor(i / n) + 0.5) * step;
      const halo = document.createElementNS(NS, 'circle');
      halo.setAttribute('class', 'pattern-halo');
      halo.setAttribute('cx', cx); halo.setAttribute('cy', cy); halo.setAttribute('r', 3);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', 'pattern-dot');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', 1.9);
      svg.appendChild(halo); svg.appendChild(dot);
      this.halos.push(halo); this.dots.push(dot);
    }
    this.svg = svg;
    this.host.appendChild(svg);
    this.host.setAttribute('role', 'application');
    this.host.setAttribute('aria-label', 'Grille de schéma : relie au moins 4 points');
  }

  center(i) {
    const step = 100 / this.size;
    return [(i % this.size + 0.5) * step, (Math.floor(i / this.size) + 0.5) * step];
  }

  toLocal(e) {
    const r = this.host.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
  }

  hit(x, y) {
    const step = 100 / this.size;
    const c = Math.floor(x / step), r = Math.floor(y / step);
    if (c < 0 || r < 0 || c >= this.size || r >= this.size) return -1;
    const i = r * this.size + c;
    const [cx, cy] = this.center(i);
    return Math.hypot(x - cx, y - cy) < step * 0.36 ? i : -1;
  }

  add(i) {
    if (this.points.includes(i)) return;
    const last = this.points[this.points.length - 1];
    if (last !== undefined) {
      const n = this.size;
      const dr = Math.floor(i / n) - Math.floor(last / n);
      const dc = (i % n) - (last % n);
      const g = gcd(Math.abs(dr), Math.abs(dc));
      for (let k = 1; k < g; k++) {
        const mid = (Math.floor(last / n) + (dr / g) * k) * n + (last % n) + (dc / g) * k;
        if (!this.points.includes(mid)) this.mark(mid);
      }
    }
    this.mark(i);
  }

  mark(i) {
    this.points.push(i);
    this.dots[i].classList.add('on');
    this.dots[i].setAttribute('r', 2.8);
    this.halos[i].classList.add('on');
    this.halos[i].setAttribute('r', 7);
    this.cb.onPoint?.(i, this.points.length);
  }

  draw(x, y) {
    const pts = this.points.map((i) => this.center(i).join(','));
    if (x !== undefined && this.active) pts.push(`${x},${y}`);
    this.line.setAttribute('points', pts.join(' '));
  }

  bind() {
    const start = (e) => {
      if (this.host.classList.contains('busy')) return;
      e.preventDefault();
      this.reset();
      this.active = true;
      this.host.setPointerCapture?.(e.pointerId);
      this.cb.onStart?.();
      move(e);
    };
    const move = (e) => {
      if (!this.active) return;
      e.preventDefault();
      const [x, y] = this.toLocal(e);
      const i = this.hit(x, y);
      if (i >= 0) this.add(i);
      this.draw(x, y);
      this.cb.onMove?.(e.clientX, e.clientY);
    };
    const end = (e) => {
      if (!this.active) return;
      this.active = false;
      this.draw();
      const pts = [...this.points];
      if (pts.length) this.cb.onEnd?.(pts);
      else this.reset();
    };
    this.host.addEventListener('pointerdown', start);
    this.host.addEventListener('pointermove', move);
    this.host.addEventListener('pointerup', end);
    this.host.addEventListener('pointercancel', end);
  }

  reset() {
    this.points = [];
    this.host.classList.remove('done', 'shake');
    this.dots.forEach((d) => { d.classList.remove('on'); d.setAttribute('r', 1.9); });
    this.halos.forEach((h) => { h.classList.remove('on'); h.setAttribute('r', 3); });
    this.line.setAttribute('points', '');
  }

  done() { this.host.classList.add('done'); }
  busy(on) { this.host.classList.toggle('busy', !!on); }
  shake() {
    this.host.classList.remove('shake');
    void this.host.offsetWidth;
    this.host.classList.add('shake');
  }
}
