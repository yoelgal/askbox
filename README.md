# Askbox

Paid Q&A for Fanvue creators, built as a fan experience. It lives on the creator's
profile, fans pay per question from inside Fanvue, and the creator answers from an
embedded dashboard.

Live demo: [askbox.yoelgal.com/demo](https://askbox.yoelgal.com/demo). You play both
sides; payments and messages are simulated, the AI is real.

- **Screened before payment.** AI checks each question against the creator's boundaries
  before the fan pays. A question the creator won't answer is stopped with a kind
  reason and nothing is charged; sensitive ones are flagged for a careful read.
- **Two tiers and tips.** *Question* or *Priority*, each with a reply-time promise the
  fan sees before paying. The inbox sorts by what's due soonest. Fans can tip answers.
- **Answers in the creator's voice.** Text or a voice note. *Draft with AI* writes from
  their tone notes and past answers; nothing is sent until they press send. Answers
  arrive in the fan's Askbox and as a DM.
- **Brand theme.** Accent colour (or one pulled from the profile photo), cover and
  headline, applied by overriding a few `@fanvue/ui` tokens so every component follows.

## Run it

Needs Node 22.13+, pnpm and Postgres (a free Neon branch works).

```bash
pnpm install
cp .env.example .env.local   # ASKBOX_DEV=true runs without Fanvue credentials
# set DATABASE_URL and the three AI_ vars
pnpm dev
```

- `/creator`: the creator dashboard, seeded as Sam, a strength coach
- `/experience`: what fans see on Sam's profile
- `/demo`: both side by side, behind `DEMO_PASSWORD`

Outside Fanvue, payment uses a stand-in sheet. Add `?theme=light` for the light theme.

`pnpm smoke [url]` runs the demo end to end against a server without `ASKBOX_DEV`. `pnpm eval` runs
10 labelled screening cases and four drafts through the AI-tell checker.

## Inside Fanvue

In the Builder: **Embedded App → Fan experience**, with `https://<host>/experience` as
the fan URL and `https://<host>/creator` as the creator settings URL. Register
`https://<host>/oauth/callback` as the redirect, add the scopes from `.env.example`, and
point an Events webhook at `https://<host>/api/webhooks/fanvue`.

## How it works

| Step | Mechanism |
|---|---|
| Creator opens the app | `?token=` → `@fanvue/builder-sdk` delegated exchange → OAuth tokens, AES-GCM encrypted at rest, refreshed with compare-and-swap |
| Creator publishes | `POST /v1/experiences/request-token` with three priced actions (`question`, `priority`, `tip`) → `fanvue:experience:publish-request` → Fanvue's modal, where the creator sets the real prices |
| Fan opens it | launch token → `/experiences/token/exchange` → short-lived fan JWT, sent as a bearer because the fan iframe has an opaque origin |
| Fan asks | AI screening (forced tool call, validated with zod) → unpaid question row, whose id becomes the purchase's `clientReferenceId` |
| Fan pays | `fanvue:experience:purchase-request` → Fanvue's payment sheet → `purchase-result` |
| Fulfilment | The result message is UX only. The server re-reads `GET /experiences/{id}/action-purchases/{ref}` and marks the question paid only if it succeeded for this fan, action and question. The `app.experience.action.*` webhook does the same read; both are idempotent. Refunds and chargebacks drop the question. |
| Creator answers | Atomic `paid → answered` claim (no double sends), then `POST /v1/chats/{fan}/message` |

The fan-side `purchase-request`/`-result` messages aren't in the public docs yet; their
shape comes from Fanvue's host code.

## Decisions

- **Screen before payment.** There's no refund API for experience actions, so a declined
  paid question would be stuck. Screening fails open to a *flag*, so a model outage
  never blocks a fan.
- **Human in the loop.** AI drafts, the creator sends.
- **The creator owns prices.** The app suggests $5 and $15; Fanvue's modal sets the real
  price and the app reads it live.
- **Any Anthropic-compatible model.** `AI_API_KEY`, `AI_BASE_URL` and `AI_MODEL` pick it;
  the example uses DeepSeek V4.1 Flash (a fraction of a cent per draft). DeepSeek
  processes data in China, which a UK adult platform should settle before launch;
  Claude is a config change. Drafts are
  checked for AI tells (dashes, "great question", lists, sign-offs) and revised once if
  any slip through.
- **Postgres, no ORM.** `src/lib/db.ts` is plain SQL; the schema is created on first
  query until a column first needs a migration.

## Next

1. Submit to the App Store (the listing is drafted in the Builder).
2. Move voice notes from Postgres `BYTEA` to object storage.
3. Wallet top-up with spend consent, for one-tap repeat questions and tips.
4. Reminders when a priority question nears its promise.
