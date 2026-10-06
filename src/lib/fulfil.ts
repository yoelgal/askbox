import type { ActionPurchase as Purchase } from "@/lib/fanvue";
import { addTip, getQuestion, markPaid, markRefunded, removeTip } from "@/lib/db";

/**
 * Applies a purchase as read back from Fanvue. The one place that decides what
 * money means, shared by the webhook and the in-app confirm; both are
 * idempotent on the purchase reference, so either can arrive first or twice.
 * Returns what the purchase paid for, or null when it matched nothing.
 */
export async function fulfil(p: Purchase, creatorUuid: string): Promise<"question" | "tip" | null> {
  const q = p.clientReferenceId ? await getQuestion(p.clientReferenceId) : null;
  if (!q || q.creatorUuid !== creatorUuid || q.fanUuid !== p.buyerUuid) return null;
  const isTip = p.externalActionId === "tip";
  if (!isTip && p.externalActionId !== q.tier) return null;

  if (["refunded", "disputed", "cancelled"].includes(p.status)) {
    if (isTip) await removeTip(p.purchaseReference);
    else await markRefunded(p.purchaseReference);
    return null;
  }
  if (p.status !== "succeeded") return null;

  if (isTip) {
    if (q.status !== "answered") return null;
    await addTip(q.id, p.purchaseReference, p.amount);
    return "tip";
  }
  await markPaid(q.id, p.purchaseReference, p.amount);
  return "question";
}
