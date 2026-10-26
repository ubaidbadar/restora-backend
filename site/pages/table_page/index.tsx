import { useEffect, useRef, useState } from 'react';
import useCartStore from '../../store/cart_store';
import type TableMenu from '../../types/table_menu';
import type TableOrder from '../../types/table_order';
import ActiveOrders from './active_orders';
import CartBar from './cart_bar';
import DishCard from './dish_card';
import OffersCard from './offers_card';

/**
 * What a guest's phone opens from a table's QR code: no app, no sign-in. The menu comes with the page from the server,
 * fresh on every visit; only the cart and the call buttons run in the browser.
 */
export default function TablePage({ code, menu }: { code: string; menu: TableMenu }) {
  // The cart lives in this tab, so the server renders it empty and the browser fills it in.
  useEffect(() => useCartStore.getState().load(code), [code]);

  const [orders, setOrders] = useState<TableOrder[]>(menu.orders ?? []);

  // Connects to the SSE stream in the browser and keeps table orders live in real time.
  useEffect(() => {
    setOrders(menu.orders ?? []);
    if (typeof EventSource === 'undefined') return;

    let source: EventSource | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const reload = async () => {
      try {
        const res = await fetch(`/api/v1/public/t/${code}/orders`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) setOrders(data);
        }
      } catch {}
    };

    const upsert = (order: TableOrder) => {
      setOrders((current) => {
        const idx = current.findIndex((o) => o._id === order._id);
        return idx >= 0 ? current.map((o) => (o._id === order._id ? order : o)) : [...current, order];
      });
    };

    const connect = () => {
      if (stopped) return;
      source?.close();
      try {
        source = new EventSource(`/api/v1/public/t/${code}/stream`);
      } catch {
        return;
      }

      source.addEventListener('order.created', (event) => {
        try {
          const order: TableOrder = JSON.parse(event.data);
          upsert(order);
          navigator.vibrate?.([20, 50, 20]);
        } catch {}
      });

      source.addEventListener('order.updated', (event) => {
        try {
          const order: TableOrder = JSON.parse(event.data);
          upsert(order);
          navigator.vibrate?.(30);
        } catch {}
      });

      source.onopen = () => reload();

      source.onerror = () => {
        source?.close();
        if (!stopped) {
          clearTimeout(retryTimer);
          retryTimer = setTimeout(connect, 4_000);
        }
      };
    };

    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        reload();
        if (!source || source.readyState === EventSource.CLOSED) {
          clearTimeout(retryTimer);
          connect();
        }
      }
    };

    window.addEventListener('online', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      window.removeEventListener('online', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
      source?.close();
    };
  }, [code, menu.orders]);

  const groupsById = new Map(menu.addonGroups.map((group) => [group._id, group]));
  const categories = menu.categories
    .map((category) => ({ ...category, dishes: menu.items.filter((dish) => dish.categoryId === category._id) }))
    .filter((category) => category.dishes.length > 0);

  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?._id ?? '');
  const navListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || categories.length <= 1) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const navHeight = 70;
        const scrollPos = window.scrollY + navHeight + 20;

        let current = categories[0]?._id ?? '';
        for (const cat of categories) {
          const el = document.getElementById(`c-${cat._id}`);
          if (el && el.offsetTop <= scrollPos) {
            current = cat._id;
          }
        }
        setActiveCategory((prev) => (prev !== current ? current : prev));
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [categories]);

  useEffect(() => {
    if (!activeCategory || !navListRef.current) return;
    const activeBtn = navListRef.current.querySelector<HTMLElement>(`[data-category-id="${activeCategory}"]`);
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeCategory]);

  return (
    <>
      <div className="min-h-dvh pb-[calc(12rem+env(safe-area-inset-bottom))]">
        <header className="bg-night px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-6 text-white">
          <div className="mx-auto flex max-w-xl items-center gap-3.5">
            {menu.restaurant.logo && (
              <img
                src={menu.restaurant.logo}
                alt=""
                className="size-14 shrink-0 rounded-control bg-paper aspect-square object-cover object-center p-1"
              />
            )}
            <div className="min-w-0">
              <h1 className="display truncate text-[2rem]">{menu.restaurant.name}</h1>
              <p className="mt-1.5 text-[0.95rem] text-moon">
                {menu.branch.name} · <span className="rounded-slip bg-haldi px-1.5 py-0.5 font-semibold text-ink">Table {menu.table.name}</span>
              </p>
            </div>
          </div>
        </header>

        {categories.length > 1 && (
          <nav aria-label="Menu sections" className="sticky top-0 z-10 border-b border-rule bg-canvas/95 backdrop-blur">
            <ul ref={navListRef} className="mx-auto flex max-w-xl gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none]">
              {categories.map((category) => {
                const isActive = activeCategory === category._id;
                return (
                  <li key={category._id} className="shrink-0">
                    <a
                      href={`#c-${category._id}`}
                      data-category-id={category._id}
                      onClick={(e) => {
                        e.preventDefault();
                        setActiveCategory(category._id);
                        const el = document.getElementById(`c-${category._id}`);
                        if (el) {
                          const yOffset = -70;
                          const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
                          window.scrollTo({ top: y, behavior: 'smooth' });
                        }
                      }}
                      className={`inline-flex min-h-10 items-center rounded-full border px-4 text-[0.95rem] font-semibold transition-all ${
                        isActive
                          ? 'border-indigo bg-indigo text-white shadow-sm'
                          : 'border-rule bg-paper text-ink-2 hover:border-indigo hover:text-indigo'
                      }`}
                    >
                      {category.name}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <main className="mx-auto flex max-w-xl flex-col gap-8 px-4 pt-6">
          <ActiveOrders orders={orders} tableName={menu.table.name} />
          {categories.length === 0 && <p className="rounded-panel bg-paper p-6 text-center text-ink-2">The menu is being updated. Please ask a waiter.</p>}
          {categories.map((category, categoryIndex) => (
            <section key={category._id} id={`c-${category._id}`} aria-labelledby={`h-${category._id}`} className="scroll-mt-20">
              <h2 id={`h-${category._id}`} className="mb-3 text-[1.35rem] font-bold">
                {category.name}
              </h2>
              <ul className="flex flex-col gap-3">
                {category.dishes.map((dish, index) => (
                  <DishCard key={dish._id} dish={dish} priority={categoryIndex === 0 && index < 4} groups={dish.addonGroupIds.map((id) => groupsById.get(id)).filter((group) => group !== undefined)} />
                ))}
              </ul>
            </section>
          ))}
          {categories.length > 0 && <OffersCard code={code} restaurantName={menu.restaurant.name} />}
        </main>
      </div>
      <CartBar
        code={code}
        tableName={menu.table.name}
        orders={orders}
        onOrderSent={(order) => {
          setOrders((current) => {
            const idx = current.findIndex((o) => o._id === order._id);
            return idx >= 0 ? current.map((o) => (o._id === order._id ? order : o)) : [...current, order];
          });
        }}
      />
    </>
  );
}
