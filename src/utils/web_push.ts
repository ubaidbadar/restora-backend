import { generateVAPIDKeys, sendNotification } from 'web-push';

/** Mutable adapter keeps tests able to stub delivery while using web-push's ESM named exports. */
const webpush = { generateVAPIDKeys, sendNotification };

export default webpush;
