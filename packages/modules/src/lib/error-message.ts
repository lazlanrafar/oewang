type MaybeRecord = Record<string, unknown>;

function readMessageFromRecord(
  value: MaybeRecord | null | undefined,
): string | null {
  if (!value) return null;

  const direct = value.message;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct;
  }

  const errorField = value.error;
  if (typeof errorField === "string" && errorField.trim().length > 0) {
    return errorField;
  }

  return null;
}

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") {
    return error instanceof Error && error.message.trim().length > 0
      ? error.message
      : fallback;
  }

  const errObj = error as MaybeRecord;
  const response = errObj.response as MaybeRecord | undefined;
  const responseData = response?.data as MaybeRecord | undefined;

  const messageFromResponseData = readMessageFromRecord(responseData);
  if (messageFromResponseData) return messageFromResponseData;

  const messageFromResponse = readMessageFromRecord(response);
  if (messageFromResponse) return messageFromResponse;

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const messageFromError = readMessageFromRecord(errObj);
  if (messageFromError) return messageFromError;

  return fallback;
}
