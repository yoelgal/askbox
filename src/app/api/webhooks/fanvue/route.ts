import { fanvueSignatureContract, verifyWebhookHmac } from "@fanvue/builder-sdk";
import { creatorByExperience } from "@/lib/db";
import { getPurchase } from "@/lib/fanvue";
import { fulfil } from "@/lib/fulfil";

export const dynamic = "force-dynamic";

// The payload keys aren't documented yet beyond `purchase_reference`, so read
// either casing and treat the webhook purely as a trigger: the purchase is
// re-read from the API and that read decides what happens.
const pick = (o: Record<string, unknown>, ...keys: string[]) =>
  keys.map((k) => o[k]).find((v): v is string => typeof v === "string");

export async function POST(req: Request) {
  const raw = new Uint8Array(await req.arrayBuffer());
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return Response.json({ accepted: false, discarded: true, reason: "bad_json" });
  }
  // Fanvue's unsigned probe when the endpoint is registered.
  if (body.type === "fanvue.webhook.verification") return Response.json({ accepted: false, verification: true });

  const secret = process.env.FANVUE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook secret not configured", { status: 503 });
  const ok = await verifyWebhookHmac({
    rawBody: raw,
    headers: Object.fromEntries(req.headers.entries()),
    secret,
    contract: fanvueSignatureContract(),
    nowMs: null,
  });
  if (!ok) return new Response("Bad signature", { status: 401 });

  const type = String(body.type ?? "");
  // Authentic but not ours to act on: 200, or Fanvue retries it forever.
  if (!type.startsWith("app.experience.action.")) return Response.json({ accepted: false, discarded: true, reason: "topic" });

  const data = (body.data ?? body) as Record<string, unknown>;
  const reference = pick(data, "purchase_reference", "purchaseReference");
  const experienceUuid = pick(data, "experience_uuid", "experienceUuid");
  const creator = experienceUuid ? await creatorByExperience(experienceUuid) : null;
  if (!reference || !experienceUuid || !creator) return Response.json({ accepted: false, discarded: true, reason: "unknown_experience" });

  const p = await getPurchase(creator.uuid, experienceUuid, reference).catch(() => null);
  // A failed read is retryable; let Fanvue redeliver.
  if (!p) return new Response("Couldn't read purchase", { status: 503 });

  await fulfil(p, creator.uuid);
  return Response.json({ accepted: true });
}
