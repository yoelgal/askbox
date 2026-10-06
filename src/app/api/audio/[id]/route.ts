import { notFound, unauthorized } from "@fanvue/builder-sdk/nextjs/embedded-app";
import { getAudio, getQuestion } from "@/lib/db";
import { sessions } from "@/lib/fanvue";

/**
 * Voice answers. Bearer-authed like everything else, so the client fetches the
 * bytes and plays them from an object URL. Heard by the creator, the fan who
 * asked, and, once shared on the wall, the creator's other fans.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = req.headers.get("authorization");
  const [creator, fan] = await Promise.all([sessions.getCreatorSession(auth), sessions.getFanSession(auth)]);
  if (!creator && !fan) return unauthorized();

  const q = await getQuestion((await ctx.params).id);
  const allowed =
    q &&
    (creator
      ? q.creatorUuid === creator.subjectId
      : q.creatorUuid === fan!.creatorUuid && (q.fanUuid === fan!.fanvueFanUuid || (q.isPublic && q.status === "answered")));
  const audio = allowed ? await getAudio(q.id) : null;
  if (!audio) return notFound();

  return new Response(new Uint8Array(audio.data), {
    headers: { "content-type": audio.mime, "cache-control": "private, max-age=3600" },
  });
}
