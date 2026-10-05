import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { chat } from "@/lib/chat";
import { requireApiUser } from "@/lib/session";

export const maxDuration = 120;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "model"]), text: z.string().min(1).max(4000) }))
    .min(1)
    .max(40),
});

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const { messages } = Body.parse(await req.json());
    if (messages[messages.length - 1].role !== "user") return NextResponse.json({ error: "Letzte Nachricht muss vom Nutzer sein" }, { status: 400 });
    return NextResponse.json(await chat(user, messages.slice(-20)));
  } catch (err) {
    return handleApiError(err);
  }
}
