// End-to-end check of the password-protected demo, against a running server
// without ASKBOX_DEV (which lets any demo request in, so the refusal checks fail).
//   node --env-file=.env.local scripts/smoke.mjs [baseUrl]
// Uses real AI (a few screening calls, one simulated fan, one draft): about 2 cents.
const B = process.argv[2] ?? "http://localhost:3000";
const call = async (path, { method = "GET", body, jwt } = {}) => {
  const r = await fetch(B + path, { method, headers: { "content-type": "application/json", ...(jwt && { authorization: `Bearer ${jwt}` }) }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
const ok = (c, msg) => { if (!c) { console.error("FAIL", msg); process.exit(1); } console.log("ok  ", msg); };

ok((await call("/api/auth/session", { method: "POST", body: { dev: true } })).status === 401, "demo sign-in without a token is refused");
ok((await call("/api/demo/login", { method: "POST", body: { password: "wrong" } })).status === 401, "wrong password is refused");
const login = async () => (await call("/api/demo/login", { method: "POST", body: { password: process.env.DEMO_PASSWORD } })).data.token;
const demo = await login();
ok(typeof demo === "string", "right password gets a demo token");
const [sid, exp] = demo.split(".");
ok((await call("/api/auth/session", { method: "POST", body: { dev: true, demo: `${sid}.${exp}.forged` } })).status === 401, "tampered token is refused");

const C = (await call("/api/auth/session", { method: "POST", body: { dev: true, demo } })).data.token;
const F = (await call("/api/experience/session", { method: "POST", body: { dev: true, demo } })).data.token;
const creator = (await call("/api/creator", { jwt: C })).data;
ok(creator.creator.uuid === `demo-${sid}` && creator.inbox.length === 5, `sandbox demo-${sid} seeded with 5 waiting questions`);
const other = (await call("/api/auth/session", { method: "POST", body: { dev: true, demo: await login() } })).data.token;
ok((await call("/api/creator", { jwt: other })).data.creator.uuid !== creator.creator.uuid, "a second login gets its own sandbox");

const fan = (await call("/api/experience", { jwt: F })).data;
ok(fan.mine.length === 1 && fan.mine[0].audioMs > 0 && fan.prices.length === 3, "fan sees their voice answer and the three prices");

const stopped = await call("/api/experience/questions", { method: "POST", jwt: F, body: { body: "My knee hurts when I squat, what is wrong with it?", tier: "question", isPublic: false } });
ok(stopped.data.rejected === true, `boundary question stopped: "${stopped.data.reason}"`);
const asked = await call("/api/experience/questions", { method: "POST", jwt: F, body: { body: "How do I get my first pull-up?", tier: "priority", isPublic: true } });
ok(asked.data.id, "normal question passes screening");
ok((await call(`/api/experience/questions/${asked.data.id}/confirm`, { method: "POST", jwt: F, body: { purchaseReference: `demo_question_${asked.data.id}`, kind: "question" } })).data.status === "paid", "simulated payment confirmed");
ok((await call("/api/creator", { jwt: C })).data.inbox.some((q) => q.id === asked.data.id), "creator sees the new paid question");

const sim = await call("/api/demo/simulate", { method: "POST", body: { demo } });
ok(sim.status === 200 && ["paid", "stopped"].includes(sim.data.status), `simulated fan ${sim.data.name}: ${sim.data.status} "${sim.data.question}"`);
ok((await call("/api/demo/simulate", { method: "POST", body: { demo: "nope" } })).status === 401, "simulate refuses without a token");

const draft = await call(`/api/creator/questions/${asked.data.id}`, { method: "POST", jwt: C, body: { action: "draft" } });
ok(typeof draft.data.draft === "string" && draft.data.draft.length > 10, `AI draft: "${draft.data.draft}"`);
