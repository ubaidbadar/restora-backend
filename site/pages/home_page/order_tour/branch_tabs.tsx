/**
 * Home's "This branch / All branches" switch, as the app's `ui/tabs` draws it at two thirds of its size: a sunken grey
 * track with a hairline edge, the picked option raised in white. Corners as the app's (8px track, 6px option, scaled).
 */
export default function BranchTabs() {
  return (
    <div className="mx-4 mt-3 flex w-fit gap-0.5 rounded-[5px] border border-app-border bg-app-sunken p-0.5 text-[0.62rem] font-medium text-app-body">
      <span className="rounded-[4px] bg-paper px-2.5 py-1 font-semibold text-ink shadow-[0_0_0_1px_var(--color-app-border)]">This branch</span>
      <span className="px-2.5 py-1">All branches</span>
    </div>
  );
}
