import { badRequest, jsonError, notFound } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { z } from "zod";
import { closeQuestion, getCreator, getQuestion, pastAnswers, reopenQuestion, saveDraft } from "@/lib/db";
import { draftAnswer } from "@/lib/ai";
import { isDemo } from "@/lib/demo";
import { creatorAccessToken, creatorGuard, fanvue } from "@/lib/fanvue";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("draft") }),
  z
    .object({
      action: z.literal("answer"),
      text: z.string().trim().max(4000),
      // Base64 so the whole answer is one JSON call; ~3 MB covers a few minutes of opus.
      audio: z
        .object({
          data: z.string().max(4_000_000),
          mime: z.string().regex(/^audio\/[\w.+-]+(;.*)?$/),
          ms: z.number().int().min(500).max(5 * 60_000),
        })
        .nullable(),
    })
    .refine((b) => b.text || b.audio, "Write an answer or record one"),
  z.object({ action: z.literal("decline") }),
  z.object({ action: z.literal("undo") }),
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await creatorGuard(req);
  if (!g.ok) return g.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Unknown action");

  const q = await getQuestion((await ctx.params).id);
  if (!q || q.creatorUuid !== g.session.subjectId) return notFound();
  const creator = (await getCreator(q.creatorUuid))!;
  const body = parsed.data;

  if (body.action === "draft") {
    try {
      const draft = await draftAnswer(creator, q, await pastAnswers(creator.uuid));
      await saveDraft(q.id, draft);
      return Response.json({ draft });
    } catch (e) {
      console.error("[askbox] draft failed", e);
      return jsonError(502, "draft_failed", "Couldn't write a draft just now. Try again, or write your own.");
    }
  }

  if (body.action === "undo") {
    await reopenQuestion(q.id);
    return Response.json({ ok: true });
  }

  const closed =
    body.action === "answer"
      ? await closeQuestion(
          q.id,
          "answered",
          body.text || null,
          Date.now(),
          body.audio ? { data: Buffer.from(body.audio.data, "base64"), mime: body.audio.mime, ms: body.audio.ms } : null,
        )
      : await closeQuestion(q.id, "declined", null);
  if (!closed) return jsonError(409, "already_closed", "This one's already been handled.");

  // The answer always shows in the fan's Askbox. A DM is the notification;
  // if it fails the answer still stands.
  let dmSent = false;
  if (body.action === "answer" && !isDemo(creator.uuid)) {
    try {
      const token = await creatorAccessToken(creator.uuid);
      if (token) {
        await fanvue(token, `/v1/chats/${q.fanUuid}/message`, {
          method: "POST",
          body: {
            text: body.audio
              ? `You asked: “${q.body}”\n\n${creator.displayName} sent you a voice answer. Open Askbox on their profile to listen.${body.text ? `\n\n${body.text}` : ""}`
              : `You asked: “${q.body}”\n\n${body.text}`,
          },
        });
        dmSent = true;
      }
    } catch (e) {
      console.error("[askbox] answer DM failed", e);
    }
  }
  return Response.json({ ok: true, dmSent });
}
