import postgres from "postgres";
import { randomUUID } from "node:crypto";
import type { StoredTokenRecord, TokenStorageAdapter } from "@fanvue/builder-sdk";
import { parseTheme, type Theme } from "@/lib/theme";

// Neon's pooled URL sits behind PgBouncer (transaction mode), so no prepared
// statements. Timestamps are epoch ms in BIGINT; int8 parses back to number.
const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
  max: 3,
  types: { int8: { to: 20, from: [20], serialize: (v: number) => String(v), parse: (v: string) => Number(v) } },
});

// ponytail: schema is created on the first query of each cold start. Add real
// migrations the first time a column changes.
let ready: Promise<unknown> | undefined;
const init = () =>
  (ready ??= sql.unsafe(`
  CREATE TABLE IF NOT EXISTS creators (
    uuid            TEXT PRIMARY KEY,
    handle          TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    avatar_url      TEXT,
    voice           TEXT NOT NULL DEFAULT '',
    boundaries      TEXT NOT NULL DEFAULT '',
    experience_uuid TEXT UNIQUE,
    -- Reply-time promise per tier, shown to fans before they pay.
    reply_hours_question INTEGER NOT NULL DEFAULT 168,
    reply_hours_priority INTEGER NOT NULL DEFAULT 24,
    theme           TEXT,
    created_at      BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS tokens (
    subject_id  TEXT PRIMARY KEY,
    access_ct   TEXT NOT NULL,
    refresh_ct  TEXT,
    expires_at  BIGINT NOT NULL,
    scope       TEXT,
    updated_at  BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS questions (
    id                 TEXT PRIMARY KEY,
    creator_uuid       TEXT NOT NULL,
    fan_uuid           TEXT NOT NULL,
    fan_name           TEXT NOT NULL,
    body               TEXT NOT NULL,
    tier               TEXT NOT NULL CHECK (tier IN ('question', 'priority')),
    is_public          BOOLEAN NOT NULL,
    status             TEXT NOT NULL DEFAULT 'unpaid'
                         CHECK (status IN ('unpaid', 'paid', 'answered', 'declined', 'refunded')),
    topic              TEXT,
    flag               TEXT,
    purchase_reference TEXT UNIQUE,
    amount_cents       INTEGER,
    draft              TEXT,
    answer             TEXT,
    -- ponytail: voice answers live in the row; a 60s note is ~0.5 MB. Move to
    -- object storage if answers get long or numerous.
    audio              BYTEA,
    audio_mime         TEXT,
    audio_ms           INTEGER,
    created_at         BIGINT NOT NULL,
    paid_at            BIGINT,
    due_at             BIGINT,
    answered_at        BIGINT
  );
  CREATE INDEX IF NOT EXISTS questions_inbox ON questions (creator_uuid, status, due_at);
  CREATE TABLE IF NOT EXISTS tips (
    purchase_reference TEXT PRIMARY KEY,
    question_id        TEXT NOT NULL REFERENCES questions (id),
    amount_cents       INTEGER NOT NULL,
    created_at         BIGINT NOT NULL
  );
`));

type Row = Record<string, unknown>;
type Param = string | number | boolean | null | Uint8Array;

/** One statement, written with `?` placeholders. */
async function run(text: string, ...params: Param[]) {
  await init();
  let n = 0;
  return sql.unsafe<Row[]>(text.replace(/\?/g, () => `$${++n}`), params as never[]);
}
const one = async (text: string, ...params: Param[]) => (await run(text, ...params))[0] ?? null;

// --- creators ---------------------------------------------------------------

export type Creator = {
  uuid: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  voice: string;
  boundaries: string;
  experienceUuid: string | null;
  replyHours: Record<Tier, number>;
  theme: Theme;
};

const toCreator = (r: Row): Creator => ({
  uuid: r.uuid as string,
  handle: r.handle as string,
  displayName: r.display_name as string,
  avatarUrl: (r.avatar_url as string) ?? null,
  voice: r.voice as string,
  boundaries: r.boundaries as string,
  experienceUuid: (r.experience_uuid as string) ?? null,
  replyHours: { question: r.reply_hours_question as number, priority: r.reply_hours_priority as number },
  theme: parseTheme((r.theme as string) ?? null),
});

