import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Creator } from "@/lib/db";

// Any Anthropic-compatible Messages API works unchanged: DeepSeek, OpenRouter
// or Anthropic itself. AI_API_KEY + AI_BASE_URL + AI_MODEL pick one.
const client = new Anthropic({ baseURL: process.env.AI_BASE_URL, apiKey: process.env.AI_API_KEY });
const MODEL = process.env.AI_MODEL ?? "";
const DEEPSEEK = MODEL.startsWith("deepseek");

// --- Screening -----------------------------------------------------------------

const Screen = z.object({
  verdict: z.enum(["ok", "flag", "reject"]),
  topic: z.string().min(1).max(40),
  reason: z.string().max(300),
});
export type Screening = z.infer<typeof Screen>;

const SCREEN_SYSTEM = `You check questions that fans pay to ask a creator on Fanvue, an adult creator platform, before the fan is charged. A fan should never pay for a question the creator will not answer.

Decide one verdict:
- reject: the question breaks one of the creator's stated boundaries; harasses, threatens or insults; asks for contact off Fanvue (phone, Snapchat, Instagram DMs, email), a meetup, or the creator's address, real name, workplace or other identifying details; involves anyone under 18; or asks for something illegal.
- flag: answerable, but the creator should read it carefully first. For example the fan sounds distressed or lonely, the topic is sensitive (health, grief, money trouble), or it sits close to a boundary without crossing it.
- ok: everything else. Flirty, personal and sexual questions are normal here and are ok unless a boundary says otherwise. Do not reject for being explicit.

The reason field:
- ok: empty string.
- flag: one short line for the creator saying what to watch for.
- reject: one short line to the fan, written to them ("you"), saying what the creator doesn't answer and how to rephrase if a version would be fine. Plain and kind, no apology, no exclamation marks. Never quote the boundaries verbatim. Any alternative you suggest is an everyday, non-sexual topic: their content, routine, favourites or advice.

Refer to the creator only by the name given. Never write "I", "the creator", or a pronoun for them (she, her, he, his, they, their); we don't know their pronouns. Repeat the name or rephrase: write "Alex doesn't share location details", not "Alex doesn't share where she lives".

The topic field: two or three lowercase words naming what the question is about, like "gym routine" or "first dates".

Record your decision by calling record_screening once. Do not reply in text.`;

const SCREEN_TOOL: Anthropic.Tool = {
  name: "record_screening",
  description: "Record the screening verdict for this question.",
  input_schema: {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["ok", "flag", "reject"] },
      topic: { type: "string" },
      reason: {
        type: "string",
        description:
          "Refer to the creator only by name, never a pronoun: \"Alex doesn't share where Alex lives\", not \"where she lives\". Don't end with \"edit your question\"; the app adds that.",
      },
    },
    required: ["verdict", "topic", "reason"],
  },
};

export async function screenQuestion(creator: { displayName: string; boundaries: string }, body: string, retried = false): Promise<Screening> {
  const name = creator.displayName.split(" ")[0];
  // DeepSeek only allows a forced tool call (our structured output) with
  // thinking off. Current Claude models always reason, and reasoning can't be
  // combined with a forced tool, so there the only tool is offered at low
  // effort; a missing call falls through to "flag" below.
  const res = await client.messages.create({
    model: MODEL,
    ...(DEEPSEEK
      ? { max_tokens: 400, thinking: { type: "disabled" as const }, tool_choice: { type: "tool" as const, name: SCREEN_TOOL.name } }
      : { max_tokens: 2000, output_config: { effort: "low" as const }, tool_choice: { type: "auto" as const } }),
    system: SCREEN_SYSTEM,
    tools: [SCREEN_TOOL],
    messages: [
      {
        role: "user",
        content: `${retried ? "Your last reason used a pronoun for the creator. Use only their name this time.\n\n" : ""}<creator name="${name}">\n<boundaries>\n${creator.boundaries.trim() || "(none stated)"}\n</boundaries>\n</creator>\n\n<fan_question>\n${body}\n</fan_question>`,
      },
    ],
  });
  const call = res.content.find((b) => b.type === "tool_use");
  const parsed = Screen.safeParse(call?.input);
  // Fail open to a human: if screening can't decide, the creator sees a flag.
  if (!parsed.success) return { verdict: "flag", topic: "needs review", reason: "Automatic screening couldn't assess this one." };
  const result = { ...parsed.data, reason: clean(parsed.data.reason) };
  // The reject reason is shown to the fan. We don't know the creator's
  // pronouns, so retry once if the model guessed some.
  if (result.verdict === "reject" && PRONOUN.test(result.reason)) {
    if (!retried) return screenQuestion(creator, body, true);
    // Still guessing after a retry: a plain reason beats a wrong pronoun.
    return { ...result, reason: `${name} doesn't answer questions like this one.` };
  }
  return result;
}

const PRONOUN = /\b(she|her|hers|herself|he|him|his|himself)\b/i;

// --- Drafting ------------------------------------------------------------------

type Example = { question: string; answer: string };

