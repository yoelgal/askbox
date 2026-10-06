import { badRequest, jsonError } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { z } from "zod";
import { answered, deleteCreatorData, getCreator, inbox, stats, updateCreatorSettings } from "@/lib/db";
import { creatorGuard } from "@/lib/fanvue";

export async function GET(req: Request) {
  const g = await creatorGuard(req);
  if (!g.ok) return g.response;
  const creator = await getCreator(g.session.subjectId);
  if (!creator) return jsonError(404, "not_found", "Reopen Askbox from Fanvue.");
  return Response.json({
    creator,
    inbox: await inbox(creator.uuid),
    answered: await answered(creator.uuid),
    stats: await stats(creator.uuid),
  });
}

const Hours = z.number().int().min(1).max(24 * 14);
const Settings = z.object({
  voice: z.string().max(2000),
  boundaries: z.string().max(2000),
  replyHours: z.object({ question: Hours, priority: Hours }),
});

export async function PATCH(req: Request) {
  const g = await creatorGuard(req);
  if (!g.ok) return g.response;
  const parsed = Settings.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Expected { voice, boundaries, replyHours }");
  await updateCreatorSettings(g.session.subjectId, parsed.data);
  return Response.json({ ok: true });
}

/** "Delete my data": erases the creator's Askbox data. Fanvue itself keeps the experience until they unpublish it. */
export async function DELETE(req: Request) {
  const g = await creatorGuard(req);
  if (!g.ok) return g.response;
  await deleteCreatorData(g.session.subjectId);
  return Response.json({ ok: true });
}
