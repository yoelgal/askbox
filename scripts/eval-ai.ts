// Prompt eval for screening and drafting. Spends a few cents of API credit.
//   node --env-file=.env.local --experimental-strip-types scripts/eval-ai.ts
import { draftAnswer, screenQuestion, slopFindings, voiceProfile } from "../src/lib/ai.ts";

const creator = {
  displayName: "Mia",
  voice: "Lowercase mostly, lots of emoji (🥹😭✨), short and warm. Calls fans 'babe' sometimes. Never formal.",
  boundaries: "No questions about my family or where I live. No meetups. Nothing about exes.",
};

// Expected verdicts. "ok|flag" means either is acceptable.
const SCREEN: [string, string][] = [
  ["What's your favourite pizza topping?", "ok"],
  ["What's the kinkiest thing you've ever done? 😏", "ok"],
  ["Would you ever date a fan?", "ok|flag"],
  ["What city do you live in? I'm in Manchester too", "reject"],
  ["Can we meet up for coffee sometime? I'll pay", "reject"],
  ["What's your snapchat so we can talk more", "reject"],
  ["Do you still talk to your ex?", "reject"],
  ["How are your parents doing? Do they know about your page?", "reject"],
  ["I've been really low lately and your posts are the only thing keeping me going", "flag"],
  ["You're ugly and fake, why do people pay for this", "reject"],
];

const DRAFT = [
  "What's one thing you'd tell someone on day one of their page?",
  "Honestly just having a rough few weeks and your posts help. How do you stay positive when things are crap?",
  "Where's the next trip?? You said something about Lisbon ages ago",
  "What does your morning routine actually look like? Like the real one, not the Instagram one 😅",
];

const PAST = [
  { question: "What's on repeat right now?", answer: "ok don't judge but it's been the same 3 songs all week 😭 mostly old Frank Ocean + whatever my gym playlist throws at me. send me recs tho!!" },
  { question: "What's your gym split? Your progress has been crazy", answer: "thank youuu 🥹 4 days: push, pull, legs, then a lazy full-body day that's mostly vibes. consistency > everything honestly" },
  { question: "Best meal you've had this year?", answer: "a tiny pasta place in Rome, cacio e pepe, I think about it weekly 🍝 no notes" },
];

let pass = 0;
console.log("== Screening");
await Promise.all(
  SCREEN.map(async ([q, want]) => {
    const s = await screenQuestion(creator, q);
    const ok = want.split("|").includes(s.verdict);
    if (ok) pass++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${s.verdict.padEnd(6)} want ${want.padEnd(8)} ${q}\n        ${s.topic} | ${s.reason}`);
  }),
);
console.log(`screening ${pass}/${SCREEN.length}\n`);

console.log("== Drafts");
const profile = voiceProfile(PAST);
for (const q of DRAFT) {
  const d = await draftAnswer(creator, { body: q, fanName: "Casey" }, PAST);
  const left = slopFindings(d, profile);
  console.log(`Q: ${q}\nA: ${d}\n   ${left.length ? `TELLS LEFT: ${left.join(" / ")}` : "clean"}\n`);
}
