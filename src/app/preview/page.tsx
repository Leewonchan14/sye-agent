import { notFound } from "next/navigation";

/** /preview 는 입구가 아니다. /preview/<worktree> 만 서버 미리보기로 넘어간다. */
const PreviewIndex = () => notFound();

export default PreviewIndex;
