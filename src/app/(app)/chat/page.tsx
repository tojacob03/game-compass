import { ChatClient } from "@/components/ChatClient";
import { requireUser } from "@/lib/session";

export default async function ChatPage() {
  const user = await requireUser();
  return <ChatClient userName={user.display_name} />;
}
