// HTMLDrop's mascot: the engine in ./bot is bloub's (https://github.com/jeremy-prt/bloub,
// MIT, see ./LICENSE), copied unchanged; this file draws its frames in HTMLDrop's
// drop and ties its states to the upload window. `npm run build:mascot` bundles it
// into src/mascot.gen.ts, which the Worker serves.
//
// It takes over the brand mark ([data-mascot="mark"]) and replaces the static
// one inside, unless the visitor asked for reduced motion: then that one stays.

import { BotEngine, type BotFrame } from './bot/engine'
import type { BotExpression } from './bot/expressions'
import { clamp, easings } from './bot/math'
import { PROFILE_SAMPLES } from './bot/profiles'
import { RAYON as R } from './bot/repere'
import { STATE_BY_ID, type StateId } from './bot/states'

// The drop: a circle whose top-right quadrant is squared off into a corner,
// the same shape as MARK_BODY in src/pages/theme.ts. The corner keeps a small
// radius: the engine threads a smooth curve through the profile's samples, and
// a truly sharp corner made it overshoot into a nub.
const CORNER = 0.3
function insideDrop(x: number, y: number): boolean {
  if (x <= 0 || y >= 0) return x * x + y * y <= 1
  const u = x - (1 - CORNER)
  const v = -y - (1 - CORNER)
  return x <= 1 && -y <= 1 && (u <= 0 || v <= 0 || u * u + v * v <= CORNER * CORNER)
}
const DROP = Array.from({ length: PROFILE_SAMPLES }, (_, i) => {
  const a = (i / PROFILE_SAMPLES) * Math.PI * 2
  let lo = 0.9
  let hi = 1.5
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2
    if (insideDrop(mid * Math.cos(a), mid * Math.sin(a))) lo = mid
    else hi = mid
  }
  return lo
})

// The face at rest is the static mark's, not bloub's: bloub looks well up and
// to the right on a ball, which on the drop pushed the eyes into the corner.
// Fitted to the static mark's eyes; the capsules are its size too.
const FACE: BotExpression = {
  id: 'neutre',
  gaze: { yaw: 6.5, pitch: 4.5, roll: -18 },
  split: 14,
  eyes: [
    { w: 0.29, h: 0.6, tilt: 0, open: 1 },
    { w: 0.29, h: 0.6, tilt: 0, open: 1 },
  ],
}

// Half the viewBox: the body's radius plus the margin the static mark keeps, so
// swapping one for the other doesn't change the size. Orbits and the comet's tail
// draw past it (the svg doesn't clip).
const HALF = R * 1.05

// Following the pointer: where the eyes settle when it sits straight ahead
// (where the static mark's eyes are), and how far they swing.
const LOOK_YAW = 6.5
const LOOK_PITCH = 4.5
const SWING_YAW = 14
const SWING_PITCH = 10
const TURN = 0.6

const NS = 'http://www.w3.org/2000/svg'
function el(name: string, attrs: Record<string, string | number> = {}, parent?: Element): SVGElement {
  const e = document.createElementNS(NS, name)
  for (const k in attrs) e.setAttribute(k, String(attrs[k]))
  parent?.appendChild(e)
  return e
}

let pointer: { x: number; y: number } | null = null
addEventListener('pointermove', (e) => {
  // a lifted finger would leave the eyes fixed on the last touch
  if (e.pointerType !== 'touch') pointer = { x: e.clientX, y: e.clientY }
})
document.documentElement.addEventListener('pointerleave', () => {
  pointer = null
})

let uid = 0

interface Mascot {
  /** the state it rests in until told otherwise */
  rest(id: StateId): void
  /** play a state once, then go back to the resting one */
  play(id: StateId): void
}

