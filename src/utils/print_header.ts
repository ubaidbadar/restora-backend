import type { Context } from 'hono';
import type { Workplace } from './workplace';

/** The restaurant's details a receipt carries: name, branch, phone, tax numbers and closing line. Empty ones are left out. */
export default function printHeader(c: Context) {
  const workplace = c.get('workplace') as Workplace | undefined;
  const branch = workplace?.branch;
  const receipt = workplace?.settings?.receipt;
  return {
    restaurant: workplace?.restaurant.name ?? '',
    branch: branch ? [branch.name, branch.address, branch.area, branch.city].filter(Boolean).join(', ') : undefined,
    phone: branch?.phone || undefined,
    ntn: receipt?.ntn || undefined,
    strn: receipt?.strn || undefined,
    footer: receipt?.footer || undefined,
  };
}
