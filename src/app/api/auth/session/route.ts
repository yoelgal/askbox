import { createCreatorSessionHandler, createInMemoryRateLimiter } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { createFanvueClient, exchangeSessionToken, storeTokenSet, tokenSetFromOAuthResult } from "@fanvue/builder-sdk";
import { upsertCreator } from "@/lib/db";
import { DEMO_CREATOR, demoLocked, demoSid, ensureDemo } from "@/lib/demo";
import { API_BASE, isConfigured, oauthConfig, sessions, tokenStore } from "@/lib/fanvue";

// Creator bootstrap: Fanvue opens /creator?token=… and we trade that ~60s
// session token for OAuth tokens, stored encrypted for background work.
const handler = createCreatorSessionHandler({
  sessions,
  exchange: {
    exchangeSessionToken: async (sessionToken) =>
      tokenSetFromOAuthResult(
        await exchangeSessionToken({ ...oauthConfig, platformUrl: process.env.FANVUE_PLATFORM_URL ?? null }, sessionToken),
      ),
    getCurrentUser: (accessToken) => createFanvueClient(accessToken, API_BASE).getCurrentUser(),
  },
  hooks: {
    upsertCreator: async ({ user }) => {
      await upsertCreator({ uuid: user.uuid, handle: user.handle, displayName: user.displayName, avatarUrl: user.avatarUrl });
      return { typ: "creator", subjectId: user.uuid, fanvueUserUuid: user.uuid, displayName: user.displayName, handle: user.handle };
    },
    persistTokens: async ({ subjectId, tokens }) => {
      const stored = await storeTokenSet(tokenStore, subjectId, tokens);
      if (stored.isErr()) throw new Error(stored.error.code);
    },
    afterConnect: null,
  },
  rateLimiter: createInMemoryRateLimiter(),
  rateLimit: null,
  isConfigured,
  // Demo sandboxes: the POST wrapper below has already checked the demo token.
  devStrategy: {
    createSession: async ({ body }) => {
      const ids = await ensureDemo(demoSid((body as { demo?: unknown }).demo)!);
      return { typ: "creator", subjectId: ids.creator, fanvueUserUuid: ids.creator, ...DEMO_CREATOR };
    },
  },
});

export async function POST(req: Request) {
  return (await demoLocked(req)) ?? handler(req);
}
