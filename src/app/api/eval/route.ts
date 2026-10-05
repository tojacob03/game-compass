import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { evaluateHoldout } from "@/lib/eval";
import { requireApiUser } from "@/lib/session";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    return NextResponse.json(await evaluateHoldout(user));
  } catch (err) {
    return handleApiError(err);
  }
}