/** Measurable habits of the creator's writing, so the prompt can state them as numbers. */
export function voiceProfile(examples: Example[]) {
  const answers = examples.map((e) => e.answer).filter(Boolean);
  if (!answers.length) return null;
  const words = answers.map((a) => a.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b);
  const emoji = answers.map((a) => (a.match(/\p{Extended_Pictographic}/gu) ?? []).length);
  const lowercaseStarts = answers.filter((a) => /^[a-z]/.test(a.trim())).length;
  return {
    medianWords: words[Math.floor(words.length / 2)]!,
    maxWords: words[words.length - 1]!,
    emojiPerAnswer: emoji.reduce((a, b) => a + b, 0) / answers.length,
    lowercase: lowercaseStarts / answers.length >= 0.6,
    exclamations: answers.some((a) => a.includes("!")),
  };
}

const DRAFT_SYSTEM = `You write a creator's reply to a question a fan paid to ask them on Fanvue. The creator reads every draft and sends it themselves, so write the exact message they would send, as them, in first person.

What a good reply does:
- Answers the question directly in the first sentence. No warm-up.
- Gives one real, specific detail (a named thing, a number, a habit, a moment) instead of general advice.
- Sounds like a text from a person, in the creator's own style: their casing, their emoji habits, their slang, their length.
- Stops when the answer is done.

Never write any of these. They make a reply read as AI and fans notice:
- Em dashes or en dashes. Use a comma, a full stop or "tho" instead.
- Openers that praise or restate the question: "Great question", "Ooh I love this", "Honestly, that's such a good one", "So you want to know".
- "It's not X, it's Y" contrasts, lists of three, bullet points, numbered steps, headings or hashtags.
- Therapist or coach voice: "it's okay to feel", "remember that", "you've got this", "be kind to yourself", "journey", "self-care is key".
- Filler and inflated words: "truly", "absolutely", "definitely", "super important", "at the end of the day", "navigate", "embrace", "vibe check".
- Ending on a question back to the fan or a sign-off ("hope this helps", "xoxo", "let me know"), unless the creator's past answers do that.
- Asking for tips, subscriptions or purchases.

Facts: never invent anything about the creator's life that isn't in their notes or past answers: no names, places, dates, numbers, durations, prices or events. If the answer needs one, write a short [placeholder in brackets] for the creator to fill in, at most two per reply.

Output only the message text.`;

function styleBrief(creator: Pick<Creator, "voice" | "boundaries">, profile: ReturnType<typeof voiceProfile>) {
  const lines = [creator.voice.trim() ? `How they describe their own style: ${creator.voice.trim()}` : "No style notes yet: write casually and briefly."];
  if (profile) {
    lines.push(
      `Length: their answers run about ${profile.medianWords} words (never more than ${Math.round(profile.maxWords * 1.2)}).`,
      profile.lowercase ? "Casing: they write in lowercase, including the first word." : "Casing: normal sentence case.",
      `Emoji: about ${Math.max(0, Math.round(profile.emojiPerAnswer))} per answer${profile.emojiPerAnswer < 0.5 ? ", so usually none" : ""}.`,
      profile.exclamations ? "Exclamation marks: they use them sometimes." : "Exclamation marks: they don't use them.",
    );
  }
  if (creator.boundaries.trim()) lines.push(`Topics they won't discuss (steer around, don't mention): ${creator.boundaries.trim()}`);
  return lines.join("\n");
}

