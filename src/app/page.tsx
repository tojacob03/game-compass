import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

const PILLARS = [
  {
    title: "Das Warum statt das Was",
    text: "Jedes Spiel wird aus Store-Text und echten Reviews auf seine Essenz destilliert: Fortschritt durch Wissen, melancholische Weite, Chaos mit Freunden … Genre ist zweitrangig.",
  },
  {
    title: "Dein Geschmack in Facetten",
    text: "Deine Bewertungen, eigenen Worte und Spielzeiten werden zu mehreren Geschmacks-Facetten – statt zu einem Durchschnittsbrei.",
  },
  {
    title: "Ehrliche Empfehlungen",
    text: "Mit Begründung in deinen Worten, Risiken, die dich stören könnten, und mutigen Wildcards aus ganz anderen Genres.",
  },
];

export default async function Home(props: PageProps<"/">) {
  const user = await getSessionUser();
  if (user?.status === "active") redirect("/dashboard");
  if (user) redirect("/pending");
  const { login_error } = await props.searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center gap-12 px-4 py-16">
      <div className="space-y-5">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">GameCompass</p>
        <h1 className="font-display text-4xl font-semibold leading-tight sm:text-6xl">
          Spiele, die dich packen –<br />
          <span className="text-accent">weil</span> du verstehst, was dich packt.
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          Verbinde deine Steam-Bibliothek, Wunschliste und Steam-Familie, trag Spiele von anderen Plattformen ein und erzähl in
          eigenen Worten, was dir gefällt. Die KI findet daraus, was dich wirklich antreibt.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <a href="/api/auth/steam" className="btn-primary !px-6 !py-3 !text-base">
            Mit Steam anmelden
          </a>
          <span className="text-xs text-muted">Kein Passwort bei uns – Login läuft direkt über Steam.</span>
        </div>
        {typeof login_error === "string" && <p className="text-sm text-bad">{login_error}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} className="card space-y-2 p-5">
            <h2 className="font-display text-lg font-semibold">{p.title}</h2>
            <p className="text-sm text-muted">{p.text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
