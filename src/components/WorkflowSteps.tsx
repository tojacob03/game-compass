import { ArrowRight } from "lucide-react";
import Link from "next/link";

export type Step = { href: string; title: string; role: string; status: string; highlight?: boolean };

/**
 * Die drei Stellschrauben auf einen Blick: Was gibt man wo ein – und was ist gerade offen?
 * 01 Bewerten (was du gespielt hast) · 02 Feinjustieren (was dir wichtig ist) · 03 Entdecken (Reaktion auf Vorschläge)
 */
export function WorkflowSteps({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid divide-y divide-line border-y border-line md:grid-cols-3 md:divide-x md:divide-y-0">
      {steps.map((s, i) => (
        <li key={s.href} data-reveal>
          <Link href={s.href} className="group flex h-full flex-col gap-2 py-5 transition md:px-5 md:first:pl-0 md:last:pr-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs text-muted tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <ArrowRight size={15} className="text-muted transition group-hover:translate-x-1 group-hover:text-text" />
            </div>
            <div className="font-display text-xl font-medium transition group-hover:text-accent">{s.title}</div>
            <p className="text-sm text-muted">{s.role}</p>
            <p className={`mt-auto pt-1 text-sm ${s.highlight ? "text-accent" : "text-text/80"}`}>{s.status}</p>
          </Link>
        </li>
      ))}
    </ol>
  );
}
