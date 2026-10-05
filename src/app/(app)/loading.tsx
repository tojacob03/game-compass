/** Sofort sichtbarer Platzhalter beim Seitenwechsel – der Header bleibt stehen, nur der Inhalt lädt. */
export default function Loading() {
  const shimmer = "animate-shimmer bg-[linear-gradient(90deg,var(--surface)_0%,var(--surface-2)_50%,var(--surface)_100%)] bg-[length:200%_100%]";
  return (
    <div className="space-y-10" aria-busy="true" aria-label="Lädt">
      <div className="space-y-4">
        <div className={`h-3 w-48 rounded-full ${shimmer}`} />
        <div className={`h-12 w-full max-w-xl rounded-2xl ${shimmer}`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`h-52 rounded-2xl border border-line ${shimmer}`} style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>
  );
}
