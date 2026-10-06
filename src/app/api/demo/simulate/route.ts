import { jsonError } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { randomUUID } from "node:crypto";
import { type FanKind, screenQuestion, simulateFanQuestion } from "@/lib/ai";
import { createQuestion, getCreator, inbox, markPaid, questionCount } from "@/lib/db";
import { DEMO_QUESTION_CAP, demoExpired, demoSid, ensureDemo } from "@/lib/demo";
import { ACTIONS } from "@/lib/fanvue";

/**
 * A simulated fan asks the demo creator a question, through the same path a
 * real one takes: screened first, and only paid (with a stand-in payment) if it
 * passes. A stopped question never reaches the inbox.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { demo?: unknown } | null;
  const sid = demoSid(body?.demo);
  if (!sid) return demoExpired();

  const ids = await ensureDemo(sid);
  if ((await questionCount(ids.creator)) >= DEMO_QUESTION_CAP) {
    return jsonError(429, "demo_full", "This demo has had all the fans it can take. Sign in again for a fresh one.");
  }
  const creator = (await getCreator(ids.creator))!;
  const roll = Math.random();
  const kind: FanKind = roll < 0.6 ? "normal" : roll < 0.8 ? "sensitive" : "crosses";
  const recent = (await inbox(creator.uuid)).slice(0, 8).map((q) => q.body);

  try {
    const fan = await simulateFanQuestion(creator, kind, recent);
    const screening = await screenQuestion(creator, fan.question);
    if (screening.verdict === "reject") return Response.json({ status: "stopped", name: fan.name, question: fan.question, reason: screening.reason });

    const id = await createQuestion({
      creatorUuid: creator.uuid,
      fanUuid: `${creator.uuid}-sim-${randomUUID().slice(0, 8)}`,
      fanName: fan.name,
      body: fan.question,
      tier: fan.tier,
      isPublic: Math.random() < 0.6,
      topic: screening.topic,
      flag: screening.verdict === "flag" ? screening.reason : null,
    });
    const amount = ACTIONS[fan.tier].suggestedPriceCents;
    await markPaid(id, `demo_sim_${id}`, amount);
    return Response.json({ status: "paid", name: fan.name, question: fan.question, tier: fan.tier, amount, flagged: screening.verdict === "flag" });
  } catch (e) {
    console.error("[askbox] demo simulate failed", e);
    return jsonError(502, "simulate_failed", "Couldn't simulate a fan this time. Try again.");
  }
}
