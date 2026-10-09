import Link from "next/link";
import { QuickRate } from "@/components/QuickRate";
import { StarterRate } from "@/components/StarterRate";
import { countUnrated } from "@/lib/quickrate";
import { requireUser } from "@/lib/session";
import { signalCount, STARTER_TARGET } from "@/lib/starter";

export default async function RatePage(props: PageProps<"/rate">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const [signals, unrated] = await Promise.all([signalCount(user.id), countUnrated(user.id)]);
  // Starter-Runde: bei wenig Daten automatisch, sonst auf Wunsch (?mehr=1)
  const starter = signals < STARTER_TARGET || sp.mehr === "1";
  return (
    <div className="space-y-10">
      <div className="mx-auto max-w-xl">
        <p className="eyebrow">Schritt 01</p>
        <h1 className="h1 mt-1">Bewerten</h1>
        <p className="text-muted">
          {starter && unrated === 0
            ? "Wenig auf Steam? Kein Problem – bewerte Spiele, die du von irgendwoher kennst. Ein Tipp pro Spiel."
            : "Was du gespielt hast – ein Tipp pro Spiel, optional antippen, was gepackt oder gestört hat. Die aufschlussreichsten Spiele kommen zuerst. Wirkt sofort aufs Ranking."}
        </p>
      </div>
      {(unrated > 0 || !starter) && <QuickRate />}
      {starter ? (
        <StarterRate initialSignals={signals} target={STARTER_TARGET} />
      ) : (
        <p className="text-center text-sm text-muted">
          Lust auf mehr?{" "}
          <Link href="/rate?mehr=1" className="underline hover:text-text">
            Bekannte Spiele bewerten, die du nicht auf Steam hast
          </Link>
        </p>
      )}
    </div>
  );
}
