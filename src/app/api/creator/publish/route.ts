import { badRequest, fanvueReconnectRequired, jsonError } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { z } from "zod";
import { getCreator, setExperience } from "@/lib/db";
import { isDemo } from "@/lib/demo";
import { ACTIONS, APP_UUID, FanvueError, creatorAccessToken, creatorGuard, fanvue } from "@/lib/fanvue";

/**
 * Mints the request token for Fanvue's native publish modal. The creator
 * confirms (and sets the real prices) inside Fanvue; we never set prices.
 */
export async function POST(req: Request) {
  const g = await creatorGuard(req);
  if (!g.ok) return g.response;
  const creator = await getCreator(g.session.subjectId);
  if (!creator) return badRequest("Unknown creator");
  if (isDemo(creator.uuid)) return Response.json({ demo: true });

  const token = await creatorAccessToken(creator.uuid);
  if (!token) return fanvueReconnectRequired();
  try {
    const res = await fanvue<{ token: string }>(token, "/v1/experiences/request-token", {
      method: "POST",
      body: {
        action: "publish",
        appUuid: APP_UUID,
        externalExperienceId: creator.uuid,
        title: `Ask ${creator.displayName} anything`,
        description: `Pay to ask ${creator.displayName} a question and get a personal answer.`,
        imageUrl: null,
        proposedAccessMode: "FREE",
        // Free to open, paid per question. Subscriber-only is the creator's call.
        allowedAccessModes: ["FREE", "SUBSCRIPTION"],
        deliveryMode: "EMBEDDED",
        proposedActions: Object.entries(ACTIONS).map(([id, a]) => ({
          externalActionId: id,
          title: a.title,
          description: a.description,
          suggestedPriceCents: a.suggestedPriceCents,
        })),
      },
    });
    return Response.json({ token: res.token });
  } catch (e) {
    const status = e instanceof FanvueError ? e.status : 502;
    console.error("[askbox] publish token failed", status, e instanceof FanvueError ? e.body : e);
    return jsonError(502, "publish_failed", "Fanvue couldn't start publishing. Try again.");
  }
}

const Published = z.object({ experienceUuid: z.string().min(1).nullable() });

/** Records the experience id Fanvue's modal reported (or null after unpublishing). */
export async function PUT(req: Request) {
  const g = await creatorGuard(req);
  if (!g.ok) return g.response;
  const parsed = Published.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Expected { experienceUuid }");
  const uuid = g.session.subjectId;
  await setExperience(uuid, isDemo(uuid) ? uuid.replace(/^demo-/, "demo-exp-") : parsed.data.experienceUuid);
  return Response.json({ ok: true });
}
