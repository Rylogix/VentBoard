const SLUR_PATTERNS = [
  { id: "hard_r", pattern: /n+i+g{2}e+r+/ },
  { id: "soft_r", pattern: /n+i+g{2}a+/ },
  { id: "chink", pattern: /c+h+i+n+k+/ },
  { id: "retard", pattern: /r+e+t+a+r+d+/ },
];

const PROFANITY_WORDS = ["fuck", "shit", "ass", "damn", "bitch"];

const PROFANITY_REGEXES = PROFANITY_WORDS.map((word) => {
  const safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${safe}\\b`, "i");
});

function normalizeForSlurCheck(value) {
  if (typeof value !== "string") {
    return "";
  }

  let normalized = value.toLowerCase();
  normalized = normalized
    .replace(/@/g, "a")
    .replace(/0/g, "o")
    .replace(/[1!]/g, "i")
    .replace(/\$/g, "s")
    .replace(/3/g, "e");
  normalized = normalized.replace(/[^a-z]/g, "");
  normalized = normalized.replace(/([a-z])\1{2,}/g, "$1$1");
  return normalized;
}

export function containsSlur(value) {
  const normalized = normalizeForSlurCheck(value);
  if (!normalized) {
    return false;
  }
  return SLUR_PATTERNS.some(({ pattern }) => pattern.test(normalized));
}

export function containsProfanity(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }
  return PROFANITY_REGEXES.some((pattern) => pattern.test(value));
}

export { SLUR_PATTERNS, PROFANITY_WORDS };