function mount(host: HTMLElement): Mascot {
  const id = `mascot-${++uid}`
  const svg = el('svg', { viewBox: `${-HALF} ${-HALF} ${HALF * 2} ${HALF * 2}`, 'aria-hidden': 'true' })
  const defs = el('defs', {}, svg)
  const big = R * 2
  const mask = el('mask', { id, maskUnits: 'userSpaceOnUse', x: -big, y: -big, width: big * 2, height: big * 2 }, defs)
  const maskBody = el('path', { fill: '#fff' }, mask)
  const maskEyes = [el('path', { fill: '#000' }, mask), el('path', { fill: '#000' }, mask)]
  const maskNotch = el('circle', { fill: '#000', r: 0 }, mask)
  const arcsBack = el('g', { fill: 'none', 'stroke-linecap': 'round' }, svg)
  const dotsBack = el('g', {}, svg)
  const body = el('g', {}, svg)
  // the eyes are holes: under them goes the page colour, so the back half of an
  // orbit doesn't show through them
  const under = el('path', { style: 'fill:var(--mascot-paper,var(--bg))' }, body)
  el('rect', { x: -big, y: -big, width: big * 2, height: big * 2, fill: 'currentColor', mask: `url(#${id})` }, body)
  const dotsFront = el('g', {}, svg)
  const notif = el('circle', { style: 'fill:var(--accent)', r: 0 }, svg)
  const arcsFront = el('g', { fill: 'none', 'stroke-linecap': 'round' }, svg)
  host.replaceChildren(svg)

  const engine = new BotEngine(R, 'idle', DROP, FACE)
  let clock = 0
  let last = performance.now()
  let state: StateId = 'idle'
  let resting: StateId = 'idle'
  let until = Infinity
  let aiming = false
  let aimSince = 0

  const go = (next: StateId) => {
    if (next === state) return
    state = next
    engine.setState(next, clock)
  }

  function aim() {
    if (!STATE_BY_ID.get(state)?.baseFace) {
      if (aiming) engine.setLook(null, clock, TURN)
      aiming = false
      return
    }
    const box = host.getBoundingClientRect()
    if (box.width === 0) return
    if (!aiming) aimSince = clock
    aiming = true
    const nx = pointer ? clamp((pointer.x - (box.left + box.width / 2)) / Math.max(1, innerWidth / 2), -1, 1) : 0
    const ny = pointer ? clamp((pointer.y - (box.top + box.height / 2)) / Math.max(1, innerHeight / 2), -1, 1) : 0
    engine.setLook(
      {
        yaw: LOOK_YAW + nx * SWING_YAW,
        pitch: LOOK_PITCH - ny * SWING_PITCH,
        mix: pointer ? easings.easeOutQuint(clamp((clock - aimSince) / TURN)) : 0,
        spin: 0,
        wander: pointer ? 0 : 1,
      },
      clock,
    )
  }

  function dots(g: SVGElement, f: BotFrame) {
    g.replaceChildren()
    for (const d of f.dots) {
      // depth fades a dot toward the page colour, which an opacity over it does
      const paint: Record<string, string | number> = d.color
        ? { fill: d.color }
        : { fill: 'currentColor', 'fill-opacity': d.depth ?? 1 }
      if (d.d) el('path', { ...paint, opacity: d.opacity, d: d.d, transform: `translate(${d.x} ${d.y}) rotate(${d.rot ?? 0}) scale(${R})` }, g)
      else el('circle', { ...paint, opacity: d.opacity, cx: d.x, cy: d.y, r: d.r }, g)
    }
  }

  function arcs(g: SVGElement, f: BotFrame, side: 'back' | 'front') {
    g.replaceChildren()
    for (const a of f.arcs) {
      const gid = `${id}-${a.id}`
      let grad = defs.querySelector(`#${gid}`)
      if (!grad) {
        grad = el('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse' }, defs)
        a.grad.stops.forEach((c, i) => el('stop', { offset: i / (a.grad.stops.length - 1), 'stop-color': c }, grad!))
      }
      for (const k of ['x1', 'y1', 'x2', 'y2'] as const) grad.setAttribute(k, String(a.grad[k]))
      el('path', { d: a[side], stroke: `url(#${gid})`, 'stroke-width': a.width, opacity: a.opacity }, g)
    }
  }

  function draw(f: BotFrame) {
    maskBody.setAttribute('d', f.bodyPath)
    under.setAttribute('d', f.bodyPath)
    body.setAttribute('opacity', String(f.bodyAlpha))
    maskEyes.forEach((m, i) => {
      const e = f.eyes[i]
      m.setAttribute('d', e ? e.d : '')
      if (e) {
        m.setAttribute('transform', e.matrix)
        m.setAttribute('opacity', String(e.alpha))
      }
    })
    maskNotch.setAttribute('r', String(f.notch?.r ?? 0))
    if (f.notch) {
      maskNotch.setAttribute('cx', String(f.notch.x))
      maskNotch.setAttribute('cy', String(f.notch.y))
    }
    notif.setAttribute('r', String(f.notif?.r ?? 0))
    if (f.notif) {
      notif.setAttribute('cx', String(f.notif.x))
      notif.setAttribute('cy', String(f.notif.y))
    }
    arcs(arcsBack, f, 'back')
    arcs(arcsFront, f, 'front')
    dots(f.dotsBehind ? dotsBack : dotsFront, f)
    ;(f.dotsBehind ? dotsFront : dotsBack).replaceChildren()
  }

  function tick(now: number) {
    // a long gap (a hidden tab) resumes where it left off instead of jumping
    clock += Math.min(0.1, (now - last) / 1000)
    last = now
    if (clock >= until) {
      until = Infinity
      go(resting)
    }
    // nothing to draw while the window hides it (after an upload, say)
    if (host.getClientRects().length > 0) {
      aim()
      draw(engine.sample(clock))
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  return {
    rest(id) {
      resting = id
      if (until === Infinity) go(id)
    },
    play(id) {
      go(id)
      until = clock + (STATE_BY_ID.get(id)?.duration ?? 2)
    },
  }
}

const host = document.querySelector<HTMLElement>('[data-mascot="mark"]')
if (host && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const mark = mount(host)

  // The upload window says what it is doing through its classes; the mark reads
  // them rather than being called from the page's script. The window keeps its
  // own drop animation; the mark only reacts alongside it.
  const win = document.getElementById('dropZone')
  if (win) {
    let done = win.classList.contains('done')
    new MutationObserver(() => {
      const c = win.classList
      mark.rest(c.contains('busy') ? 'thinking' : c.contains('error') ? 'exclaim' : c.contains('over') ? 'wide' : 'idle')
      // a fresh link
      if (c.contains('done') && !done) mark.play('comet')
      done = c.contains('done')
    }).observe(win, { attributes: true, attributeFilter: ['class'] })
  }

  // any copy button lighting up
  new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target as Element
      if (t.classList.contains('copied') && !(r.oldValue ?? '').split(' ').includes('copied')) mark.play('wink')
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true })
}
