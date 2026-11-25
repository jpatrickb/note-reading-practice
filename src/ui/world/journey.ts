// Session progress as a little journey: a traveler (balloon, boat, fox, candy, rocket, record) moves
// along a trail toward a destination as questions are answered. It replaces the plain progress bar
// and keeps its role (progressbar) and aria values. It moves for every answer (it measures the
// session, not success), and only hops on a correct one.

import { reducedFx } from './fx';

interface Trip {
  rider: string;
  goal: string;
}

const TRIPS: Record<string, Trip> = {
  sunny: {
    rider:
      '<path d="M20 3C30 3 36 10 36 18 36 26 27 30 23 33H17C13 30 4 26 4 18 4 10 10 3 20 3Z" fill="#ff6b6b"/>' +
      '<path d="M20 3C15 9 14 25 17 33H23C26 25 25 9 20 3Z" fill="#ffd43b"/><path d="M17 33 16 35.5M23 33 24 35.5" stroke="#9c6b3c" stroke-width="1.5"/>' +
      '<rect x="14.5" y="35" width="11" height="5" rx="1.5" fill="#9c6b3c"/>',
    goal:
      '<path d="M0 40Q20 22 40 40Z" fill="#86c96b"/><rect x="11" y="22" width="18" height="13" fill="#fff3d6"/><path d="M8 23 20 12 32 23Z" fill="#e8590c"/>' +
      '<rect x="17.5" y="27" width="5" height="8" rx="2.5" fill="#9c6b3c"/><path d="M28 14V4l7 3-7 3" stroke="#c2410c" stroke-width="1.5" fill="#ffd43b"/>',
  },
  ocean: {
    rider:
      '<path d="M3 27H37L31 35H9Z" fill="#c46a2b"/><path d="M20 4V27" stroke="#7a4a20" stroke-width="2"/>' +
      '<path d="M21.5 5 34 24H21.5Z" fill="#fff" stroke="#a5d8ff" stroke-width="1.2"/><path d="M18.5 9 8 24H18.5Z" fill="#ffe066"/>' +
      '<path d="M0 37q5-3 10 0t10 0 10 0 10 0" stroke="#4dabf7" stroke-width="2" fill="none"/>',
    goal:
      '<path d="M1 39Q20 26 39 39Z" fill="#f2dca6"/><path d="M19 34Q18 24 22 15" stroke="#9c6b3c" stroke-width="3" fill="none"/>' +
      '<path d="M22 15Q14 11 8 15M22 15Q19 7 12 6M22 15Q27 7 34 9M22 15Q31 13 35 20" stroke="#2f9e44" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<rect x="26" y="31" width="9" height="6" rx="1.5" fill="#f59f00" stroke="#9c6b3c" stroke-width="1"/>',
  },
  forest: {
    rider:
      '<path d="M10 25C4 22 2 16 4 11 7 16 10 19 14 21Z" fill="#fd7e14"/><path d="M4 11C3 13.5 3.5 15.5 5 17 6.5 15 6 13 4 11Z" fill="#fff"/>' +
      '<path d="M9 26C9 20 15 18 23 18 29 18 32 21 32 25 32 29 27 31 19 31 13 31 9 30 9 26Z" fill="#fd7e14"/>' +
      '<path d="M14 30 11 37M19 31 20 37M26 30 25 37M29 29 32 35" stroke="#c4520a" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M28 21C28 15 33 12 37 15L40 19C38 21 35 22.5 32 23.5Z" fill="#fd7e14"/><path d="M30 15 31 8 35 13Z" fill="#fd7e14"/>' +
      '<path d="M33 21.5Q36.5 22 39.6 19.5" stroke="#fff" stroke-width="2" fill="none"/><circle cx="34" cy="17" r="1.3" fill="#2b2a33"/><circle cx="39.6" cy="19" r="1.3" fill="#2b2a33"/>',
    goal:
      '<rect x="16.5" y="19" width="7" height="20" fill="#8a5a2b"/><circle cx="20" cy="14" r="13" fill="#5d9455"/><circle cx="13" cy="17" r="7" fill="#6fa863"/><circle cx="27" cy="16" r="8" fill="#4a8a4a"/>' +
      '<path d="M18 39v-5a2 2 0 0 1 4 0v5z" fill="#3a2a1a"/>',
  },
  candy: {
    rider:
      '<path d="M12 20 3 12V28ZM28 20 37 12V28Z" fill="#ffd43b"/><circle cx="20" cy="20" r="10" fill="#ff8fab"/>' +
      '<path d="M14 14q6 6 0 12M20 10q6 10 0 20M26 14q-5 6 0 12" stroke="#fff" stroke-width="2" fill="none" opacity=".8"/>',
    goal:
      '<rect x="9" y="22" width="22" height="17" fill="#ffdeeb"/><rect x="5" y="16" width="8" height="23" fill="#ffc9de"/><rect x="27" y="16" width="8" height="23" fill="#ffc9de"/>' +
      '<path d="M4 17 9 8 14 17ZM26 17 31 8 36 17Z" fill="#c2255c"/><path d="M17 39v-6a3 3 0 0 1 6 0v6z" fill="#c2255c"/><path d="M20 22V12l6 2.5-6 2.5" stroke="#c2255c" stroke-width="1.5" fill="#ffd43b"/>',
  },
  space: {
    rider:
      '<path class="j-flame" d="M8 17 1 20 8 23Z" fill="#ffd43b"/><path d="M12 13 6 6 18 12ZM12 27 6 34 18 28Z" fill="#ff6b6b"/>' +
      '<path d="M8 20C8 14 16 11 26 11 33 11 37 15 39 20 37 25 33 29 26 29 16 29 8 26 8 20Z" fill="#e9ecef"/>' +
      '<path d="M31 12.6C35 14 37.5 17 39 20 37.5 23 35 26 31 27.4Z" fill="#ff6b6b"/><circle cx="23" cy="20" r="4.2" fill="#74c0fc" stroke="#adb5bd" stroke-width="1.5"/>',
    goal:
      '<ellipse cx="20" cy="21" rx="18" ry="5" fill="none" stroke="#ffd8a8" stroke-width="2.5" transform="rotate(-16 20 21)"/><circle cx="20" cy="20" r="10" fill="#b197fc"/>' +
      '<path d="M12 17q8 4 16-1" stroke="#9775fa" stroke-width="2.5" fill="none"/><path d="M2.6 25.7A18 5 -16 0 0 37.4 16" stroke="#ffd8a8" stroke-width="2.5" fill="none"/>',
  },
  studio: {
    rider:
      '<g class="j-roll"><circle cx="20" cy="20" r="15" fill="#27272a"/><circle cx="20" cy="20" r="11" fill="none" stroke="#52525b" stroke-width="1.3"/>' +
      '<circle cx="20" cy="20" r="6" fill="#3b82f6"/><circle cx="20" cy="20" r="1.5" fill="#fff"/><path d="M9 13a13 13 0 0 1 6-5" stroke="#71717a" stroke-width="2" fill="none" stroke-linecap="round"/></g>',
    goal:
      '<rect x="7" y="18" width="6" height="18" rx="3" fill="#3b82f6"/><rect x="17" y="8" width="6" height="28" rx="3" fill="#18181b"/><rect x="27" y="14" width="6" height="22" rx="3" fill="#3b82f6"/>',
  },
};

