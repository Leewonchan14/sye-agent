/**
 * worktree 미리보기 입구 (2026-11-25)
 *
 *   성예은.wonchan.kr/preview/<worktree>[/...]  →  https://<worktree>.preview.wonchan.kr/[...]
 *
 * 미리보기 앱은 서버에서 `next start` 로 돌고, caddy-monitor 가
 * `<worktree>.preview.wonchan.kr` 을 그 포트로 넘긴다. 여기서는 이름만 도메인으로 옮긴다.
 * (Next 앱을 경로 아래에 그대로 붙이면 /_next·/api 절대경로가 깨져서 경로가 아니라 호스트로 넘긴다.)
 */

const PREVIEW_DOMAIN = "preview.wonchan.kr";
const WORKTREE_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const runtime = "edge";

export const GET = async (
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> }
) => {
  const { path = [] } = await ctx.params;
  const [name, ...rest] = path;

  if (!name || !WORKTREE_NAME.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  // Next 16 은 동적 구간 값을 쿼리에도 붙여 준다(?path=calendar&path=dates).
  // 목적지로는 넘기지 않는다.
  const query = new URL(req.url).searchParams;
  query.delete("path");

  const target = new URL(`https://${name}.${PREVIEW_DOMAIN}`);
  target.pathname = rest.length ? `/${rest.map(encodeURIComponent).join("/")}` : "/";
  target.search = query.toString();

  return new Response(null, {
    status: 307,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
};
