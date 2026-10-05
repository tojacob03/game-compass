import { AdminUserActions } from "@/components/AdminUserActions";
import { db, must } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import type { UserRow } from "@/lib/types";

export default async function Admin() {
  const admin = await requireAdmin();
  const users = must(await db().from("users").select("*").order("created_at", { ascending: false }), "users.list") as UserRow[];
  const { data: usage } = await db().from("ai_usage").select("user_id, kind, units").eq("day", new Date().toISOString().slice(0, 10));
  const usageMap = new Map<string, string>();
  for (const u of (usage ?? []) as { user_id: string; kind: string; units: number }[]) {
    const prev = usageMap.get(u.user_id);
    const part = `${u.kind === "analysis" ? "Analyse" : "Interaktiv"} ${u.units}`;
    usageMap.set(u.user_id, prev ? `${prev} · ${part}` : part);
  }
  const { count: games } = await db().from("games").select("id", { count: "exact", head: true });
  const { count: analyzed } = await db().from("games").select("id", { count: "exact", head: true }).not("analyzed_at", "is", null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Admin</h1>
        <p className="text-muted">
          Katalog: {games ?? 0} Spiele, davon {analyzed ?? 0} analysiert.
        </p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="p-3">Nutzer</th>
              <th className="p-3">SteamID</th>
              <th className="p-3">Status</th>
              <th className="p-3">KI heute</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="flex items-center gap-2 p-3">
                  {u.avatar_url && <img src={u.avatar_url} alt="" className="h-6 w-6 rounded-full" />}
                  {u.display_name} {u.is_admin && <span className="chip">Admin</span>}
                </td>
                <td className="p-3 font-mono text-xs text-muted">{u.steam_id}</td>
                <td className={`p-3 ${u.status === "pending" ? "text-accent" : u.status === "blocked" ? "text-bad" : ""}`}>{u.status}</td>
                <td className="p-3 text-muted">{usageMap.get(u.id) ?? 0}</td>
                <td className="p-3">{u.id !== admin.id && <AdminUserActions userId={u.id} status={u.status} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
