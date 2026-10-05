import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Aurora } from "@/components/ui/Aurora";
import { GameImage } from "@/components/ui/GameImage";
import { Marquee } from "@/components/ui/Marquee";
import { SplitHeadline } from "@/components/ui/SplitHeadline";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

const PILLARS = [
  {
    title: "Das Warum statt das Was",
    text: "Jedes Spiel wird aus Store-Text und echten Reviews auf seine Essenz destilliert – Fortschritt durch Wissen, melancholische Weite, Chaos mit Freunden. Genre ist zweitrangig.",
  },
  {
    title: "Deine Spielmodi",
    text: "Abends Story, sonntags Soulslike, nebenbei Idle: GameCompass erkennt deine Modi automatisch – jeder mit eigenen Vorlieben und No-Gos.",
  },
  {
    title: "Ehrliche Empfehlungen",
    text: "Mit Begründung in deinen Worten, Risiken, die dich stören könnten, und mutigen Wildcards aus ganz anderen Genres.",
  },
];

type Cover = { id: string; title: string; capsule_image: string | null; header_image: string | null };

async function showcaseCovers(): Promise<Cover[]> {
  try {
    const { data } = await db()
      .from("games")
      .select("id, title, capsule_image, header_image")
      .not("capsule_image", "is", null)
      .not("analyzed_at", "is", null)
      .gt("review_positive", 2000)
      .order("review_positive", { ascending: false })
      .limit(28);
    return (data ?? []) as Cover[];
  } catch {
    return [];
  }
}

export default async function Home(props: PageProps<"/">) {
  const user = await getSessionUser();
  if (user?.status === "active") redirect("/dashboard");
  if (user) redirect("/pending");
  const { login_error } = await props.searchParams;
  const covers = await showcaseCovers();
  const rows = [covers.filter((_, i) => i % 2 === 0), covers.filter((_, i) => i % 2 === 1)];

  return (
    <main className="relative isolate min-h-screen overflow-hidden">
      <Aurora />
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-6">
        <Logo />
        <a href="/api/auth/steam" className="text-sm text-muted transition hover:text-text">
          Anmelden
        </a>
      </header>
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-10 pt-16 sm:pt-24">
        <div className="space-y-7">
          <p className="eyebrow">Spiele-Empfehlungen für dich und deine Freunde</p>
          <SplitHeadline className="max-w-4xl font-display text-5xl font-medium leading-[1.0] tracking-[-0.035em] sm:text-[5.5rem]">
            Spiele, die dich packen – <span className="italic text-accent">weil</span> du verstehst, was dich packt.
          </SplitHeadline>
          <p className="max-w-2xl text-lg text-muted">
            Verbinde Steam-Bibliothek, Wunschliste und Steam-Familie, bewerte mit einem Tipp – die KI findet heraus, was dich in
            welcher Stimmung wirklich antreibt.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a href="/api/auth/steam" className="btn-primary !px-6 !py-3 !text-base">
              Mit Steam anmelden <ArrowRight size={16} />
            </a>
            <span className="text-xs text-muted">Kein Passwort bei uns – Login läuft direkt über Steam.</span>
          </div>
          {typeof login_error === "string" && <p className="text-sm text-bad">{login_error}</p>}
        </div>
      </div>

      {covers.length > 8 && (
        <div className="space-y-4 py-6 [transform:perspective(1400px)_rotateX(12deg)]">
          {rows.map((row, ri) => (
            <Marquee key={ri} reverse={ri === 1} duration={ri === 1 ? 80 : 70}>
              {row.map((c) => (
                <GameImage
                  key={c.id}
                  src={c.capsule_image}
                  fallbackSrc={c.header_image}
                  title={c.title}
                  className="h-52 w-36 shrink-0 rounded-xl ring-1 ring-white/10 sm:h-60 sm:w-40"
                />
              ))}
            </Marquee>
          ))}
        </div>
      )}

      <div className="mx-auto grid max-w-5xl gap-4 px-4 pb-24 pt-10 sm:grid-cols-3">
        {PILLARS.map((p, i) => (
          <SpotlightCard key={p.title} className="p-6">
            <p className="eyebrow">{String(i + 1).padStart(2, "0")}</p>
            <h2 className="mt-6 font-display text-2xl font-medium leading-tight tracking-[-0.01em]">{p.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">{p.text}</p>
          </SpotlightCard>
        ))}
      </div>
    </main>
  );
}
