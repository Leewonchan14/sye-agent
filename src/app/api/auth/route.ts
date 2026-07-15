import { createToken } from "@/lib/auth";

export const runtime = "edge";

export const POST = async (req: Request) => {
  try {
    const { password } = await req.json();
    const expectedPassword = process.env.SITE_PASSWORD;

    if (!expectedPassword) {
      console.error("SITE_PASSWORD environment variable not set");
      return Response.json(
        { success: false, error: "서버 설정 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    if (password === expectedPassword) {
      const token = await createToken(password);
      return Response.json({ success: true, token });
    }

    return Response.json({ success: false, error: "비밀번호가 틀렸습니다." });
  } catch {
    return Response.json(
      { success: false, error: "요청을 처리할 수 없습니다." },
      { status: 400 }
    );
  }
};
