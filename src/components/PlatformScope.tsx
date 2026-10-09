import Link from "next/link";
import { isRestricted, normalizePlatforms, platformLabel } from "@/lib/platforms";

/** Hinweis "Nur Spiele für Mac · GeForce NOW – ändern" auf Seiten, die nach Plattform filtern. */
export function PlatformScope({ platforms }: { platforms: string[] }) {
  const keys = normalizePlatforms(platforms);
  return (
    <p className="text-xs text-muted">
      {isRestricted(keys) ? "Nur Spiele für " : "Plattformen: "}
      <span className="text-text">{keys.map(platformLabel).join(" · ")}</span>{" "}
      <Link href="/profile#plattformen" className="underline decoration-line-strong underline-offset-4 hover:text-text">
        ändern
      </Link>
    </p>
  );
}
