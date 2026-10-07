"use client";

import { Compass, Home, Library, MessageCircle, Settings, Sparkles, Tag, Users, Zap, Fingerprint } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";

const ICONS = {
  today: Home,
  discover: Compass,
  deals: Tag,
  rate: Zap,
  chat: MessageCircle,
  library: Library,
  profile: Fingerprint,
  groups: Users,
  admin: Settings,
  sparkles: Sparkles,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; primary?: boolean; badge?: number };

function isActive(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

export function NavLinks({ links }: { links: NavItem[] }) {
  const path = usePathname();
  return (
    <LayoutGroup id="nav">
      <nav className="hidden items-center gap-0.5 md:flex">
        {links.map((l) => {
          const on = isActive(path, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`relative whitespace-nowrap rounded-full px-3 py-1.5 text-[13.5px] transition-colors ${on ? "text-text" : "text-muted hover:text-text"}`}
            >
              {on && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-white/[0.07]"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              {l.label}
              {!!l.badge && <span className="ml-1.5 font-mono text-[10px] text-accent">{l.badge}</span>}
            </Link>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}

/** Tab-Leiste unten auf dem Handy – nur die Hauptbereiche. */
export function MobileTabBar({ links }: { links: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-3 bottom-3 z-30 rounded-2xl border border-line bg-bg/85 pb-[env(safe-area-inset-bottom)] shadow-2xl shadow-black/60 backdrop-blur-xl md:hidden">
      <LayoutGroup id="mobile-nav">
        <div className="grid grid-cols-5">
          {links
            .filter((l) => l.primary)
            .map((l) => {
              const on = isActive(path, l.href);
              const Icon = ICONS[l.icon];
              return (
                <Link key={l.href} href={l.href} className={`relative flex flex-col items-center gap-1 py-2.5 text-[10.5px] ${on ? "text-text" : "text-muted"}`}>
                  {on && <motion.span layoutId="mtab" className="absolute inset-1 -z-10 rounded-xl bg-white/[0.07]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <Icon size={19} strokeWidth={1.6} className={on ? "text-accent" : ""} />
                  {l.label}
                  {!!l.badge && <span className="absolute right-[26%] top-2 h-1.5 w-1.5 rounded-full bg-accent" />}
                </Link>
              );
            })}
        </div>
      </LayoutGroup>
    </nav>
  );
}
