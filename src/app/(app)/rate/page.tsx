import { QuickRate } from "@/components/QuickRate";
import { requireUser } from "@/lib/session";

export default async function RatePage() {
  await requireUser();
  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-xl">
        <h1 className="h1">Schnell bewerten</h1>
        <p className="text-muted">Ein Tipp pro Spiel. Die Spiele, die am meisten über deinen Geschmack verraten, kommen zuerst.</p>
      </div>
      <QuickRate />
    </div>
  );
}
