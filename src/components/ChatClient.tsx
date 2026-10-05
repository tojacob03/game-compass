"use client";

import dynamic from "next/dynamic";

const Chat = dynamic(() => import("./Chat"), {
  ssr: false,
  loading: () => <p className="text-sm text-muted">Lade Chat …</p>,
});

export function ChatClient({ userName }: { userName: string }) {
  return <Chat userName={userName} />;
}
