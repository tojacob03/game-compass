"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; primary?: boolean; badge?: number };

function isActive(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

export function NavLinks({ links }: { links: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="hidden gap-1 md:flex">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`relative whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
            isActive(path, l.href) ? "bg-surface-2 text-text" : "text-muted hover:text-text"
          }`}
        >
          {l.label}
          {!!l.badge && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-ink">{l.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Tab-Leiste unten auf dem Handy – nur die Hauptbereiche. */
export function MobileTabBar({ links }: { links: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {links
          .filter((l) => l.primary)
          .map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive(path, l.href) ? "text-accent" : "text-muted"}`}
            >
              <span className="text-lg leading-none">{l.icon}</span>
              {l.label}
              {!!l.badge && <span className="absolute right-[22%] top-1 h-2 w-2 rounded-full bg-accent" />}
            </Link>
          ))}
      </div>
    </nav>
  );
}
