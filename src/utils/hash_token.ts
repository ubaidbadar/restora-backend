/** SHA-256 of a high-entropy token, as hex. Used to look a token up by an index without storing it. */
export default function hashToken(token: string): string {
  return new Bun.CryptoHasher('sha256').update(token).digest('hex');
}
