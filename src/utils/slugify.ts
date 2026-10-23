/**
 * Lowercase words joined by dashes, for a link: "Ubaid's Tandoor House" becomes "ubaids-tandoor-house". Accents are
 * dropped; letters outside a to z (Urdu) are left out, so the answer can be empty.
 */
export default function slugify(text: string, max = 32) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, max)
    .replace(/^-+|-+$/g, '');
}
