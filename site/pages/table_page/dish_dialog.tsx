import { useState } from 'react';
import withOverlay from '../../hoc/withOverlay';
import useCartStore from '../../store/cart_store';
import type AddonGroup from '../../types/addon_group';
import type Dish from '../../types/dish';
import type ShowTools from '../../types/show_tools';
import BottomSheet from '../../ui/bottom_sheet';
import formatRs from '../../utils/format_rs';
import Stepper from './stepper';

const rule = (group: AddonGroup) =>
  group.min > 0 ? (group.min === group.max ? `Pick ${group.min}` : `Pick ${group.min} to ${group.max}`) : group.max === 1 ? 'Optional' : `Up to ${group.max}`;

/** Picking a dish's size and add-ons (within each group's rules), a note for the kitchen, and how many. */
function DishDialog({ dish, groups, close }: { dish: Dish; groups: AddonGroup[] } & ShowTools) {
  const [pick, setPick] = useState({ sizeId: dish.sizes[0]!._id, addonIds: [] as string[], note: '', qty: 1 });

  const size = dish.sizes.find((entry) => entry._id === pick.sizeId)!;
  const options = groups.flatMap((group) => group.options.filter((option) => pick.addonIds.includes(option._id)));
  const unitPrice = size.price + options.reduce((sum, option) => sum + option.price, 0);
  const missing = groups.find((group) => group.options.filter((option) => pick.addonIds.includes(option._id)).length < group.min);

  const toggle = (group: AddonGroup, optionId: string) => {
    if (pick.addonIds.includes(optionId)) return setPick({ ...pick, addonIds: pick.addonIds.filter((id) => id !== optionId) });
    const inGroup = group.options.filter((option) => pick.addonIds.includes(option._id)).map((option) => option._id);
    // A one-choice group swaps; a full group takes no more.
    if (group.max === 1) return setPick({ ...pick, addonIds: [...pick.addonIds.filter((id) => !inGroup.includes(id)), optionId] });
    if (inGroup.length < group.max) setPick({ ...pick, addonIds: [...pick.addonIds, optionId] });
  };

  const add = () => {
    const addonIds = options.map((option) => option._id);
    const note = pick.note.trim() || undefined;
    useCartStore.getState().add(
      {
        key: [dish._id, size._id, ...[...addonIds].sort(), note ?? ''].join(':'),
        itemId: dish._id,
        name: dish.name,
        sizeId: size._id,
        sizeName: size.name || undefined,
        addonIds,
        addonNames: options.map((option) => option.name),
        note,
        unitPrice,
      },
      pick.qty
    );
    navigator.vibrate?.(10);
    close();
  };

  return (
    <BottomSheet
      title={dish.name}
      onClose={close}
      footer={
        <div className="flex items-center gap-3">
          <Stepper label={dish.name} qty={pick.qty} min={1} onChange={(qty) => setPick({ ...pick, qty })} />
          <button type="button" disabled={Boolean(missing)} onClick={add} className="inline-flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-control bg-indigo px-5 font-semibold text-white hover:bg-indigo-deep disabled:bg-ink-3">
            <span className="truncate">{missing ? `Pick ${missing.name.toLowerCase()}` : 'Add'}</span>
            <span className="whitespace-nowrap tabular-nums">{formatRs(unitPrice * pick.qty)}</span>
          </button>
        </div>
      }
    >
      {dish.description && <p className="mb-4 text-ink-2">{dish.description}</p>}

      {dish.sizes.length > 1 && (
        <fieldset className="mb-5">
          <legend className="mb-2 font-semibold">Size</legend>
          <div className="flex flex-col gap-2">
            {dish.sizes.map((entry) => (
              <Choice key={entry._id} type="radio" name="size" checked={entry._id === pick.sizeId} onChange={() => setPick({ ...pick, sizeId: entry._id })} label={entry.name || 'Regular'} price={formatRs(entry.price)} />
            ))}
          </div>
        </fieldset>
      )}

      {groups.map((group) => (
        <fieldset key={group._id} className="mb-5">
          <legend className="mb-2 flex w-full items-baseline justify-between gap-3 font-semibold">
            {group.name}
            <span className={`text-sm font-normal ${group.min > 0 ? 'text-chili' : 'text-ink-3'}`}>{rule(group)}</span>
          </legend>
          <div className="flex flex-col gap-2">
            {group.options.map((option) => (
              <Choice
                key={option._id}
                type={group.max === 1 ? 'radio' : 'checkbox'}
                name={group._id}
                checked={pick.addonIds.includes(option._id)}
                onChange={() => toggle(group, option._id)}
                label={option.name}
                price={option.price ? `+ ${formatRs(option.price)}` : 'Free'}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <label className="flex flex-col gap-1.5 font-semibold">
        Note for the kitchen (optional)
        <input
          value={pick.note}
          onChange={(event) => setPick({ ...pick, note: event.target.value })}
          maxLength={200}
          placeholder="Less spicy, no onion…"
          className="min-h-12 rounded-control border-2 border-rule bg-paper px-3.5 text-base font-normal outline-none focus:border-indigo"
        />
      </label>
    </BottomSheet>
  );
}

function Choice({ type, name, checked, onChange, label, price }: { type: 'radio' | 'checkbox'; name: string; checked: boolean; onChange: () => void; label: string; price: string }) {
  return (
    <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border-2 bg-paper px-3.5 ${checked ? 'border-indigo' : 'border-rule'}`}>
      {/* A radio in a one-choice group can still be taken off: tapping it again clears it. */}
      <input type={type} name={name} checked={checked} onChange={onChange} onClick={type === 'radio' && checked && name !== 'size' ? onChange : undefined} className="size-5 accent-indigo" />
      <span className="flex-1">{label}</span>
      <span className="text-sm tabular-nums text-ink-2">{price}</span>
    </label>
  );
}

export default withOverlay(DishDialog);
