// ① Client Layer — 팩트체크 실행 + 로딩 UI
// ③ ML Core Layer (ANNEngineV4) 연동 포함

var LAYER_ICONS = ['source','travel_explore','database','shield','robot','fact_check','verified'];
var LAYER_NAMES = ['Claim Parse','Source Strategy','Evidence','Adversarial','NLI Score','Verdict','BISL Hash'];
var _layer7Timer = null;
var _layer7Start = null;
var _verifyRetrying = false;

var WAIT_MSGS = [
  'Analyzing claim structure...',
  'Searching credible sources...',
  'Cross-referencing evidence...',
  'Evaluating source reliability...',
  'Running NLI consistency check...',
  'Computing adversarial score...',
  'Building BISL fingerprint...',
  'Finalizing trust assessment...',
];

// JSON 파싱 — 직접 파싱 → 중괄호 추출 순으로 시도
function _safeParseJSON(raw) {
  if (!raw) return null;
  // 1) 직접 파싱
  try { return JSON.parse(raw); } catch (_) {}
  // 2) 첫 번째 { ... } 블록 추출
  var m = raw.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  // 3) 가장 긴 { ... } 블록 추출 (중첩 고려)
  var start = raw.indexOf('{');
  if (start !== -1) {
    var depth = 0, end = -1;
    for (var i = start; i < raw.length; i++) {
      if (raw[i] === '{') depth++;
      else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end !== -1) { try { return JSON.parse(raw.slice(start, end + 1)); } catch (_) {} }
  }
  return null;
}

// ── 입력창 초기화 ────────────────────────────────────────────────────
function clearInput() {
  var el = document.getElementById('home-input');
  if (el) { el.value = ''; el.focus(); }
  clearImage();
  toggleInputClear();
}

function toggleInputClear() {
  var el  = document.getElementById('home-input');
  var btn = document.getElementById('input-clear-btn');
  if (!btn || !el) return;
  if (el.value.trim()) {
    btn.style.display = 'flex';
  } else {
    btn.style.display = 'none';
  }
}

// ── 깊이 토글 ────────────────────────────────────────────────────────
function setDepth(val) {
  document.getElementById('home-depth').value = val;
  var btnStd  = document.getElementById('depth-btn-standard');
  var btnDeep = document.getElementById('depth-btn-deep');
  var activeClass  = ['bg-white','dark:bg-slate-700','text-slate-900','dark:text-white','shadow-sm'];
  var inactiveClass = ['text-slate-500','dark:text-slate-400'];
  if (val === 'standard') {
    activeClass.forEach(c => btnStd.classList.add(c));
    inactiveClass.forEach(c => btnStd.classList.remove(c));
    inactiveClass.forEach(c => btnDeep.classList.add(c));
    activeClass.forEach(c => btnDeep.classList.remove(c));
  } else {
    activeClass.forEach(c => btnDeep.classList.add(c));
    inactiveClass.forEach(c => btnDeep.classList.remove(c));
    inactiveClass.forEach(c => btnStd.classList.add(c));
    activeClass.forEach(c => btnStd.classList.remove(c));
  }
}

// ── 클립보드 붙여넣기 ─────────────────────────────────────────────────
async function pasteFromClipboard() {
  try {
    var text = await navigator.clipboard.readText();
    var el = document.getElementById('home-input');
    if (el) { el.value = text; el.focus(); }
  } catch(e) {
    var el = document.getElementById('home-input');
    if (el) el.focus();
  }
}

// ── 이미지 업로드 ─────────────────────────────────────────────────────
function handleImageUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  state.imageMime = file.type;
  var reader = new FileReader();
  reader.onload = function(ev) {
    state.imageB64 = ev.target.result.split(',')[1];
    document.getElementById('image-preview').src = ev.target.result;
    document.getElementById('image-preview-wrap').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  state.imageB64 = null;
  state.imageMime = null;
  document.getElementById('image-preview-wrap').classList.add('hidden');
  document.getElementById('image-preview').src = '';
}