/** AI tells a checker can catch without a model; each finding feeds the revision pass. */
export function slopFindings(text: string, profile: ReturnType<typeof voiceProfile>): string[] {
  const f: string[] = [];
  if (/[—–]/.test(text)) f.push("It uses a dash (— or –). Replace it with a comma or full stop.");
  if (/^\W*(great|good|love|ooh|omg,? i love|what a|such a good|honestly,? (that'?s|this is) (such )?a)\b[^.!?\n]{0,30}(question|one|ask)/i.test(text))
    f.push("It opens by praising the question. Start with the answer.");
  if (/\bit'?s not (just )?[^.,!?]{1,40}[,;] it'?s\b/i.test(text)) f.push('It uses an "it\'s not X, it\'s Y" construction. Say the point directly.');
  if (/^\s*([-*•]|\d+[.)])\s/m.test(text)) f.push("It uses a list. Write it as a message.");
  if (/#\w/.test(text)) f.push("It uses hashtags. Remove them.");
  const banned = text.match(
    /\b(delve|journey|navigate|embrace|tapestry|testament|truly|absolutely|at the end of the day|self-care is key|it'?s okay to feel|remember that|you'?ve got this|hope this helps|let me know)\b/gi,
  );
  if (banned) f.push(`It uses these phrases, which read as AI: ${[...new Set(banned.map((b) => b.toLowerCase()))].join(", ")}. Rephrase in the creator's words.`);
  if (/\b(tip|subscribe|subscription|unlock|ppv)\b/i.test(text)) f.push("It mentions tips, subscribing or buying. Remove that.");
  if (profile) {
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words > profile.maxWords * 1.4) f.push(`It is ${words} words; their answers run about ${profile.medianWords}. Cut it to that length.`);
    if (profile.lowercase && /^[A-Z][a-z]/.test(text.trim())) f.push("It starts with a capital letter; this creator writes in lowercase.");
    const emoji = (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
    if (emoji > Math.max(2, Math.ceil(profile.emojiPerAnswer * 2))) f.push(`It has ${emoji} emoji; they use about ${Math.round(profile.emojiPerAnswer)}.`);
    if (!profile.exclamations && text.includes("!")) f.push("It uses exclamation marks; this creator doesn't.");
  }
  return f;
}

/** Last-resort cleanup for what a revision might still leave behind. */
const clean = (t: string) => t.replace(/\s*[—–]\s*/g, ", ").replace(/\s+,/g, ",").trim();

const text = (res: Anthropic.Message) => res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();

export async function draftAnswer(creator: Pick<Creator, "displayName" | "voice" | "boundaries">, question: { body: string; fanName: string }, examples: Example[]) {
  const profile = voiceProfile(examples);
  // Past answers go in as real conversation turns: a smaller model copies
  // what it sees far better than what it's told.
  const shots: Anthropic.MessageParam[] = examples.slice(0, 8).flatMap((e) => [
    { role: "user" as const, content: e.question },
    { role: "assistant" as const, content: e.answer },
  ]);
  const system = `${DRAFT_SYSTEM}\n\n<creator name="${creator.displayName}">\n${styleBrief(creator, profile)}\n</creator>`;

  const first = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    output_config: { effort: "high" },
    system,
    messages: [...shots, { role: "user", content: question.body }],
  });
  let draft = text(first);
  if (!draft) throw new Error("Got an empty draft. Try again.");

  // One targeted revision if the checker finds tells. Cheaper models follow
  // "fix these specific things" much better than a long list of don'ts.
  const findings = slopFindings(draft, profile);
  if (findings.length) {
    const revised = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      output_config: { effort: "low" },
      system,
      messages: [
        ...shots,
        { role: "user", content: question.body },
        { role: "assistant", content: draft },
        {
          role: "user",
          content: `Rewrite that reply to fix these problems, and change nothing else:\n${findings.map((x) => `- ${x}`).join("\n")}\n\nOutput only the new message.`,
        },
      ],
    });
    draft = text(revised) || draft;
  }
  return clean(draft);
}

// --- Demo: simulated fans -------------------------------------------------------

export type FanKind = "normal" | "sensitive" | "crosses";
const SimFan = z.object({ name: z.string().min(1).max(30), question: z.string().min(3).max(300), tier: z.enum(["question", "priority"]) });
const FAN_TOOL: Anthropic.Tool = {
  name: "record_fan_question",
  description: "Record the simulated fan and their question.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The fan's display name: a casual first name or username, like 'jess_m' or 'Tom'." },
      question: { type: "string", description: "The question, one or two sentences, typed the way a fan types in an app." },
      tier: { type: "string", enum: ["question", "priority"], description: "priority for roughly one in four fans." },
    },
    required: ["name", "question", "tier"],
  },
};
const KIND: Record<FanKind, string> = {
  normal: "A friendly, specific question about the creator's life, routine, content or advice. The kind most fans ask.",
  sensitive: "The fan shares something personal (a rough week, nerves, a loss) and asks for advice. Answerable, but needs care.",
  crosses: "A question that clearly breaks one of the creator's stated boundaries below, asked casually, not aggressively.",
};

/** One made-up fan question for the demo inbox. Safe for work, always. */
export async function simulateFanQuestion(creator: { displayName: string; boundaries: string }, kind: FanKind, recent: string[]) {
  const res = await client.messages.create({
    model: MODEL,
    ...(DEEPSEEK
      ? { max_tokens: 300, thinking: { type: "disabled" as const }, tool_choice: { type: "tool" as const, name: FAN_TOOL.name } }
      : { max_tokens: 1500, output_config: { effort: "low" as const }, tool_choice: { type: "auto" as const } }),
    system: `You write realistic, safe-for-work questions that fans pay to ask a creator on Fanvue, for a product demo. Vary the fans and topics. Never sexual or explicit. Record the fan by calling ${FAN_TOOL.name} once; do not reply in text.`,
    tools: [FAN_TOOL],
    messages: [
      {
        role: "user",
        content: `<creator name="${creator.displayName}">\n<boundaries>\n${creator.boundaries || "(none stated)"}\n</boundaries>\n</creator>\n\nKind of question: ${KIND[kind]}\nThe fan's name starts with "${"ABCDEFGHJKLMNPRSTWZ"[Math.floor(Math.random() * 19)]}".\n\nDon't repeat these recent questions:\n${recent.map((q) => `- ${q}`).join("\n") || "(none yet)"}`,
      },
    ],
  });
  const parsed = SimFan.safeParse(res.content.find((b) => b.type === "tool_use")?.input);
  if (!parsed.success) throw new Error("Couldn't simulate a fan this time. Try again.");
  return { ...parsed.data, question: clean(parsed.data.question) };
}
