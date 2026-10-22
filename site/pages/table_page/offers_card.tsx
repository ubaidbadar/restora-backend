import WhatsappIcon from '../../icons/whatsapp_icon';
import api from '../../config/api';
import Checkbox from '../../ui/checkbox';
import Form from '../../ui/form';
import Input from '../../ui/input';
import offersSchema from './schema';

/** "Get offers on WhatsApp" at the end of the menu: the guest leaves their number by choice. The thank-you replaces it. */
export default function OffersCard({ code, restaurantName }: { code: string; restaurantName: string }) {
  return (
    <section aria-labelledby="offers-title" className="rounded-panel bg-paper p-5 shadow-slip">
      <h2 id="offers-title" className="flex items-center gap-2 text-[1.2rem] font-bold">
        <WhatsappIcon className="size-5 text-leaf" />
        Get offers on WhatsApp
      </h2>
      <Form
        schema={offersSchema}
        className="mt-3 flex flex-col gap-3"
        onSubmit={({ data, onSuccess, onError }) =>
          api
            .post(`/public/t/${code}/opt-in`, data)
            .then(() => onSuccess('Thank you! You will get offers on WhatsApp now and then.'))
            .catch(onError)
        }
        component={({ register, errors, loading, message, error }) =>
          message ? (
            <p role="status" className="rounded-control bg-leaf-soft px-3.5 py-3 font-semibold text-leaf">
              {message}
            </p>
          ) : (
            <>
              <p className="text-[0.95rem] text-ink-2">Deals and new dishes from {restaurantName}, now and then. Your number stays with the restaurant.</p>
              <Input autoComplete="name" placeholder="Your name (optional)" aria-label="Your name (optional)" maxLength={80} error={errors.name?.message as string} {...register('name')} />
              <Input type="tel" inputMode="tel" autoComplete="tel" required placeholder="0300 1234567" aria-label="Mobile number" error={errors.phone?.message as string} {...register('phone')} />
              <Checkbox required label={`Send me offers from ${restaurantName} on WhatsApp`} error={errors.consent?.message as string} {...register('consent')} />
              {error && (
                <p role="alert" className="text-[0.95rem] font-semibold text-chili">
                  {error}
                </p>
              )}
              <button type="submit" disabled={loading} className="inline-flex min-h-12 items-center justify-center rounded-control bg-whatsapp px-5 font-semibold text-on-whatsapp hover:brightness-95 disabled:opacity-70">
                {loading ? 'Saving…' : 'Get offers'}
              </button>
            </>
          )
        }
      />
    </section>
  );
}
