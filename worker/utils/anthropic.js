// ② API Gateway Layer — Anthropic API 공통 유틸리티
// verify.js / claude.js / v4/claude.js 중복 제거

export async function callAnthropic(body, apiKey) {
  console.log("[callAnthropic] model:", body.model, "| key prefix:", apiKey ? apiKey.slice(0, 20) : "MISSING");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  console.log("[callAnthropic] status:", res.status);
  return res;
}
