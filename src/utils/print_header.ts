import type { Context } from 'hono';
import type { Workplace } from './workplace';

/**
 * The restaurant's details a receipt carries: logo, name, branch, phone, tax numbers and closing line. Empty ones are left
 * out. The logo goes as its https address: the print agent downloads it once and keeps it for receipts printed offline.
 */
export default function printHeader(c: Context) {
  const workplace = c.get('workplace') as Workplace | undefined;
  const branch = workplace?.branch;
  const receipt = workplace?.settings?.receipt;
  return {
    restaurant: workplace?.restaurant.name ?? '',
    logo: workplace?.restaurant.logo?.startsWith('https://') ? workplace.restaurant.logo : undefined,
    branch: branch ? [branch.name, branch.address, branch.area, branch.city].filter(Boolean).join(', ') : undefined,
    phone: branch?.phone || undefined,
    ntn: receipt?.ntn || undefined,
    strn: receipt?.strn || undefined,
    footer: receipt?.footer || undefined,
  };
}