export class Journey {
  readonly el: HTMLElement;
  private readonly mover: HTMLElement;
  private readonly rider: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly roll: SVGElement | null;
  private done = 0;

  constructor(
    themeId: string,
    private readonly length: number,
  ) {
    const trip = TRIPS[themeId] ?? TRIPS.sunny!;
    this.el = document.createElement('div');
    this.el.className = `journey progress journey--${TRIPS[themeId] ? themeId : 'sunny'}`;
    this.el.setAttribute('role', 'progressbar');
    this.el.setAttribute('aria-label', 'Questions answered');
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', String(length));
    this.el.setAttribute('aria-valuenow', '0');
    this.el.innerHTML =
      '<div class="journey__trail"><div class="journey__fill progress__fill"></div></div>' +
      `<svg class="journey__goal" viewBox="0 0 40 40" aria-hidden="true">${trip.goal}</svg>` +
      `<div class="journey__mover"><div class="journey__rider"><svg viewBox="0 0 40 40" aria-hidden="true">${trip.rider}</svg></div></div>`;
    this.mover = this.el.querySelector('.journey__mover')!;
    this.rider = this.el.querySelector('.journey__rider')!;
    this.fill = this.el.querySelector('.journey__fill')!;
    this.roll = this.el.querySelector('.j-roll');
  }

  /** Move to `done` answered questions; `hop` adds a little jump (correct answers only). */
  set(done: number, hop = false): void {
    const prev = this.done;
    this.done = done;
    const p = this.length ? Math.min(1, done / this.length) : 0;
    this.el.setAttribute('aria-valuenow', String(done));
    this.el.dataset.progress = p.toFixed(3);
    this.mover.style.transform = `translateX(${(p * 100).toFixed(2)}%)`;
    this.fill.style.transform = `translateX(${((p - 1) * 100).toFixed(2)}%)`;
    if (this.roll) this.roll.style.transform = `rotate(${done * 72}deg)`;
    if (done === this.length) this.el.classList.add('journey--arrived');
    if (hop && done > prev && !reducedFx() && typeof this.rider.animate === 'function') {
      this.rider.animate(
        [
          { transform: 'translateY(0) rotate(0)' },
          { transform: 'translateY(-40%) rotate(-10deg)', offset: 0.45 },
          { transform: 'translateY(0) rotate(0)' },
        ],
        { duration: 420, easing: 'ease-out' },
      );
    }
  }
}
