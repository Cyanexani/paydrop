/**
 * Without Anthropic credentials (or with AI_MODE=mock) every AI feature uses a deterministic
 * demo implementation, so the whole product can be demoed offline. AI_MODE=claude forces Claude.
 */
export function isMockAI(): boolean {
  if (process.env.AI_MODE === "mock") return true;
  if (process.env.AI_MODE === "claude") return false;
  return !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN;
}
