import { z } from 'zod';
import PIN_PATTERN from '../constants/pin_pattern';

export const posUnlockSchema = z.object({
  membershipId: z.string().min(1, 'Pick who is unlocking'),
  pin: z.string().regex(PIN_PATTERN, 'Type your 4 to 6 digit PIN'),
});

export default posUnlockSchema;
