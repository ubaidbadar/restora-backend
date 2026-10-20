import PIN_PATTERN from '../constants/pin_pattern';

export function isWeakPin(pin: string): boolean {
  if (!PIN_PATTERN.test(pin)) return true;
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((digit, index) => digit - digits[index]!);
  const weak = steps.every((step) => step === 0) || steps.every((step) => step === 1) || steps.every((step) => step === -1);
  return weak;
}

export default function validatePin(pin: string): { valid: boolean; message?: string } {
  if (!PIN_PATTERN.test(pin)) {
    return { valid: false, message: 'Use 4 to 6 digits' };
  }
  if (isWeakPin(pin)) {
    return { valid: false, message: 'Pick a PIN harder to guess than 1234 or 0000' };
  }
  return { valid: true };
}