export async function upsertCreator(c: { uuid: string; handle: string; displayName: string; avatarUrl: string | null }) {
  await run(
    `INSERT INTO creators (uuid, handle, display_name, avatar_url, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (uuid) DO UPDATE SET handle = excluded.handle, display_name = excluded.display_name,
       avatar_url = excluded.avatar_url`,
    c.uuid, c.handle, c.displayName, c.avatarUrl, Date.now(),
  );
}

async function creatorWhere(where: string, param: string) {
  const r = await one(`SELECT * FROM creators WHERE ${where}`, param);
  return r ? toCreator(r) : null;
}

export const getCreator = (uuid: string) => creatorWhere("uuid = ?", uuid);
export const creatorByExperience = (experienceUuid: string) => creatorWhere("experience_uuid = ?", experienceUuid);

export async function updateCreatorSettings(uuid: string, s: { voice: string; boundaries: string; replyHours: Record<Tier, number> }) {
  await run(
    "UPDATE creators SET voice = ?, boundaries = ?, reply_hours_question = ?, reply_hours_priority = ? WHERE uuid = ?",
    s.voice, s.boundaries, s.replyHours.question, s.replyHours.priority, uuid,
  );
}

export async function setTheme(uuid: string, theme: Theme) {
  await run("UPDATE creators SET theme = ? WHERE uuid = ?", JSON.stringify(theme), uuid);
}

export async function setExperience(uuid: string, experienceUuid: string | null) {
  await run("UPDATE creators SET experience_uuid = ? WHERE uuid = ?", experienceUuid, uuid);
}

// --- OAuth tokens (the SDK owns refresh; we only store ciphertext) ----------

const toRecord = (r: Row): StoredTokenRecord => ({
  accessTokenCiphertext: r.access_ct as string,
  refreshTokenCiphertext: (r.refresh_ct as string) ?? null,
  expiresAt: r.expires_at as number,
  scope: (r.scope as string) ?? null,
});

export const tokenAdapter: TokenStorageAdapter = {
  async read(subjectId) {
    const r = await one("SELECT * FROM tokens WHERE subject_id = ?", subjectId);
    return r ? toRecord(r) : null;
  },
  async upsert(subjectId, rec) {
    await run(
      `INSERT INTO tokens VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (subject_id) DO UPDATE SET access_ct = excluded.access_ct, refresh_ct = excluded.refresh_ct,
         expires_at = excluded.expires_at, scope = excluded.scope, updated_at = excluded.updated_at`,
      subjectId, rec.accessTokenCiphertext, rec.refreshTokenCiphertext, rec.expiresAt, rec.scope, Date.now(),
    );
  },
  // One statement, so two concurrent refreshes can't both win (see SDK docs).
  async updateIfRefreshTokenMatches(subjectId, expected, rec) {
    const res = await run(
      `UPDATE tokens SET access_ct = ?, refresh_ct = ?, expires_at = ?, scope = ?, updated_at = ?
       WHERE subject_id = ? AND refresh_ct = ?`,
      rec.accessTokenCiphertext, rec.refreshTokenCiphertext, rec.expiresAt, rec.scope, Date.now(), subjectId, expected,
    );
    return res.count > 0;
  },
  async listRecentSubjectIds(limit) {
    return (await run("SELECT subject_id FROM tokens ORDER BY updated_at DESC LIMIT ?", limit)).map((r) => r.subject_id as string);
  },
};

// --- questions ----------------------------------------------------------------

export type Tier = "question" | "priority";
type Status = "unpaid" | "paid" | "answered" | "declined" | "refunded";

export type Question = {
  id: string;
  creatorUuid: string;
  fanUuid: string;
  fanName: string;
  body: string;
  tier: Tier;
  isPublic: boolean;
  status: Status;
  topic: string | null;
  flag: string | null;
  amountCents: number | null;
  draft: string | null;
  answer: string | null;
  audioMs: number | null;
  tipCents: number;
  createdAt: number;
  paidAt: number | null;
  dueAt: number | null;
  answeredAt: number | null;
};

// Every column but the audio bytes, plus the tip total. Lists never load audio.
const COLS = `id, creator_uuid, fan_uuid, fan_name, body, tier, is_public, status, topic, flag, amount_cents,
  draft, answer, audio_ms, created_at, paid_at, due_at, answered_at,
  (SELECT COALESCE(SUM(amount_cents), 0) FROM tips WHERE tips.question_id = questions.id) AS tip_cents`;

