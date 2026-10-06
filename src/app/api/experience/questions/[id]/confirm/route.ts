import { badRequest, notFound } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { z } from "zod";
import { getQuestion } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { ACTIONS, fanGuard, getPurchase } from "@/lib/fanvue";
import { fulfil } from "@/lib/fulfil";

const Body = z.object({ purchaseReference: z.string().min(1).max(200), kind: z.enum(["question", "tip"]) });

/**
 * Called when Fanvue's payment sheet reports success, for a question or a tip
 * on its answer. That message is UX only, never proof of payment, so the
 * purchase is re-read from Fanvue and applied by the same code as the webhook.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await fanGuard(req);
  if (!g.ok) return g.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Expected { purchaseReference, kind }");
  const { purchaseReference: ref, kind } = parsed.data;

  const q = await getQuestion((await ctx.params).id);
  if (!q || q.fanUuid !== g.session.fanvueFanUuid || q.creatorUuid !== g.session.creatorUuid) return notFound();

  const action = kind === "tip" ? "tip" : q.tier;

  // Demo: no real purchase to read, so synthesise a settled one at the suggested price.
  if (isDemo(q.creatorUuid) && ref.startsWith("demo_")) {
    const done = await fulfil(
      { purchaseReference: ref, externalActionId: action, clientReferenceId: q.id, buyerUuid: q.fanUuid, amount: ACTIONS[action].suggestedPriceCents, status: "succeeded" },
      q.creatorUuid,
    );
    return Response.json({ status: done ? "paid" : "rejected" });
  }

  const p = await getPurchase(q.creatorUuid, g.session.experienceUuid, ref).catch((e) => {
    console.error("[askbox] purchase read failed", e);
    return null;
  });
  if (!p || p.externalActionId !== action || p.status !== "succeeded" || !await fulfil(p, q.creatorUuid)) {
    // Maybe still settling: the webhook will fulfil it when it lands.
    return Response.json({ status: "pending" }, { status: 202 });
  }
  return Response.json({ status: "paid" });
}