// ── 팩트체크 진입점 ───────────────────────────────────────────────────
function runCheck() {
  var inputEl = document.getElementById('home-input');
  var input   = inputEl ? inputEl.value.trim() : (state.lastInput || '');
  if (!input && !state.imageB64) {
    if (inputEl) {
      inputEl.focus();
      inputEl.classList.add('ring-2','ring-red-400');
      setTimeout(() => inputEl.classList.remove('ring-2','ring-red-400'), 1500);
    }
    return;
  }
  var depth = document.getElementById('home-depth').value;
  var useV4 = depth === 'deep';

  state.lastInput         = input;
  state.lastResult        = null;
  // partner.js / news.js에서 설정한 경우 유지, 그 외 null(user)
  if (state.reportFrom !== 'partner' && state.reportFrom !== 'ainews') {
    state.reportFrom = null;
    state.reportCategory = null;
  }

  goPage('report');
  startLoading(input);

  if (useV4) {
    runV4Engine(input, state.partnerArticleLang || null);
  } else {
    runV1Engine(input, state.partnerArticleLang || null);
  }
  state.partnerArticleLang = null; // 소비 후 초기화
}

// ── 로딩 UI ──────────────────────────────────────────────────────────
function startLoading(input) {
  if (_layer7Timer) { clearInterval(_layer7Timer); _layer7Timer = null; }
  document.getElementById('report-loading').classList.remove('hidden');
  document.getElementById('report-result').classList.add('hidden');
  document.getElementById('report-empty').classList.add('hidden');
  document.getElementById('loading-claim-text').textContent = input.slice(0, 120) + (input.length > 120 ? '…' : '');
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('loading-status').textContent = 'Initializing ANN Engine...';

  var grid = document.getElementById('layer-progress-grid');
  grid.innerHTML = LAYER_ICONS.map((icon, i) => `
    <div class="flex flex-col items-center gap-2 text-center" id="lp-${i+1}">
      <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center layer-icon text-slate-400" id="lp-icon-${i+1}">
        <span class="material-symbols-outlined text-lg">${icon}</span>
      </div>
      <span class="text-[10px] text-slate-400 leading-tight">${LAYER_NAMES[i]}</span>
    </div>`).join('');
}

function setLayerRunning(n) {
  var el = document.getElementById('lp-icon-' + n);
  if (el) { el.classList.add('running'); el.classList.remove('done'); }
  document.getElementById('loading-status').textContent = 'Running Layer ' + n + ' — ' + LAYER_NAMES[n-1] + '...';
  document.getElementById('progress-bar').style.width = ((n-1)/7*85) + '%';

  if (n === 7) {
    _layer7Start = Date.now();
    document.getElementById('progress-bar').classList.add('progress-bar-shimmer');
    _layer7Timer = setInterval(function() {
      var sec = Math.floor((Date.now() - _layer7Start) / 1000);
      var mm = Math.floor(sec / 60), ss = sec % 60;
      var t = mm > 0 ? mm + ':' + String(ss).padStart(2,'0') : ss + 's';
      var msgIdx = Math.floor(sec / 3) % WAIT_MSGS.length;
      document.getElementById('loading-status').textContent = WAIT_MSGS[msgIdx] + ' (' + t + ')';
    }, 1000);
  }
}

function setLayerDone(n) {
  var el = document.getElementById('lp-icon-' + n);
  if (el) {
    el.classList.remove('running');
    el.classList.add('done');
    var ic = el.querySelector('.material-symbols-outlined');
    if (ic) ic.textContent = 'check_circle';
  }
  document.getElementById('progress-bar').style.width = (n/7*85) + '%';

  if (n === 7 && _layer7Timer) {
    clearInterval(_layer7Timer);
    _layer7Timer = null;
    document.getElementById('progress-bar').classList.remove('progress-bar-shimmer');
  }
}

