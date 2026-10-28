import { z } from 'zod';

/** A phone's Expo push token, or a browser's push subscription as `PushSubscription.toJSON()` gives it. */
export const pushDeviceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('expo'), token: z.string().regex(/^Expo(nent)?PushToken\[.+\]$/, 'Not an Expo push token') }),
  z.object({
    kind: z.literal('web'),
    endpoint: z.url({ protocol: /^https$/ }).max(1000),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  }),
]);

/** Forgetting a device: its Expo token or its browser endpoint. */
export const pushDeviceRemoveSchema = z.object({ token: z.string().min(1).max(1000) });
