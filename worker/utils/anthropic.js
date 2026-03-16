// ② API Gateway Layer — Anthropic API 공통 유틸리티
// verify.js / claude.js / v4/claude.js 중복 제거

export async function callAnthropic(body, apiKey, extraHeaders = {}) {
  const opts = {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };

  let res = await fetch("https://api.anthropic.com/v1/messages", opts);

  // 403 시 1회 재시도
  if (res.status === 403) {
    await new Promise(r => setTimeout(r, 1000));
    res = await fetch("https://api.anthropic.com/v1/messages", opts);
  }

  return res;
}
