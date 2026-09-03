import { cookies } from "next/headers";
import { Env } from "@workspace/constants";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const cookieName = Env.NEXT_PUBLIC_SESSION_COOKIE_NAME || "oewang-session";
  const token = cookieStore.get(cookieName)?.value;

  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const baseUrl = Env.AI_SERVICE_URL;
  if (!baseUrl) {
    return new Response(JSON.stringify({ error: "AI service URL not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const res = await fetch(`${baseUrl}/chat/web/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(Env.AI_SERVICE_API_KEY ? { "x-api-key": Env.AI_SERVICE_API_KEY } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Upstream error" }));
      return new Response(JSON.stringify(err), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Stream SSE directly back to browser
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Streaming failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
