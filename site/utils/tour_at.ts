import type { CSSProperties } from 'react';

/** When something inside a step of the order tour happens, in seconds after its step starts (see index.css). */
export default function tourAt(seconds: number) {
  return { '--at': `${seconds}s` } as CSSProperties;
}
