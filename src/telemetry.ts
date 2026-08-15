/**
 * Traffic sensing — classify each request by AI-bot user-agent and log to D1 (access_events).
 * Client analytics never fire for bots, so this is how we "see the agents." Our own server-render
 * fetches are excluded upstream (they carry an X-Render header) so the numbers reflect real demand.
 */
import { Env } from "./lib";

// Known AI bot tokens (2026). Matching is substring on the UA. Extend freely.
const AI_BOTS: { token: string; name: string; kind: "training" | "search" | "live" }[] = [
  { token: "GPTBot", name: "OpenAI GPTBot", kind: "training" },
  { token: "OAI-SearchBot", name: "OpenAI SearchBot", kind: "search" },
  { token: "ChatGPT-User", name: "ChatGPT (live fetch)", kind: "live" },
  { token: "ClaudeBot", name: "Anthropic ClaudeBot", kind: "training" },
  { token: "Claude-SearchBot", name: "Claude SearchBot", kind: "search" },
  { token: "Claude-User", name: "Claude (live fetch)", kind: "live" },
  { token: "PerplexityBot", name: "PerplexityBot", kind: "search" },
  { token: "Perplexity-User", name: "Perplexity (live fetch)", kind: "live" },
  { token: "Google-Extended", name: "Google Gemini", kind: "training" },
  { token: "Bytespider", name: "ByteDance", kind: "training" },
  { token: "Amazonbot", name: "Amazon", kind: "training" },
  { token: "Applebot-Extended", name: "Apple", kind: "training" },
  { token: "Meta-ExternalAgent", name: "Meta", kind: "training" },
  { token: "CCBot", name: "Common Crawl", kind: "training" },
  { token: "cohere-ai", name: "Cohere", kind: "training" },
  { token: "DuckAssistBot", name: "DuckDuckGo Assist", kind: "search" },
  { token: "YouBot", name: "You.com", kind: "search" },
  { token: "mistral", name: "Mistral", kind: "training" },
];

export type BotClass = { bot: boolean; name: string; kind: "training" | "search" | "live" | "other" };

export function classifyUA(ua: string | null): BotClass {
  if (!ua) return { bot: false, name: "unknown", kind: "other" };
  for (const b of AI_BOTS) if (ua.includes(b.token)) return { bot: true, name: b.name, kind: b.kind };
  return { bot: false, name: "human/other", kind: "other" };
}

export type EventInput = {
  ts: string; path: string; method: string;
  tool?: string | null; tier?: string | null; paid?: boolean;
  status: number; ua: string; referer?: string | null; bot_kind: string; bot_name: string;
};

export async function logEvent(env: Env, ev: EventInput): Promise<void> {
  try {
    await env.DB.prepare(
      "INSERT INTO access_events (ts,path,method,tool,tier,paid,status,ua,referer,bot_kind,bot_name) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)"
    ).bind(
      ev.ts, ev.path.slice(0, 200), ev.method, ev.tool ?? null, ev.tier ?? null,
      ev.paid ? 1 : 0, ev.status, (ev.ua ?? "").slice(0, 300), (ev.referer ?? "").slice(0, 200) || null,
      ev.bot_kind, ev.bot_name
    ).run();
  } catch {
    /* telemetry must never break a request */
  }
}
