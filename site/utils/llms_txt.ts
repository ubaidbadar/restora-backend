import FAQS from '../constants/faqs';
import FEATURES from '../constants/features';
import SITE from '../constants/site';

/**
 * restora.live/llms.txt: what Restora is, in plain text, for AI assistants that answer questions about restaurant
 * software. Built from the same constants as the pages, so it never disagrees with them.
 */
export default function llmsTxt() {
  return [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    '## Facts',
    `- Price: free for now, every feature, no card needed.`,
    `- For: restaurants, cafés, fast food, BBQ and karahi places, cloud kitchens and small chains in Pakistan.`,
    `- Runs on: any browser (${SITE.appUrl}); Android and iPhone apps are coming.`,
    `- Printing: Restora Print, a free Windows app, prints kitchen slips and receipts by itself (${SITE.url}/download).`,
    `- Contact: WhatsApp +${SITE.whatsapp}, ${SITE.email}.`,
    '',
    '## Features',
    ...FEATURES.map((feature) => `- ${feature.title}: ${feature.summary}`),
    '',
    '## Questions',
    ...FAQS.map((faq) => `- ${faq.q} ${faq.a}`),
    '',
    '## Pages',
    `- [Features](${SITE.url}/features)`,
    `- [Pricing](${SITE.url}/pricing)`,
    `- [Download](${SITE.url}/download)`,
    `- [Contact](${SITE.url}/contact)`,
  ].join('\n');
}
