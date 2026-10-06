import { jsonError } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  addTip, closeQuestion, createQuestion, deleteCreatorData, getCreator, markPaid, questionCount, setExperience, setTheme,
  staleDemoCreators, updateCreatorSettings, upsertCreator,
} from "@/lib/db";
import { DEMO_NOTE } from "@/lib/demo-note";
import { ACTIONS, DEV } from "@/lib/fanvue";

// The demo runs the real app against a sandbox per visitor: creator
// "demo-<sid>", fan "demo-fan-<sid>". Real Fanvue ids are UUIDs, so the
// "demo-" prefix can never match a real account, and everything that would
// call Fanvue (payments, DMs, publishing) is skipped for demo creators.
export const isDemo = (uuid: string) => uuid.startsWith("demo-");
const demoIds = (sid: string) => ({ creator: `demo-${sid}`, fan: `demo-fan-${sid}`, experience: `demo-exp-${sid}` });

// --- access: a password buys a signed, expiring demo token -------------------

const TTL = 14 * 24 * 3_600_000;
// Keyed on the password too: changing DEMO_PASSWORD signs every existing demo out.
const mac = (s: string) =>
  createHmac("sha256", `${process.env.SESSION_SECRET ?? ""}:${process.env.DEMO_PASSWORD ?? ""}`).update(`askbox-demo:${s}`).digest("base64url");

