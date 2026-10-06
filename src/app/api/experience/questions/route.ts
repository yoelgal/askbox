import { badRequest, forbidden, jsonError } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { z } from "zod";
import { createQuestion, getCreator, questionCount } from "@/lib/db";
import { screenQuestion } from "@/lib/ai";
import { DEMO_QUESTION_CAP, isDemo } from "@/lib/demo";
import { DEV, fanDisplayName, fanGuard } from "@/lib/fanvue";

const Body = z.object({
  body: z.string().trim().min(3).max(1000),
  tier: z.enum(["question", "priority"]),
  isPublic: z.boolean(),
});

/**
 * Screens a question before the fan pays, then parks it as unpaid. The id we
 * return becomes the purchase's clientReferenceId, which is how the payment
 * finds its question again.
 */
export async function POST(req: Request) {
  const g = await fanGuard(req);
  if (!g.ok) return g.response;
  if (g.session.preview) return forbidden("You're previewing your own Askbox, so paying is switched off.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Write a question between 3 and 1000 characters.");

  const creator = (await getCreator(g.session.creatorUuid))!;
  if (isDemo(creator.uuid) && (await questionCount(creator.uuid)) >= DEMO_QUESTION_CAP) {
    return jsonError(429, "demo_full", "This demo has had all the questions it can take. Sign in again for a fresh one.");
  }
  // Demo without an API key: skip screening rather than flag every question.
  const skip = DEV && !process.env.AI_API_KEY;
  const screening = skip
    ? { verdict: "ok" as const, topic: "general", reason: "" }
    : await screenQuestion(creator, parsed.data.body).catch((e) => {
        console.error("[askbox] screening failed", e);
        return { verdict: "flag" as const, topic: "needs review", reason: "Automatic screening was unavailable." };
      });
  if (screening.verdict === "reject") return Response.json({ rejected: true, reason: screening.reason });

  const fanUuid = g.session.fanvueFanUuid;
  const fanName = isDemo(creator.uuid) ? "Casey" : ((await fanDisplayName(creator.uuid, fanUuid)) ?? "A fan");
  const id = await createQuestion({
    creatorUuid: creator.uuid,
    fanUuid,
    fanName,
    ...parsed.data,
    topic: screening.topic,
    flag: screening.verdict === "flag" ? screening.reason : null,
  });
  return Response.json({ id });
}
