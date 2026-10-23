import slugify from './slugify';

/** Letters and digits that can't be mixed up when read aloud or typed (no 0/o, 1/l/i). */
const KEY_LETTERS = '23456789abcdefghjkmnpqrstuvwxyz';
const KEY_LENGTH = 6;

/**
 * The part of a table's QR link after /t/: the restaurant and the table by name, and a 6-letter key from the CSPRNG
 * (31^6, about 900 million), so a table's link can't be guessed from its name: `ubaids-tandoor-house/t1-7k2m9q`.
 */
export default function tableCode(restaurantName: string, tableName: string) {
  let key = '';
  while (key.length < KEY_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(KEY_LENGTH))) {
      // 248 = 31 × 8: higher bytes are skipped so every letter is equally likely.
      if (byte < 248 && key.length < KEY_LENGTH) key += KEY_LETTERS[byte % KEY_LETTERS.length];
    }
  }
  return `${slugify(restaurantName) || 'menu'}/${slugify(tableName, 24) || 'table'}-${key}`;
}
