import { Menu, X } from 'lucide-react';
import NAV_LINKS from '../../constants/nav_links';
import appLink from '../../utils/app_link';

/**
 * Phones: the pages behind a menu button. A native <details>, so it opens with no script at all; every link loads a
 * new page, so it is closed again there.
 */
export default function MobileMenu({ path }: { path: string }) {
  return (
    <details className="group md:hidden">
      <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-control text-ink [&::-webkit-details-marker]:hidden" aria-label="Menu">
        <Menu className="size-6 group-open:hidden" aria-hidden="true" />
        <X className="hidden size-6 group-open:block" aria-hidden="true" />
      </summary>
      <nav aria-label="Main" className="absolute inset-x-0 top-16 h-[calc(100dvh-4rem)] bg-canvas px-5 pt-4">
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} aria-current={path === link.href ? 'page' : undefined} className="display flex min-h-16 items-center border-b border-rule text-[2rem] text-ink aria-[current=page]:text-indigo">
            {link.label}
          </a>
        ))}
        <a href={appLink('/login', 'menu')} className="mt-6 flex min-h-12 items-center text-lg font-semibold text-ink-2">
          Sign in to Restora
        </a>
      </nav>
    </details>
  );
}
