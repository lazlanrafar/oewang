import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { axiosInstance } from "@workspace/modules/server";

type OAuthCodeRequestBody = {
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string | null;
};

type AxiosLikeError = {
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("oewang-session")?.value;

  if (!sessionToken) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: OAuthCodeRequestBody;
  try {
    body = (await request.json()) as OAuthCodeRequestBody;
  } catch {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Invalid request payload" },
      { status: 400 },
    );
  }

  if (!body.client_id || !body.redirect_uri) {
    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "client_id and redirect_uri are required",
      },
      { status: 400 },
    );
  }

  try {
    const response = await axiosInstance.post(
      "oauth/code",
      {
        client_id: body.client_id,
        redirect_uri: body.redirect_uri,
        code_challenge: body.code_challenge ?? null,
      },
      {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      },
    );

    return NextResponse.json({ code: response.data.code }, { status: 200 });
  } catch (error: unknown) {
    const normalizedError = (error ?? {}) as AxiosLikeError;
    const status =
      typeof normalizedError.response?.status === "number"
        ? normalizedError.response.status
        : 500;

    const message =
      typeof normalizedError.response?.data?.message === "string"
        ? normalizedError.response.data.message
        : "Failed to create authorization code";

    return NextResponse.json({ error: "OAUTH_CODE_FAILED", message }, { status });
  }
}
