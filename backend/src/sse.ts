export type SseEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage?: { inputTokens?: number; outputTokens?: number } }
  | { type: "error"; code: string; message: string };

export function formatSse(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
