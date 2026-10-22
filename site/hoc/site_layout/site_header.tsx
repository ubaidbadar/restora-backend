import NAV_LINKS from '../../constants/nav_links';
import appLink from '../../utils/app_link';
import Button from '../../ui/button';
import Logo from '../../components/logo';
import MobileMenu from './mobile_menu';

/** The top of every page: logo, pages, Sign in and Start free. On phones the pages are behind a menu button. */
export default function SiteHeader({ path }: { path: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-rule/70 bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[76rem] items-center gap-8 px-5 sm:px-8">
        <Logo />
        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="rounded-control px-3 py-2 text-[0.95rem] font-medium text-ink-2 hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1 sm:gap-3">
          <a href={appLink('/login', 'header')} className="hidden px-3 py-2 text-[0.95rem] font-medium text-ink-2 hover:text-ink sm:block">
            Sign in
          </a>
          <Button as="a" href={appLink('/signup', 'header')}>Start free</Button>
          <MobileMenu path={path} />
        </div>
      </div>
    </header>
  );
}
