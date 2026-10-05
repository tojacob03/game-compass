import { GroupForms, LeaveGroupButton } from "@/components/GroupForms";
import { db, must } from "@/lib/db";
import { requireUser } from "@/lib/session";

type GroupRow = {
  group_id: string;
  groups: {
    id: string;
    name: string;
    is_steam_family: boolean;
    invite_code: string;
    group_members: { users: { display_name: string; avatar_url: string | null } }[];
  };
};

export default async function Groups() {
  const user = await requireUser();
  const rows = must(
    await db()
      .from("group_members")
      .select("group_id, groups!inner(id, name, is_steam_family, invite_code, group_members(users(display_name, avatar_url)))")
      .eq("user_id", user.id),
    "groups.list",
  ) as unknown as GroupRow[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="h1">Gruppen</h1>
        <p className="text-muted">
          In Gruppen seht ihr gegenseitig eure Bewertungen. Hoch bewertete Spiele deiner Freunde fließen als Kandidaten in deine
          Empfehlungen ein. In einer Steam-Familie siehst du zusätzlich, was du dir über die Familie leihen kannst.
        </p>
      </div>
      {rows.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ groups: g }) => (
            <section key={g.id} className="card space-y-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="h2">{g.name}</h2>
                {g.is_steam_family && <span className="chip !border-good !text-good">Steam-Familie</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {g.group_members.map((m, i) => (
                  <span key={i} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pl-0.5 pr-2.5 text-sm">
                    {m.users.avatar_url && <img src={m.users.avatar_url} alt="" className="h-5 w-5 rounded-full" />}
                    {m.users.display_name}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">
                  Einladungscode: <code className="rounded bg-bg px-1.5 py-0.5 font-mono text-text">{g.invite_code}</code>
                </span>
                <LeaveGroupButton groupId={g.id} />
              </div>
            </section>
          ))}
        </div>
      )}
      <GroupForms />
      <p className="text-xs text-muted">
        Hinweis: Neue Freunde müssen sich zuerst mit Steam anmelden und vom Admin freigeschaltet werden, bevor sie einer Gruppe
        beitreten können.
      </p>
    </div>
  );
}
