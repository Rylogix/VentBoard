export const MAX_REPLY_NAME_LENGTH = 24;

export function normalizeReplyName(value) {
  if (typeof value !== "string") {
    return { value: null, error: "" };
  }

  if (/[\r\n\t]/.test(value)) {
    return { value: null, error: "Name cannot contain line breaks or tabs." };
  }

  const collapsed = value.replace(/ +/g, " ").trim();
  if (!collapsed) {
    return { value: null, error: "" };
  }

  if (collapsed.length > MAX_REPLY_NAME_LENGTH) {
    return {
      value: null,
      error: `Name must be ${MAX_REPLY_NAME_LENGTH} characters or fewer.`,
    };
  }

  return { value: collapsed, error: "" };
}
