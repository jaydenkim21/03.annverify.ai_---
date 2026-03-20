// ② API Gateway Layer — Anthropic API 공통 유틸리티
// verify.js / claude.js / v4/claude.js 중복 제거

export async function callAnthropic(body, apiKey, extraHeaders = {}, timeoutMs = 0) {
  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
    ...extraHeaders,
  };

  const doFetch = (signal) =>
    fetch("https://gateway.ai.cloudflare.com/v1/2b10ac43a3fe8ddb0d93bd28f06338b2/ann-verify/anthropic/v1/messages", {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });

  // timeoutMs 지정 시 AbortController로 타임아웃 적용
  if (timeoutMs > 0) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let res = await doFetch(ctrl.signal);
      // 403 시 1회 재시도
      if (res.status === 403) {
        await new Promise(r => setTimeout(r, 1000));
        res = await doFetch(ctrl.signal);
      }
      clearTimeout(tid);
      return res;
    } catch (err) {
      clearTimeout(tid);
      throw err; // AbortError 포함 — 호출부 catch로 전달
    }
  }

  let res = await doFetch();

  // 403 시 1회 재시도
  if (res.status === 403) {
    await new Promise(r => setTimeout(r, 1000));
    res = await doFetch();
  }

  return res;
}
