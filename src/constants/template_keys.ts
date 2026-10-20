const TEMPLATE_KEYS = ['winback', 'reservation'] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export default TEMPLATE_KEYS;
