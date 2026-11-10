import type { IOrder } from '../models/order';

/** Generate a simple, dependency-free, printable PDF from the immutable order snapshot. */
function printable(value: unknown): string {
  return String(value ?? '').replace(/[^\x20-\x7e]/g, '?');
}
function pdfEscape(value: string): string {
  return printable(value).replace(/[\\()]/g, '\\$&');
}
function invoiceDate(value: Date | string | undefined): string {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-PK', {
    timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(date);
}
function paymentLine(order: IOrder): string {
  if (order.paymentStatus === 'unpaid') return 'Payment: Not paid yet';
  if (order.paymentStatus === 'khata') return 'Payment: Added to customer account (Khata)';
  if (order.paymentStatus === 'paid') return 'Payment: Paid' + (order.paymentMethod ? ' via ' + order.paymentMethod : '');
  return 'Payment: ' + String(order.paymentStatus || 'Not recorded');
}
function wrap(value: string, columns = 75): string[] {
  const words = printable(value).split(/\s+/);
  const result: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + 1 + word.length > columns) { result.push(current); current = ''; }
    let rest = word;
    while (rest.length > columns) { if (current) { result.push(current); current = ''; } result.push(rest.slice(0, columns)); rest = rest.slice(columns); }
    current += (current ? ' ' : '') + rest;
  }
  if (current) result.push(current);
  return result;
}
export function invoiceLines(order: IOrder, restaurant: string, address?: string): string[] {
  const lines = [
    restaurant, ...(address ? [address] : []), '',
    \`Order #\${order.dailyToken}\`, \`Date: \${invoiceDate(order.createdAt)}\`,
    '----------------------------------------------',
    ...order.items.flatMap((item) => [
      \`\${item.qty} x \${item.name}\${item.sizeName ? \` (\${item.sizeName})\` : ''}\`,
      \`  \${item.qty} x Rs \${item.price} = Rs \${item.qty * item.price}\`,
    ]),
    '----------------------------------------------',
    \`Subtotal: Rs \${order.subtotal}\`,
    ...(order.discount ? [\`Discount: Rs \${order.discount}\`] : []),
    ...(order.tax ? [\`Tax: Rs \${order.tax}\`] : []),
    ...(order.deliveryFee ? [\`Delivery: Rs \${order.deliveryFee}\`] : []),
    \`TOTAL: Rs \${order.total}\`,
    paymentLine(order),
  ];
  return lines.flatMap((line) => wrap(line));
}
export function invoiceMessage(order: IOrder, restaurant: string): string {
  const items = order.items.map((item) => \`\${item.qty} x \${item.name}: Rs \${item.qty * item.price} (Rs \${item.price} each)\`);
  return [restaurant, \`Order #\${order.dailyToken}\`, \`Date: \${invoiceDate(order.createdAt)}\`, ...items,
    \`Total: Rs \${order.total}\`, paymentLine(order)].join('\\n');
}
export function invoicePdf(order: IOrder, restaurant: string, address?: string): Uint8Array {
  const lines = invoiceLines(order, restaurant, address);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 49) pages.push(lines.slice(i, i + 49));
  if (!pages.length) pages.push([]);
  const objects: string[] = [''];
  const add = (value: string) => { objects.push(value); return objects.length - 1; };
  const catalog = add('');
  const pagesId = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const ids: number[] = [];
  for (const pageLines of pages) {
    const stream = ['BT', '/F1 10 Tf', '14 TL', '50 790 Td',
      ...pageLines.flatMap((line) => [\`(\${pdfEscape(line)}) Tj\`, 'T*']), 'ET'].join('\\n');
    const content = add(\`<< /Length \${Buffer.byteLength(stream, 'ascii')} >>\\nstream\\n\${stream}\\nendstream\`);
    const page = add(\`<< /Type /Page /Parent \${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 \${font} 0 R >> >> /Contents \${content} 0 R >>\`);
    ids.push(page);
  }
  objects[catalog] = \`<< /Type /Catalog /Pages \${pagesId} 0 R >>\`;
  objects[pagesId] = \`<< /Type /Pages /Kids [\${ids.map((id) => \`\${id} 0 R\`).join(' ')}] /Count \${ids.length} >>\`;
  let pdf = '%PDF-1.4\\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'ascii');
    pdf += \`\${id} 0 obj\\n\${objects[id]}\\nendobj\\n\`;
  }
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += \`xref\\n0 \${objects.length}\\n0000000000 65535 f \\n\`;
  for (let id = 1; id < objects.length; id++) pdf += \`\${String(offsets[id]).padStart(10, '0')} 00000 n \\n\`;
  pdf += \`trailer\\n<< /Size \${objects.length} /Root \${catalog} 0 R >>\\nstartxref\\n\${xref}\\n%%EOF\\n\`;
  return new Uint8Array(Buffer.from(pdf, 'ascii'));
}
