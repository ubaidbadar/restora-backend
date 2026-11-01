/** Home's "This branch / All branches" switch, as the app draws its tabs: a grey track, the picked one raised in white. */
export default function BranchTabs() {
  return (
    <div className="mx-4 mt-3 flex w-fit gap-0.5 rounded-control bg-rule/55 p-0.5 text-[0.62rem] font-semibold">
      <span className="rounded-[8px] bg-paper px-2.5 py-1 text-ink shadow-[0_1px_2px_rgb(18_21_46/0.12)]">This branch</span>
      <span className="px-2.5 py-1 text-ink-2">All branches</span>
    </div>
  );
}
