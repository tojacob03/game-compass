import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export default async function Pending() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.status === "active") redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-4">
      <h1 className="h1">{user.status === "blocked" ? "Zugang gesperrt" : `Fast geschafft, ${user.display_name}!`}</h1>
      <p className="text-muted">
        {user.status === "blocked"
          ? "Dein Account wurde gesperrt."
          : "GameCompass ist gerade nur für einen kleinen Freundeskreis. Sag dem Admin Bescheid – sobald du freigeschaltet bist, kannst du loslegen."}
      </p>
      <p className="text-xs text-muted">Deine SteamID: {user.steam_id}</p>
      <form action="/api/auth/logout" method="post">
        <button className="btn-ghost">Abmelden</button>
      </form>
    </main>
  );
}