// ── v4 Engine — 7-Layer 풀 파이프라인 ────────────────────────────────
async function runV4Engine(input, responseLang) {
  // 기사 원문 언어가 영어가 아닐 경우 언어 지시문 앞에 추가
  var langPrefix = (responseLang && responseLang !== 'en')
    ? '[RESPOND IN KOREAN - 모든 설명 텍스트(executive_summary, claims, evidence 등)를 한국어로 작성] '
    : '';
  try {
    var result = await ANNEngineV4.run(
      langPrefix + input,
      function(layer, status) {
        if (status === 'running') setLayerRunning(layer);
        if (status === 'done')    setLayerDone(layer);
      },
      V4_URL
    );
    setLayerDone(7);
    document.getElementById('progress-bar').style.width = '100%';
    finishLoading(result);
  } catch(err) {
    console.warn('v4 failed, falling back to v1:', err.message);
    // 레이어 UI 초기화 후 v1 재시작
    for (var i = 1; i <= 7; i++) {
      var el = document.getElementById('lp-icon-' + i);
      if (el) { el.classList.remove('running', 'done'); }
    }
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('loading-status').textContent = 'Switching to Standard Engine...';
    runV1Engine(input);
  }
}

// ── v1 Engine — 단일 Claude 호출 ─────────────────────────────────────
async function runV1Engine(input, responseLang) {
  // 페이크 레이어 1-6 진행 UX (Layer 7은 API 응답 후 done 처리)
  var delays = [0, 800, 1600, 2400, 3200, 4000];
  delays.forEach((d, i) => {
    setTimeout(() => setLayerRunning(i+1), d);
    setTimeout(() => setLayerDone(i+1),    d + 700);
  });
  // Layer 7은 layer 6 완료 후 running 시작 → API 응답까지 타이머 유지
  setTimeout(() => setLayerRunning(7), 4700);

  try {
    var body  = { claim: input, depth: 'standard' };
    if (responseLang && responseLang !== 'en') body.response_lang = responseLang;
    if (state.imageB64) { body.image_b64 = state.imageB64; body.image_mime = state.imageMime || 'image/jpeg'; }

    var res    = await fetch(API_URL + '/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var data   = await res.json();
    if (!res.ok || data.error) {
      var errObj = data.error;
      var errMsg = (errObj && errObj.message) ? errObj.message : (typeof errObj === 'string' ? errObj : JSON.stringify(errObj));
      var detail = data.detail ? ' (' + data.detail + ')' : '';
      throw new Error('HTTP ' + res.status + ': ' + (errMsg || 'Unknown error') + detail);
    }
    var txt    = data && data.content && data.content.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    var clean  = txt.replace(/```json|```/g, '').trim();
    if (!clean) throw new Error('Empty response from API (type: ' + (data.type || '?') + ', stop_reason: ' + (data.stop_reason || '?') + ')');
    var parsed = _safeParseJSON(clean);
    if (!parsed) {
      // JSON 파싱 실패 → 1회 자동 재시도
      if (!_verifyRetrying) {
        _verifyRetrying = true;
        setTimeout(function() { _verifyRetrying = false; runCheck(); }, 300);
        return;
      }
      throw new Error('JSON parse failed after retry');
    }

    // API 응답 시 Layer 7 완료 처리
    setLayerDone(7);
    document.getElementById('progress-bar').style.width = '100%';
    finishLoading(parsed);
  } catch(err) {
    _verifyRetrying = false;
    showError('Verification failed: ' + err.message);
  }
}

function finishLoading(result) {
  state.lastResult = result;
  document.getElementById('loading-status').textContent = 'Complete! Rendering report...';
  setTimeout(() => {
    document.getElementById('report-loading').classList.add('hidden');
    saveHistory(state.lastInput, result, state.reportFrom, state.reportCategory);
    renderReport();
    state.reportFrom = null;
    state.reportCategory = null;
  }, 400);
}

function showError(msg) {
  document.getElementById('report-loading').classList.add('hidden');
  document.getElementById('report-empty').classList.remove('hidden');
  document.getElementById('report-empty').innerHTML = `
    <span class="material-symbols-outlined text-6xl text-red-300 mb-4">error</span>
    <h3 class="font-display text-2xl font-bold text-red-400 mb-2">Verification Failed</h3>
    <p class="text-slate-400 mb-8 max-w-md">${escHtml(msg)}</p>
    <button onclick="goPage('home')" class="px-8 py-4 bg-primary text-white rounded-2xl font-bold">Try Again</button>`;
}
