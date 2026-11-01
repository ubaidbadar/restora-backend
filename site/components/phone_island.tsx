/** The camera island of every phone the site draws, placed in the phone's body (`phone`): small, so the status bar reads round it. */
export default function PhoneIsland({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`absolute top-[calc(var(--phone-bezel)+0.625rem)] left-1/2 z-10 h-[1.15rem] w-14 -translate-x-1/2 rounded-full bg-ink ${className}`} />;
}
