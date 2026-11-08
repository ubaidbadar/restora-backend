/**
 * Dependency-free safety lint for the WhatsApp integration.
 * Complements TypeScript; it is not a replacement for a full style linter.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const sourceFiles = [
  'src/controllers/whatsapp_webhook.ts',
  'src/controllers/whatsapp_inbox.ts',
  'src/routes/whatsapp_inbox.ts',
  'src/services/whatsapp_graph.ts',
  'src/services/whatsapp_flow.ts',
  'src/utils/whatsapp_match.ts',
  'src/utils/whatsapp_invoice.ts',
  'src/utils/whatsapp_window.ts',
  'src/models/whatsapp_message.ts',
  'src/models/whatsapp_cart.ts',
  'src/models/whatsapp_invoice_delivery.ts',
];
const errors: string[] = [];
for (const file of sourceFiles) {
  let content: string;
  try { content = readFileSync(join(root, file), 'utf8'); }
  catch { errors.push(file + ': required source file not found'); continue; }
  if (/\beval\s*\(/.test(content) || /\bnew\s+Function\s*\(/.test(content))
    errors.push(file + ': dynamic code execution is forbidden');
  if (/graph\.facebook\.com\/v(?!26\.0)[0-9]/.test(content))
    errors.push(file + ': Graph API version must remain v26.0');
  if (/(?:03396262068|923396262068)/.test(content))
    errors.push(file + ': the Restora OTP platform number must not be used here');
  if (/console\.(?:log|info|debug)\s*\([^\n]*(?:accessToken|APP_SECRET|ENCRYPTION_KEY)/.test(content))
    errors.push(file + ': never log WhatsApp credentials');
  // Bun parses TypeScript without requiring an external linter package.
  try {
    const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
    transpiler.transformSync(content);
  } catch (error) { errors.push(file + ': syntax error: ' + String(error)); }
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log('WhatsApp safety lint passed (' + sourceFiles.length + ' source files)');
}
