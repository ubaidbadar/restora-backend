import type { SVGProps } from 'react';

const SIZE = 21;

/** Is this module one of the three finder squares in the corners (ring, gap, 3×3 centre)? */
function finderAt(x: number, y: number) {
  for (const [fx, fy] of [[0, 0], [SIZE - 7, 0], [0, SIZE - 7]] as const) {
    const dx = x - fx;
    const dy = y - fy;
    if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
      const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6;
      const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      return edge || core ? 'on' : 'off';
    }
    if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) return 'off';
  }
  return undefined;
}

// Drawn once, the same on every render: a fixed pseudo-random pattern, so the server and any screenshot agree.
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) % 100) / 100;
const PATH = Array.from({ length: SIZE * SIZE }, (_, i) => {
  const x = i % SIZE;
  const y = Math.floor(i / SIZE);
  const finder = finderAt(x, y);
  const on = finder ? finder === 'on' : random() < 0.48;
  return on ? `M${x} ${y}h1v1h-1z` : '';
}).join('');

/** A table's QR code, as a drawing: it looks like one, but it is not a real code and opens nothing. */
export default function QrArt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox={`-1 -1 ${SIZE + 2} ${SIZE + 2}`} shapeRendering="crispEdges" aria-hidden="true" {...props}>
      <path d={PATH} fill="currentColor" />
    </svg>
  );
}