export function checkPassword(given: string) {
  const want = process.env.DEMO_PASSWORD ?? "";
  const a = Buffer.from(given), b = Buffer.from(want);
  return want.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function issueDemoToken() {
  const sid = randomUUID().slice(0, 8);
  const body = `${sid}.${Date.now() + TTL}`;
  return `${body}.${mac(body)}`;
}

/** The sandbox id a demo token grants, or null. Local dev (ASKBOX_DEV) needs no token. */
export function demoSid(token: unknown): string | null {
  if (typeof token === "string") {
    const [sid, exp, sig] = token.split(".");
    if (sid && exp && sig && /^[a-z0-9-]{8}$/.test(sid) && Number(exp) > Date.now()) {
      const want = Buffer.from(mac(`${sid}.${exp}`)), got = Buffer.from(sig);
      if (want.length === got.length && timingSafeEqual(want, got)) return sid;
    }
  }
  return DEV ? "local" : null;
}

/** Removes sandboxes older than a week, so the demo doesn't pile up rows. */
export async function sweepDemos() {
  for (const uuid of await staleDemoCreators(7 * 24 * 3_600_000)) await deleteCreatorData(uuid);
}

// --- seed ----------------------------------------------------------------------

const H = 3_600_000;
const SEED: { fan: string; name: string; body: string; tier: "question" | "priority"; pub: boolean; ago: number; topic: string; flag?: string; answer?: string; tip?: number }[] = [
  { fan: "f8", name: "Dani", tier: "priority", pub: false, ago: 14, topic: "exercise choice", body: "If you could only do one exercise for a whole month, what would it be and why?" },
  { fan: "f1", name: "Jordan", tier: "priority", pub: true, ago: 2, topic: "morning routine", body: "What does your morning actually look like on a training day? The real one, not the highlight reel 😅" },
  { fan: "f2", name: "alex_r", tier: "question", pub: false, ago: 5, topic: "starting out", body: "I start my first strength program next week. What's one thing you wish you'd known in month one?" },
  { fan: "f3", name: "Kit", tier: "question", pub: true, ago: 9, topic: "travel training", body: "Any tips for training while travelling? Hotel gyms are rough" },
  { fan: "f4", name: "Chris", tier: "question", pub: false, ago: 20, topic: "motivation", flag: "Sounds discouraged after skipping a few weeks; worth an encouraging, careful reply.", body: "Honestly I've skipped the gym for two weeks and feel like I've lost everything. How do you keep going when you just don't want to?" },
  { fan: "f5", name: "Riley", tier: "question", pub: true, ago: 60, topic: "training playlist", body: "What's on your training playlist right now?", answer: "same 3 songs on repeat all week, no shame. old-school hip hop for heavy days, anything fast for conditioning 🎧" },
  { fan: "f6", name: "Taylor", tier: "priority", pub: true, ago: 80, topic: "beginner frequency", body: "How many days a week should a beginner lift?", answer: "3 is the sweet spot. full body each time, a rest day between. consistency beats intensity every single time 💪", tip: 500 },
  { fan: "f7", name: "Morgan", tier: "question", pub: true, ago: 120, topic: "post-workout food", body: "Best post-workout meal that isn't chicken and rice?", answer: "greek yoghurt, berries, granola, a drizzle of honey. two minutes, decent protein, tastes like dessert. no notes" },
];

export const DEMO_CREATOR = { handle: "samrivera", displayName: "Sam Rivera" };

/** Creates the sandbox for a sid on first use: Sam, a strength coach, with a brand, an inbox, and one answered voice note for the demo fan. */
export async function ensureDemo(sid: string) {
  const ids = demoIds(sid);
  if ((await getCreator(ids.creator)) && (await questionCount(ids.creator)) > 0) return ids;
  await upsertCreator({
    uuid: ids.creator,
    ...DEMO_CREATOR,
    avatarUrl: "https://images.unsplash.com/photo-1758875568823-34bdf47b82dc?w=256&h=256&fit=crop&crop=faces",
  });
  await updateCreatorSettings(ids.creator, {
    voice: "Direct, encouraging and practical. Mostly lowercase, short sentences, plain words, the odd 💪. Never preachy.",
    boundaries: "No diagnosing injuries or pain; see a physio for that. No questions about my family or where I live. No meetups.",
    replyHours: { question: 72, priority: 12 },
  });
  await setTheme(ids.creator, { accent: "#22c3e6", cover: "gradient", headline: "Your training questions, answered", tagline: "Programming, form and fuel. Real answers from a strength coach." });
  await setExperience(ids.creator, ids.experience);
  const now = Date.now();
  for (const [i, s] of SEED.entries()) {
    const at = now - s.ago * H;
    const id = await createQuestion({ creatorUuid: ids.creator, fanUuid: `${ids.creator}-${s.fan}`, fanName: s.name, body: s.body, tier: s.tier, isPublic: s.pub, topic: s.topic, flag: s.flag ?? null, createdAt: at });
    await markPaid(id, `demo_seed_${sid}_${i}`, ACTIONS[s.tier].suggestedPriceCents, at);
    if (s.answer) await closeQuestion(id, "answered", s.answer, at + ((i % 3) + 2) * H);
    if (s.tip) await addTip(id, `demo_seed_tip_${sid}_${i}`, s.tip);
  }
  // The visitor-as-fan already has one answer back, as a voice note they can tip.
  const at = now - 26 * H;
  const mine = await createQuestion({ creatorUuid: ids.creator, fanUuid: ids.fan, fanName: "Casey", body: "What's one thing you'd tell someone on day one of training?", tier: "priority", isPublic: true, topic: "starting out", flag: null, createdAt: at });
  await markPaid(mine, `demo_seed_mine_${sid}`, ACTIONS.priority.suggestedPriceCents, at);
  await closeQuestion(mine, "answered", null, at + 3 * H, { data: Buffer.from(DEMO_NOTE.base64, "base64"), mime: DEMO_NOTE.mime, ms: DEMO_NOTE.ms });
  return ids;
}

export const demoExpired = () => jsonError(401, "demo_locked", "This demo link has expired. Open askbox.yoelgal.com/demo and enter the password again.");

/** Session routes: a demo sign-in ({ dev: true }) needs a valid demo token. Returns the refusal, or null to carry on. */
export async function demoLocked(req: Request) {
  const body = (await req.clone().json().catch(() => null)) as { dev?: unknown; demo?: unknown } | null;
  if (body?.dev !== true || demoSid(body.demo)) return null;
  return demoExpired();
}

/** Most questions a demo sandbox takes (asked or simulated), which caps its AI spend. */
export const DEMO_QUESTION_CAP = 60;
