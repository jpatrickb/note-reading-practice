// Original UI icons (hand-drawn SVG, 24×24 grid, round strokes in currentColor). They replace emoji in
// the app chrome so buttons look the same on every device and follow the theme's colors.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Inner SVG markup for each icon. Strokes use currentColor; `fill` parts use currentColor too. */
const ICONS = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  soundOn:
    '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" class="i-fill"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"/>',
  soundOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" class="i-fill"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" class="i-fill"/>',
  keyboard:
    '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M8.8 5v14M15.2 5v14"/><path d="M7 5h3.6v7.5H7zM13.4 5H17v7.5h-3.6z" class="i-fill"/>',
  save: '<path d="M12 4v10M7.5 9.5L12 14l4.5-4.5"/><path d="M4.5 15.5v2.5a2 2 0 002 2h11a2 2 0 002-2v-2.5"/>',
  palette:
    '<path d="M12 3.5a8.5 8.5 0 100 17c1.4 0 2-.8 2-1.8 0-1.4-1.2-1.7-1.2-3 0-1 .8-1.7 1.9-1.7h2.1a3.7 3.7 0 003.7-3.7C20.5 6.6 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1.3" class="i-fill"/><circle cx="10.5" cy="7.3" r="1.3" class="i-fill"/><circle cx="15" cy="7.5" r="1.3" class="i-fill"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  star: '<path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z" class="i-fill"/>',
  sparkle: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" class="i-fill"/>',
  note: '<path d="M9.5 17.5V5.5l9-2v12"/><ellipse cx="7" cy="17.5" rx="2.8" ry="2.2" class="i-fill"/><ellipse cx="16" cy="15.5" rx="2.8" ry="2.2" class="i-fill"/>',
  letters: '<path d="M3.5 18L8 6l4.5 12M5.2 13.8h5.6"/><path d="M15 9.5h3a2.2 2.2 0 010 4.4h-3zM15 13.9h3.5a2.1 2.1 0 010 4.1H15zM15 9.5V18"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
  calm: '<path d="M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z" class="i-fill"/>',
  bulb: '<path d="M9 17.5h6M10 20.5h4M12 3.5a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V17h5v-.6c0-.8.4-1.5 1-2A6 6 0 0012 3.5z"/>',
  wrench: '<path d="M14.5 4.5a4.5 4.5 0 00-4.3 5.9L4.5 16a2 2 0 002.9 2.9l5.6-5.7a4.5 4.5 0 005.9-4.3l-2.6 2.6-2.6-.6-.6-2.6z"/>',
} as const;

export type IconName = keyof typeof ICONS;

/** An icon as an inline SVG element; decorative (aria-hidden) because buttons carry their own text/label. */
export function icon(name: IconName, cls = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon icon--${name} ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = ICONS[name];
  return svg;
}

/** A medal (gold or silver) as a small colored badge with a star. */
export function medal(kind: 'gold' | 'silver', cls = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `medal medal--${kind} ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML =
    '<path d="M7 2.5h4l2 5H9zM17 2.5h-4l-2 5h4z" class="medal__ribbon"/>' +
    '<circle cx="12" cy="14.5" r="7" class="medal__disc"/>' +
    '<circle cx="12" cy="14.5" r="5" class="medal__ring"/>' +
    '<path d="M12 11l1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z" class="medal__star"/>';
  return svg;
}