const toQuestion = (r: Row): Question => ({
  id: r.id as string,
  creatorUuid: r.creator_uuid as string,
  fanUuid: r.fan_uuid as string,
  fanName: r.fan_name as string,
  body: r.body as string,
  tier: r.tier as Tier,
  isPublic: r.is_public as boolean,
  status: r.status as Status,
  topic: (r.topic as string) ?? null,
  flag: (r.flag as string) ?? null,
  amountCents: (r.amount_cents as number) ?? null,
  draft: (r.draft as string) ?? null,
  answer: (r.answer as string) ?? null,
  audioMs: (r.audio_ms as number) ?? null,
  tipCents: (r.tip_cents as number) ?? 0,
  createdAt: r.created_at as number,
  paidAt: (r.paid_at as number) ?? null,
  dueAt: (r.due_at as number) ?? null,
  answeredAt: (r.answered_at as number) ?? null,
});

/** Questions matching a WHERE clause (plus any ORDER BY / LIMIT), without audio. */
const questions = async (where: string, ...params: Param[]) =>
  (await run(`SELECT ${COLS} FROM questions WHERE ${where}`, ...params)).map(toQuestion);

export async function createQuestion(q: {
  creatorUuid: string;
  fanUuid: string;
  fanName: string;
  body: string;
  tier: Tier;
  isPublic: boolean;
  topic: string | null;
  flag: string | null;
  createdAt?: number;
}) {
  const id = randomUUID();
  await run(
    `INSERT INTO questions (id, creator_uuid, fan_uuid, fan_name, body, tier, is_public, topic, flag, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, q.creatorUuid, q.fanUuid, q.fanName, q.body, q.tier, q.isPublic, q.topic, q.flag, q.createdAt ?? Date.now(),
  );
  return id;
}

export const getQuestion = async (id: string) => (await questions("id = ?", id))[0] ?? null;

/**
 * Marks a question paid. Keyed on the purchase reference, so a webhook
 * redelivery and the client-side confirm can both arrive and only one lands.
 * Returns false when this reference was already recorded.
 */
export async function markPaid(id: string, purchaseReference: string, amountCents: number, at = Date.now()) {
  try {
    const res = await run(
      `UPDATE questions SET status = 'paid', purchase_reference = ?, amount_cents = ?, paid_at = ?,
         -- The promise is locked in at purchase: changing it later doesn't move paid questions.
         due_at = ?::bigint + 3600000 * (SELECT CASE questions.tier WHEN 'priority' THEN reply_hours_priority
                                  ELSE reply_hours_question END FROM creators WHERE uuid = questions.creator_uuid)
       WHERE id = ? AND status = 'unpaid'
         AND NOT EXISTS (SELECT 1 FROM questions WHERE purchase_reference = ?)`,
      purchaseReference, amountCents, at, at, id, purchaseReference,
    );
    return res.count > 0;
  } catch (e) {
    // Two deliveries racing on the same reference: the UNIQUE constraint picks one.
    if ((e as { code?: string }).code === "23505") return false;
    throw e;
  }
}

/** A reversed payment (refund, chargeback) takes the question out of the inbox. */
export async function markRefunded(purchaseReference: string) {
  await run("UPDATE questions SET status = 'refunded' WHERE purchase_reference = ? AND status = 'paid'", purchaseReference);
}

export async function saveDraft(id: string, draft: string) {
  await run("UPDATE questions SET draft = ? WHERE id = ?", draft, id);
}

export type Audio = { data: Uint8Array; mime: string; ms: number };

/** Atomic paid → answered/declined claim, so a double-click can't send twice. */
export async function closeQuestion(
  id: string,
  status: "answered" | "declined",
  answer: string | null,
  at = Date.now(),
  audio: Audio | null = null,
) {
  const res = await run(
    `UPDATE questions SET status = ?, answer = ?, answered_at = ?, audio = ?, audio_mime = ?, audio_ms = ?
     WHERE id = ? AND status = 'paid'`,
    status, answer, at, audio?.data ?? null, audio?.mime ?? null, audio?.ms ?? null, id,
  );
  return res.count > 0;
}

export async function getAudio(id: string) {
  const r = await one("SELECT audio, audio_mime FROM questions WHERE id = ? AND audio IS NOT NULL", id);
  return r ? { data: r.audio as Uint8Array, mime: r.audio_mime as string } : null;
}

/** Keyed on the purchase reference, so a redelivered webhook can't double-count. */
export async function addTip(questionId: string, purchaseReference: string, amountCents: number) {
  await run(
    "INSERT INTO tips VALUES (?, ?, ?, ?) ON CONFLICT (purchase_reference) DO NOTHING",
    purchaseReference, questionId, amountCents, Date.now(),
  );
}

export async function removeTip(purchaseReference: string) {
  await run("DELETE FROM tips WHERE purchase_reference = ?", purchaseReference);
}

/** Undo for a decline. Answers can't be undone: the fan may already have the DM. */
export async function reopenQuestion(id: string) {
  await run("UPDATE questions SET status = 'paid', answered_at = NULL WHERE id = ? AND status = 'declined'", id);
}

/** Soonest reply-by first. Priority's shorter promise puts it ahead on its own. */
export const inbox = (creatorUuid: string) => questions("creator_uuid = ? AND status = 'paid' ORDER BY due_at ASC", creatorUuid);

export const answered = (creatorUuid: string, limit = 50) =>
  questions("creator_uuid = ? AND status IN ('answered', 'declined') ORDER BY answered_at DESC LIMIT ?", creatorUuid, limit);

export async function stats(creatorUuid: string) {
  const r = (await one(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN ('paid', 'answered', 'declined') THEN amount_cents END), 0) AS earned,
       (SELECT COALESCE(SUM(t.amount_cents), 0) FROM tips t JOIN questions q ON q.id = t.question_id
          WHERE q.creator_uuid = ?) AS tips,
       COUNT(CASE WHEN status = 'answered' THEN 1 END) AS answered,
       COUNT(CASE WHEN status = 'answered' AND answered_at <= due_at THEN 1 END) AS on_time,
       AVG(CASE WHEN status = 'answered' THEN answered_at - paid_at END)::float8 AS avg_ms
     FROM questions WHERE creator_uuid = ?`,
    creatorUuid, creatorUuid,
  ))!;
  const answered = r.answered as number;
  return {
    earnedCents: (r.earned as number) + (r.tips as number),
    tipsCents: r.tips as number,
    answered,
    onTimeRate: answered ? (r.on_time as number) / answered : null,
    avgResponseMs: (r.avg_ms as number) ?? null,
  };
}

