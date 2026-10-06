import { fanQuestions, getCreator, publicWall } from "@/lib/db";
import { actionPrices, fanGuard } from "@/lib/fanvue";

// Everything the fan surface renders, in one call.
export async function GET(req: Request) {
  const g = await fanGuard(req);
  if (!g.ok) return g.response;
  const s = g.session;
  const creator = (await getCreator(s.creatorUuid))!;
  const prices = await actionPrices(creator.uuid, s.experienceUuid).catch((e) => {
    console.error("[askbox] prices failed", e);
    return [];
  });
  // Fans see the answer text and their own question, never other fans' names.
  const wall = (await publicWall(creator.uuid)).map(({ id, body, answer, answeredAt, audioMs }) => ({ id, body, answer, answeredAt, audioMs }));
  return Response.json({
    creator: { displayName: creator.displayName, handle: creator.handle, avatarUrl: creator.avatarUrl, replyHours: creator.replyHours, theme: creator.theme },
    prices,
    mine: await fanQuestions(creator.uuid, s.fanvueFanUuid),
    wall,
    preview: s.preview,
  });
}
