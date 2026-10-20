/** Makes user text safe to put inside a RegExp: every special character matches itself. */
export default function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
