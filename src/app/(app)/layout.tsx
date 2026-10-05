import Link from "next/link";
import { JobPill, JobsProvider, type Job } from "@/components/jobs";
import { driveJob, listJobs, staleJobs } from "@/lib/jobs";
import { countUnrated } from "@/lib/quickrate";
import { after } from "next/server";
import { requireUser } from "@/lib/session";
import { MobileTabBar, NavLinks, type NavItem } from "./NavLinks";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unrated, jobs] = await Promise.all([countUnrated(user.id).catch(() => 0), listJobs(user.id)]);
  // Abgerissene Job-Ketten beim Seitenaufruf wieder anstoßen
  const stale = staleJobs(jobs);
  if (stale.length) after(() => Promise.all(stale.map((j) => driveJob(j.id))));
  const links: NavItem[] = [
    { href: "/dashboard", label: "Heute", icon: "🧭", primary: true },
    { href: "/recommendations", label: "Entdecken", icon: "✨", primary: true },
    { href: "/rate", label: "Bewerten", icon: "⚡", primary: true, badge: unrated },
    { href: "/chat", label: "Chat", icon: "💬", primary: true },
    { href: "/library", label: "Bibliothek", icon: "📚", primary: true },
    { href: "/profile", label: "Mein Geschmack", icon: "🧬" },
    { href: "/groups", label: "Gruppen", icon: "👥" },
    ...(user.is_admin ? [{ href: "/admin", label: "Admin", icon: "🛠" }] : []),
  ];

  return (
    <JobsProvider initial={jobs as Job[]}>
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/dashboard" className="font-display text-lg font-semibold text-accent">
            GameCompass
          </Link>
          <NavLinks links={links} />
          <div className="ml-auto flex items-center gap-3">
            <JobPill />
            <Link href="/profile" className="text-xs text-muted hover:text-text md:hidden">
              Profil
            </Link>
            <Link href="/groups" className="text-xs text-muted hover:text-text md:hidden">
              Gruppen
            </Link>
            {user.avatar_url && <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full ring-1 ring-line" />}
            <form action="/api/auth/logout" method="post">
              <button className="text-xs text-muted hover:text-text">Abmelden</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">{children}</main>
      <MobileTabBar links={links} />
    </div>
    </JobsProvider>
  );
}
