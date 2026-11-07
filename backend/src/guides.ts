/** 許可するガイドの一覧。ここに無い値は API で拒否する。 */
export const GUIDE_IDS = ["know", "run", "decide", "hardware", "security"] as const;
export type GuideId = (typeof GUIDE_IDS)[number];

export function isGuideId(value: unknown): value is GuideId {
  return typeof value === "string" && (GUIDE_IDS as readonly string[]).includes(value);
}
