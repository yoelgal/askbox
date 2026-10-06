import { badRequest } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { setTheme } from "@/lib/db";
import { creatorGuard } from "@/lib/fanvue";
import { ThemeSchema } from "@/lib/theme";

export async function PUT(req: Request) {
  const g = await creatorGuard(req);
  if (!g.ok) return g.response;
  const parsed = ThemeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Pick a colour and a cover, and keep the headline under 60 characters.");
  await setTheme(g.session.subjectId, parsed.data);
  return Response.json({ ok: true });
}
