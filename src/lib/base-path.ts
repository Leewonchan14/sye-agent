/**
 * worktree 미리보기(<name> 아래 basePath)에서 도메인 루트로 가는 절대경로를 앱 아래로 옮긴다.
 *
 * 운영(Vercel)에는 NEXT_PUBLIC_BASE_PATH 가 없어서 경로를 그대로 돌려준다.
 * preview 로 띄울 때는 NEXT_PUBLIC_BASE_PATH=/preview/<name> 로 빌드·실행한다.
 */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const withBasePath = (path: string) =>
  basePath && path.startsWith("/") ? `${basePath}${path}` : path;