export const fanQuestions = (creatorUuid: string, fanUuid: string) =>
  questions("creator_uuid = ? AND fan_uuid = ? AND status != 'unpaid' ORDER BY created_at DESC", creatorUuid, fanUuid);

export const publicWall = (creatorUuid: string, limit = 30) =>
  questions("creator_uuid = ? AND status = 'answered' AND is_public ORDER BY answered_at DESC LIMIT ?", creatorUuid, limit);

/** The creator's own past answers, the best voice sample we have. */
export async function pastAnswers(creatorUuid: string, limit = 12) {
  return (
    await run(
      `SELECT body, answer FROM questions WHERE creator_uuid = ? AND status = 'answered' AND answer IS NOT NULL
       ORDER BY answered_at DESC LIMIT ?`,
      creatorUuid, limit,
    )
  ).map((r) => ({ question: r.body as string, answer: r.answer as string }));
}

/**
 * Erases everything Askbox holds for a creator: their fans' questions and
 * answers (voice notes included), tips, OAuth tokens and settings. GDPR erasure.
 */
export async function deleteCreatorData(uuid: string) {
  await init();
  await sql.begin(async (tx) => {
    await tx`DELETE FROM tips WHERE question_id IN (SELECT id FROM questions WHERE creator_uuid = ${uuid})`;
    await tx`DELETE FROM questions WHERE creator_uuid = ${uuid}`;
    await tx`DELETE FROM tokens WHERE subject_id = ${uuid}`;
    await tx`DELETE FROM creators WHERE uuid = ${uuid}`;
  });
}

/** Demo sandboxes (creator uuid "demo-…") created more than maxAgeMs ago. */
export async function staleDemoCreators(maxAgeMs: number) {
  return (await run("SELECT uuid FROM creators WHERE uuid LIKE 'demo-%' AND created_at < ?", Date.now() - maxAgeMs)).map((r) => r.uuid as string);
}

/** Every question a creator has ever received, paid or not: the demo's cost cap counts these. */
export async function questionCount(creatorUuid: string) {
  return (await one("SELECT COUNT(*) AS n FROM questions WHERE creator_uuid = ?", creatorUuid))!.n as number;
}
