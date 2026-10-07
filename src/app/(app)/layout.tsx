import Link from "next/link";
import { JobPill, JobsProvider, type Job } from "@/components/jobs";
import { driveJob, listJobs, staleJobs } from "@/lib/jobs";
import { countUnrated } from "@/lib/quickrate";
import { after } from "next/server";
import { requireUser } from "@/lib/session";
import { Logo } from "@/components/ui/Logo";
import { MobileTabBar, NavLinks, type NavItem } from "./NavLinks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unrated, jobs] = await Promise.all([countUnrated(user.id).catch(() => 0), listJobs(user.id)]);
  // Abgerissene Job-Ketten beim Seitenaufruf wieder anstoßen
  const stale = staleJobs(jobs);
  if (stale.length) after(() => Promise.all(stale.map((j) => driveJob(j.id))));
  const links: NavItem[] = [
    { href: "/dashboard", label: "Heute", icon: "today", primary: true },
    { href: "/recommendations", label: "Entdecken", icon: "discover", primary: true },
    { href: "/deals", label: "Deals", icon: "deals" },
    { href: "/rate", label: "Bewerten", icon: "rate", primary: true, badge: unrated },
    { href: "/profile", label: "Geschmack", icon: "profile", primary: true },
    { href: "/chat", label: "Chat", icon: "chat", primary: true },
    { href: "/library", label: "Bibliothek", icon: "library" },
    { href: "/groups", label: "Gruppen", icon: "groups" },
    ...(user.is_admin ? [{ href: "/admin", label: "Admin", icon: "admin" as const }] : []),
  ];

  return (
    <JobsProvider initial={jobs as Job[]}>
    <div className="relative min-h-screen pb-24 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3.5">
          <Link href="/dashboard" className="shrink-0 text-text">
            <Logo />
          </Link>
          <NavLinks links={links} />
          <div className="ml-auto flex items-center gap-3">
            <JobPill />
            <Link href="/deals" className="text-xs text-muted hover:text-text md:hidden">
              Deals
            </Link>
            <Link href="/library" className="text-xs text-muted hover:text-text md:hidden">
              Bibliothek
            </Link>
            <Link href="/groups" className="text-xs text-muted hover:text-text md:hidden">
              Gruppen
            </Link>
            {user.avatar_url && <img src={user.avatar_url} alt="" title={user.display_name} className="h-7 w-7 rounded-full ring-1 ring-line-strong" />}
            <form action="/api/auth/logout" method="post">
              <button className="text-xs text-muted transition hover:text-text" title="Abmelden">
                Abmelden
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl px-4 py-6 md:py-10">{children}</main>
      <MobileTabBar links={links} />
    </div>
    </JobsProvider>
  );
}
