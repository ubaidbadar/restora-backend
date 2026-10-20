export default function maskContact(contact: string, channel?: 'email' | 'phone'): string {
  if (!contact) return '';
  const isEmail = channel ? channel === 'email' : contact.includes('@');
  if (isEmail) {
    const [local, domain] = contact.split('@');
    if (!local || !domain) return contact;
    const first = local[0] ?? '';
    return `${first}***@${domain}`;
  }
  // Phone masking
  const cleaned = contact.replace(/\s+/g, '');
  if (cleaned.startsWith('+92') && cleaned.length === 13) {
    return `+92 ${cleaned.slice(3, 6)} ****${cleaned.slice(-3)}`;
  }
  if (cleaned.startsWith('03') && cleaned.length === 11) {
    return `+92 ${cleaned.slice(1, 4)} ****${cleaned.slice(-3)}`;
  }
  if (cleaned.length >= 7) {
    const start = cleaned.slice(0, 6);
    const end = cleaned.slice(-3);
    return `${start}****${end}`;
  }
  return contact.slice(0, 2) + '****';
}
