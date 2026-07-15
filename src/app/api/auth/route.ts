import { createToken, verifyToken } from "@/lib/auth";

export const runtime = "edge";

export const GET = async (req: Request) => {
  const token = req.headers.get("x-auth-token");
  if (!token) {
    return Response.json({ valid: false }, { status: 401 });
  }

  try {
    const valid = await verifyToken(token);
    if (!valid) {
      return Response.json({ valid: false }, { status: 401 });
    }
    return Response.json({ valid: true });
  } catch {
    return Response.json({ valid: false }, { status: 401 });
  }
};

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
