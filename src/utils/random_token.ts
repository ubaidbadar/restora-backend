/** A URL-safe random string from the platform CSPRNG. `bytes` of entropy; 32 bytes = 256 bits. */
export default function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Buffer.from(buffer).toString('base64url');
}
