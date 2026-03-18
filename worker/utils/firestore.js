// ② API Gateway Layer — Firestore REST Client (Service Account OAuth2)
// Cloudflare Workers에서 Firebase Firestore REST API 연동

// Base64URL 인코딩
function b64url(str) {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64urlBuf(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Service Account JSON → Google OAuth2 Access Token
export async function getAccessToken(saJson, scope = 'https://www.googleapis.com/auth/datastore') {
  let sa;
  try { sa = JSON.parse(saJson); } catch (_) { return null; }

  const now     = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss:   sa.client_email,
    sub:   sa.client_email,
    scope,
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }));

  const sigInput  = `${header}.${payload}`;
  const pemContent = (sa.private_key || '').replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const keyBuf = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));

  try {
    const key = await crypto.subtle.importKey(
      'pkcs8', keyBuf,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    );
    const sig = b64urlBuf(
      await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(sigInput))
    );
    const jwt = `${sigInput}.${sig}`;

    const res  = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    const data = await res.json();
    return data.access_token || null;
  } catch (err) {
    console.error('[Firestore] token error:', err.message);
    return null;
  }
}

// ── Firestore Value 변환 ─────────────────────────────────────────────

function toFsVal(v) {
  if (v === null || v === undefined)  return { nullValue: null };
  if (typeof v === 'boolean')         return { booleanValue: v };
  if (typeof v === 'number')          return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string')          return { stringValue: v };
  if (Array.isArray(v))               return { arrayValue: { values: v.map(toFsVal) } };
  if (typeof v === 'object')          return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, val]) => [k, toFsVal(val)])) } };
  return { stringValue: String(v) };
}

function toFields(data) {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFsVal(v)]));
}

function fromFsVal(v) {
  if (!v)                           return null;
  if ('nullValue'      in v)        return null;
  if ('booleanValue'   in v)        return v.booleanValue;
  if ('integerValue'   in v)        return Number(v.integerValue);
  if ('doubleValue'    in v)        return v.doubleValue;
  if ('stringValue'    in v)        return v.stringValue;
  if ('timestampValue' in v)        return v.timestampValue;
  if ('arrayValue'     in v)        return (v.arrayValue.values || []).map(fromFsVal);
  if ('mapValue'       in v)        return fromDoc({ fields: v.mapValue.fields || {} });
  return null;
}

export function fromDoc(doc) {
  if (!doc || !doc.fields) return null;
  const obj = Object.fromEntries(
    Object.entries(doc.fields).map(([k, v]) => [k, fromFsVal(v)])
  );
  if (doc.name) obj._id = doc.name.split('/').pop();
  return obj;
}

// ── Firestore REST Client ────────────────────────────────────────────

export class FirestoreClient {
  constructor(projectId, accessToken) {
    this.projectId = projectId;
    this.base      = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    this.token     = accessToken;
  }

  _headers() {
    return { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  // 문서 추가 (자동 ID)
  async add(collection, data) {
    const res = await fetch(`${this.base}/${collection}`, {
      method:  'POST',
      headers: this._headers(),
      body:    JSON.stringify({ fields: toFields(data) }),
    });
    return res.ok ? await res.json() : null;
  }

  // 문서 저장/덮어쓰기 (지정 ID)
  async set(collection, docId, data) {
    const res = await fetch(`${this.base}/${collection}/${encodeURIComponent(docId)}`, {
      method:  'PATCH',
      headers: this._headers(),
      body:    JSON.stringify({ fields: toFields(data) }),
    });
    return res.ok;
  }

  // 배치 저장 (단일 HTTP 요청으로 최대 500건)
  async batchSet(collection, docsMap) {
    // docsMap: { [docId]: data }
    const baseName = `projects/${this.projectId}/databases/(default)/documents`;
    const writes = Object.entries(docsMap).map(([docId, data]) => ({
      update: {
        name:   `${baseName}/${collection}/${encodeURIComponent(docId)}`,
        fields: toFields(data),
      },
    }));
    if (!writes.length) return 0;
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:commit`;
    const res = await fetch(commitUrl, {
      method:  'POST',
      headers: this._headers(),
      body:    JSON.stringify({ writes }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[Firestore] commit failed', res.status, errText.slice(0, 200));
      return 0;
    }
    const result = await res.json();
    return (result.writeResults || []).length;
  }

  // 배치 삭제 (docId 배열, 최대 500건)
  async batchDelete(collection, docIds) {
    if (!docIds.length) return 0;
    const baseName = `projects/${this.projectId}/databases/(default)/documents`;
    const writes = docIds.map(id => ({
      delete: `${baseName}/${collection}/${encodeURIComponent(id)}`,
    }));
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:commit`;
    const res = await fetch(commitUrl, {
      method:  'POST',
      headers: this._headers(),
      body:    JSON.stringify({ writes }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[Firestore] batchDelete failed', res.status, errText.slice(0, 200));
      return 0;
    }
    const result = await res.json();
    return (result.writeResults || []).length;
  }

  // 구조화 쿼리 (복합 필터 + 정렬)
  async query(collection, filters = [], orderByField = null, limit = 100) {
    const sq = { from: [{ collectionId: collection }], limit };
    if (filters.length === 1)      sq.where = filters[0];
    else if (filters.length > 1)   sq.where = { compositeFilter: { op: 'AND', filters } };
    if (orderByField) sq.orderBy = [{ field: { fieldPath: orderByField }, direction: 'DESCENDING' }];

    const runUrl = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery`;
    const res = await fetch(runUrl, {
      method:  'POST',
      headers: this._headers(),
      body:    JSON.stringify({ structuredQuery: sq }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[Firestore] query failed', res.status, errText.slice(0, 300));
      return [];
    }
    const rows = await res.json();
    return rows.filter(r => r.document).map(r => fromDoc(r.document));
  }
}

// 필터 헬퍼
export function fsFilter(field, op, value) {
  const opMap = {
    '==': 'EQUAL', '!=': 'NOT_EQUAL',
    '<':  'LESS_THAN', '>': 'GREATER_THAN',
    '>=': 'GREATER_THAN_OR_EQUAL', '<=': 'LESS_THAN_OR_EQUAL',
  };
  return {
    fieldFilter: {
      field: { fieldPath: field },
      op:    opMap[op] || op,
      value: toFsVal(value),
    },
  };
}
