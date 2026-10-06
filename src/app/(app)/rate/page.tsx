import { QuickRate } from "@/components/QuickRate";
import { requireUser } from "@/lib/session";

export default async function RatePage() {
  await requireUser();
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-xl">
        <p className="eyebrow">Schritt 01</p>
        <h1 className="h1 mt-1">Bewerten</h1>
        <p className="text-muted">
          Was du gespielt hast – ein Tipp pro Spiel, optional antippen, was gepackt oder gestört hat. Die aufschlussreichsten
          Spiele kommen zuerst. Wirkt sofort aufs Ranking.
        </p>
      </div>
      <QuickRate />
    </div>
  );
}
