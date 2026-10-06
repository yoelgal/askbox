import { jsonError } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { checkPassword, ensureDemo, issueDemoToken, sweepDemos } from "@/lib/demo";

/** The demo's front door: the right password buys a 14-day demo token. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  if (typeof body?.password !== "string" || !checkPassword(body.password.trim())) {
    await new Promise((r) => setTimeout(r, 800)); // slows guessing
    return jsonError(401, "wrong_password", "That password isn't right. Check it and try again.");
  }
  await sweepDemos().catch((e) => console.error("[askbox] demo sweep failed", e));
  // Seed here, once, so the dashboard and fan view don't both seed the new sandbox at the same time.
  const token = issueDemoToken();
  await ensureDemo(token.split(".")[0]!);
  return Response.json({ token });
}
