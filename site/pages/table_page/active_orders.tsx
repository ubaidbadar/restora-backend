import type TableOrder from '../../types/table_order';
import formatRs from '../../utils/format_rs';

interface ActiveOrdersProps {
  orders: TableOrder[];
  tableName: string;
}

const STATUS_CONFIG: Record<
  TableOrder['status'],
  { label: string; badgeClass: string; step: number; hint: string }
> = {
  pending: {
    label: 'Waiting for staff',
    badgeClass: 'bg-haldi-soft text-ink border-haldi',
    step: 1,
    hint: 'A waiter will confirm your order in a moment.',
  },
  new: {
    label: 'Confirmed',
    badgeClass: 'bg-indigo-wash text-indigo-deep border-indigo/30',
    step: 2,
    hint: 'Order confirmed and queued in the kitchen.',
  },
  preparing: {
    label: 'Cooking',
    badgeClass: 'bg-haldi-soft text-ink border-haldi',
    step: 3,
    hint: 'The kitchen is preparing your dishes.',
  },
  ready: {
    label: 'Ready to serve',
    badgeClass: 'bg-leaf-soft text-leaf border-leaf/40',
    step: 4,
    hint: 'Dishes are ready and on the way to your table.',
  },
  completed: {
    label: 'Served',
    badgeClass: 'bg-leaf-soft text-leaf border-leaf/40',
    step: 4,
    hint: 'Enjoy your meal! Ask for the bill below when ready.',
  },
  out_for_delivery: {
    label: 'On the way',
    badgeClass: 'bg-leaf-soft text-leaf border-leaf/40',
    step: 4,
    hint: 'Your order is on the way.',
  },
  cancelled: {
    label: 'Cancelled',
    badgeClass: 'bg-chili/10 text-chili border-chili/30',
    step: 0,
    hint: 'This order was turned down or cancelled.',
  },
};

const STEPS = ['Sent', 'Confirmed', 'Cooking', 'Served'];

export default function ActiveOrders({ orders, tableName }: ActiveOrdersProps) {
  if (orders.length === 0) return null;

  return (
    <section aria-label="Table orders" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[1.2rem] font-bold text-ink">
          {`Orders at Table ${tableName}`}
        </h2>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-leaf">
          <span className="inline-block size-2 animate-pulse rounded-full bg-leaf" />
          Live updates
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        {orders.map((order) => {
          const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
          const isCancelled = order.status === 'cancelled';
          const isPaid = order.paymentStatus === 'paid';

          return (
            <article
              key={order._id}
              className="flex flex-col gap-3 rounded-panel border border-rule bg-paper p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-slip text-xs text-ink-3">{`Table ${tableName}`}</p>
                  <p className="text-xl font-bold tracking-tight text-ink">
                    {`Order #${order.dailyToken}`}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${config.badgeClass}`}
                >
                  {config.label}
                </span>
              </div>

              {/* Progress steps (unless cancelled) */}
              {!isCancelled && (
                <div className="my-1">
                  <div className="grid grid-cols-4 gap-1.5">
                    {STEPS.map((stepLabel, idx) => {
                      const stepNumber = idx + 1;
                      const active = config.step >= stepNumber;
                      return (
                        <div key={stepLabel} className="flex flex-col gap-1">
                          <div
                            className={`h-1.5 w-full rounded-full transition-colors ${
                              active ? 'bg-indigo' : 'bg-canvas'
                            }`}
                          />
                          <span
                            className={`text-[0.7rem] font-medium leading-none ${
                              active ? 'text-ink font-semibold' : 'text-ink-3'
                            }`}
                          >
                            {stepLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="text-xs text-ink-2">{config.hint}</p>

              {/* Items summary */}
              <ul className="flex flex-col divide-y divide-rule/60 border-t border-b border-rule/60 text-sm">
                {order.items.map((item, idx) => {
                  const details = [
                    item.sizeName,
                    ...(item.addonNames || []),
                    item.note ? `“${item.note}”` : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <li key={idx} className="flex items-center justify-between py-1.5">
                      <span className="text-ink">
                        <span className="font-semibold tabular-nums">{`${item.qty}×`}</span>{' '}
                        {item.name}
                        {details && (
                          <span className="text-xs text-ink-3"> · {details}</span>
                        )}
                      </span>
                      <span className="tabular-nums text-ink-2">
                        {formatRs(item.price * item.qty)}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between pt-0.5 text-sm">
                <span className="font-semibold text-ink">Total</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                      isPaid
                        ? 'bg-leaf-soft text-leaf'
                        : 'bg-haldi-soft text-ink'
                    }`}
                  >
                    {isPaid ? 'Paid' : 'Unpaid'}
                  </span>
                  <span className="font-bold tabular-nums text-ink">
                    {formatRs(order.total)}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
