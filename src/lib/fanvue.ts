import {
  CreatorSessionClaimsSchema,
  FanSessionClaimsSchema,
  createAppSessions,
  createFanvueCrypto,
  createTokenStoreContext,
  getAccessToken,
  getAnyAppAccessToken,
  flagEnabled,
  type OAuthConfig,
} from "@fanvue/builder-sdk";
import { requireCreatorSession, requireFanSession } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { z } from "zod";
import { tokenAdapter } from "@/lib/db";

export const APP_UUID = process.env.FANVUE_APP_UUID ?? "";
export const API_BASE = process.env.API_BASE_URL ?? "https://api.fanvue.com";

/** Demo mode: both surfaces work outside Fanvue with seeded data and a fake payment sheet. */
export const DEV = flagEnabled("ASKBOX_DEV");

export const oauthConfig: OAuthConfig = {
  clientId: process.env.OAUTH_CLIENT_ID ?? "",
  clientSecret: process.env.OAUTH_CLIENT_SECRET ?? "",
  redirectUri: process.env.OAUTH_REDIRECT_URI ?? "",
  issuerUrl: process.env.OAUTH_ISSUER_BASE_URL ?? null,
  apiBaseUrl: API_BASE,
  scopes: process.env.OAUTH_SCOPES ?? null,
  responseMode: null,
  prompt: null,
};

export const isConfigured = () => !!(oauthConfig.clientId && oauthConfig.clientSecret && APP_UUID);

// Fan sessions carry the creator so every fan route knows whose box it is.
const FanClaims = FanSessionClaimsSchema.extend({ creatorUuid: z.string().min(1) });

export const sessions = createAppSessions({
  issuer: "askbox",
  secret: process.env.SESSION_SECRET ?? "",
  creatorTtlSeconds: null,
  fanTtlSeconds: null,
  creatorClaimsSchema: CreatorSessionClaimsSchema,
  fanClaimsSchema: FanClaims,
});

export const creatorGuard = (req: Request) => requireCreatorSession(req, { sessions, isSessionCurrent: null });
export const fanGuard = (req: Request) => requireFanSession(req, { sessions, isSessionCurrent: null });

// Refresh tokens are sealed with AES-GCM at rest; the SDK does refresh with
// compare-and-swap so concurrent requests can't strand a rotated token.
export const tokenStore = createTokenStoreContext({
  adapter: tokenAdapter,
  cipher: createFanvueCrypto({
    currentKey: process.env.FANVUE_TOKEN_ENC_KEY ?? "",
    previousKeys: null,
  }).withPurpose("fanvue-oauth-tokens"),
  oauth: oauthConfig,
});

export const creatorAccessToken = (creatorUuid: string) => getAccessToken(tokenStore, creatorUuid);
export const anyAppAccessToken = () => getAnyAppAccessToken(tokenStore);

export class FanvueError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Fanvue API ${status}`);
  }
}

/**
 * Minimal v1 client for the endpoints the SDK doesn't cover yet (its experiences
 * client targets v0 and can't propose priced actions).
 */
export async function fanvue<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "x-fanvue-api-version": "2025-06-26",
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new FanvueError(res.status, await res.text());
  return res.json() as Promise<T>;
}

// --- The two priced actions every Askbox proposes ---------------------------

export const ACTIONS = {
  question: { title: "Ask a question", description: "Answered in the order it arrives.", suggestedPriceCents: 500 },
  priority: { title: "Priority question", description: "Jumps to the front of the queue.", suggestedPriceCents: 1500 },
  tip: { title: "Thank-you tip", description: "A tip for an answer the fan loved.", suggestedPriceCents: 500 },
} as const;

export type Price = { externalActionId: keyof typeof ACTIONS; amount: number };

/** Prices the creator actually set, read live (a re-price shows on the next load). */
export async function actionPrices(creatorUuid: string, experienceUuid: string): Promise<Price[]> {
  // Demo sandboxes have no Fanvue experience; they use the suggested prices.
  if (experienceUuid.startsWith("demo-")) {
    return Object.entries(ACTIONS).map(([externalActionId, a]) => ({ externalActionId, amount: a.suggestedPriceCents })) as Price[];
  }
  const token = await creatorAccessToken(creatorUuid);
  if (!token) return [];
  const { actions } = await fanvue<{ actions: { externalActionId: string; amount: number }[] }>(
    token,
    `/v1/experiences/${experienceUuid}/actions`,
  );
  return actions.filter((a): a is Price => a.externalActionId in ACTIONS);
}

export type ActionPurchase = {
  purchaseReference: string;
  externalActionId: string;
  clientReferenceId: string | null;
  buyerUuid: string;
  amount: number;
  status: "pending" | "succeeded" | "failed" | "refunded" | "disputed" | "cancelled";
};

/** The reconciliation read: the only proof money moved besides the webhook. */
export async function getPurchase(creatorUuid: string, experienceUuid: string, reference: string) {
  const token = await creatorAccessToken(creatorUuid);
  if (!token) return null;
  return fanvue<ActionPurchase>(token, `/v1/experiences/${experienceUuid}/action-purchases/${encodeURIComponent(reference)}`);
}

export async function fanDisplayName(creatorUuid: string, fanUuid: string) {
  try {
    const token = await creatorAccessToken(creatorUuid);
    if (!token) return null;
    const res = await fanvue<Record<string, { displayName?: string; nickname?: string | null }>>(
      token,
      "/v1/insights/fans/profiles",
      { method: "POST", body: { userUuids: [fanUuid] } },
    );
    const p = res[fanUuid];
    return p?.nickname || p?.displayName || null;
  } catch {
    return null; // a name is nice to have; never block a question on it
  }
}
