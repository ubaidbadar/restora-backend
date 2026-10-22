import WhatsappIcon from '../../icons/whatsapp_icon';
import Form from '../../ui/form';
import Input from '../../ui/input';
import Textarea from '../../ui/textarea';
import whatsappLink from '../../utils/whatsapp_link';

const FIELDS = [
  { name: 'name', label: 'Your name', autoComplete: 'name', required: true },
  { name: 'restaurant', label: 'Restaurant', autoComplete: 'organization', required: true },
  { name: 'city', label: 'City', autoComplete: 'address-level2', required: true },
  { name: 'branches', label: 'How many branches', autoComplete: 'off', required: false, inputMode: 'numeric' },
] as const;

/**
 * A demo request, sent as a WhatsApp message from the visitor's own phone (so it reaches a person straight away, and
 * no details are stored on this site). The browser checks the required fields before WhatsApp opens.
 */
export default function DemoForm() {
  return (
    <Form
      className="flex flex-col gap-5 rounded-panel bg-paper p-6 shadow-slip sm:p-8"
      onSubmit={({ data, onSuccess }) => {
        const value = (key: string) => String(data[key] ?? '').trim();
        const lines = [
          'Hi Restora, I would like a demo.',
          `Name: ${value('name')}`,
          `Restaurant: ${value('restaurant')}, ${value('city')}`,
          value('branches') && `Branches: ${value('branches')}`,
          value('note') && `Note: ${value('note')}`,
        ].filter(Boolean);
        window.open(whatsappLink(lines.join('\n')), '_blank', 'noopener');
        onSuccess('WhatsApp opened with your request. Press send there, and we will reply with a time that suits you.');
      }}
      component={({ register, message }) => (
        <>
          {FIELDS.map((field) => (
            <Input key={field.name} label={field.label} required={field.required} autoComplete={field.autoComplete} inputMode={'inputMode' in field ? field.inputMode : undefined} {...register(field.name)} />
          ))}
          <Textarea label="Anything we should know (optional)" rows={3} {...register('note')} />
          <button type="submit" className="mt-2 inline-flex min-h-14 items-center justify-center gap-2.5 rounded-control bg-whatsapp px-6 text-base font-semibold text-on-whatsapp hover:brightness-95">
            <WhatsappIcon className="size-5" />
            Send on WhatsApp
          </button>
          <p role="status" className="text-sm text-ink-3">
            {message || 'This opens WhatsApp with your request typed in. Nothing is saved on this site.'}
          </p>
        </>
      )}
    />
  );
}
