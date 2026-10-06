import { createFanSessionHandler, createInMemoryRateLimiter } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { createFanvueClient } from "@fanvue/builder-sdk";
import { getCreator } from "@/lib/db";
import { demoLocked, demoSid, ensureDemo } from "@/lib/demo";
import { API_BASE, APP_UUID, anyAppAccessToken, isConfigured, sessions } from "@/lib/fanvue";

// Fan bootstrap: Fanvue opens /experience?token=… on the creator's profile.
// The exchange is app-bound, so any connected creator's token can make it.
const handler = createFanSessionHandler({
  sessions,
  appUuid: APP_UUID,
  getAppAccessToken: anyAppAccessToken,
  exchangeExperienceToken: (appToken, launchToken) =>
    createFanvueClient(appToken, API_BASE).experiences.exchangeExperienceToken(launchToken),
  hooks: {
    resolveExperienceBinding: async ({ exchanged }) => {
      // One Askbox per creator: the external id we published with is the creator uuid.
      const creator = await getCreator(exchanged.experience.externalExperienceId);
      if (!creator || creator.uuid !== exchanged.experience.creatorUuid) {
        return { ok: false, status: 404, code: "box_not_found", message: "This Askbox isn't set up yet." };
      }
      return {
        ok: true,
        claims: {
          typ: "fan",
          fanvueFanUuid: exchanged.fanUuid,
          experienceUuid: exchanged.experience.uuid,
          entitled: true,
          preview: false,
          creatorUuid: creator.uuid,
        },
      };
    },
  },
  rateLimiter: createInMemoryRateLimiter(),
  rateLimit: null,
  isConfigured,
  // "Preview as a fan" from the creator surface.
  previewStrategy: {
    isSessionCurrent: null,
    createSession: async ({ session }) => {
      const creator = await getCreator(session.subjectId);
      if (!creator?.experienceUuid) {
        return { ok: false, status: 409, code: "not_published", message: "Publish your Askbox first." };
      }
      return {
        ok: true,
        claims: {
          typ: "fan",
          fanvueFanUuid: session.subjectId,
          experienceUuid: creator.experienceUuid,
          entitled: true,
          preview: true,
          creatorUuid: creator.uuid,
        },
      };
    },
  },
  // Demo sandboxes: the POST wrapper below has already checked the demo token.
  devStrategy: {
    createSession: async ({ body }) => {
      const ids = await ensureDemo(demoSid((body as { demo?: unknown }).demo)!);
      return {
        ok: true,
        claims: { typ: "fan", fanvueFanUuid: ids.fan, experienceUuid: ids.experience, entitled: true, preview: false, creatorUuid: ids.creator },
      };
    },
  },
});

export async function POST(req: Request) {
  return (await demoLocked(req)) ?? handler(req);
}
