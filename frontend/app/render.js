// ① Client Layer — 리포트 렌더러 (Report Renderer)

function renderReport() {
  if (!state.lastResult) {
    document.getElementById('report-loading').classList.add('hidden');
    document.getElementById('report-result').classList.add('hidden');
    document.getElementById('report-empty').classList.remove('hidden');
    return;
  }
  var r = state.lastResult;

  document.getElementById('report-loading').classList.add('hidden');
  document.getElementById('report-empty').classList.add('hidden');
  document.getElementById('report-result').classList.remove('hidden');

  // 섹션 초기화 — 이전 결과가 잔류하지 않도록 매 렌더링 시 리셋
  document.getElementById('temporal-section').classList.add('hidden');
  document.getElementById('related-section').classList.add('hidden');

  // Status Badge
  var vc = (r.verdict_class || 'partial').toLowerCase();
  var badgeMap = {
    verified:   ['bg-emerald-100 text-emerald-700', 'verified_user', 'VERIFIED HIGH ACCURACY'],
    likely:     ['bg-blue-100 text-blue-700',        'thumb_up',      'LIKELY TRUE'],
    partial:    ['bg-amber-100 text-amber-700',       'balance',       'PARTIALLY VERIFIED'],
    misleading: ['bg-orange-100 text-orange-700',     'warning',       'MISLEADING'],
    false:      ['bg-red-100 text-red-700',           'cancel',        'FALSE'],
  };
  var bm = badgeMap[vc] || badgeMap['partial'];
  document.getElementById('result-status-badge').className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ' + bm[0];
  document.getElementById('result-status-badge').innerHTML = '<span class="material-symbols-outlined text-sm">' + bm[1] + '</span>' + bm[2];

  // Title + Meta
  document.getElementById('result-title').textContent = state.lastInput.slice(0, 200) + (state.lastInput.length > 200 ? '…' : '');
  var isSynth     = r._is_synth === true;
  var engineLabel = isSynth
    ? 'AI Synthesized · Beta'
    : (r._engine === 'ai_news' ? 'AI News Pre-Verified'
    : (r._engine === 'v4.0'   ? '7-Layer v4 Engine' : 'Standard Engine'));
  var sourceLabel = (r._engine === 'ai_news' || isSynth) && r._source
    ? ' &nbsp;·&nbsp; <span class="material-symbols-outlined text-sm">auto_awesome</span>' + escHtml(r._source)
    : ' &nbsp;·&nbsp; <span class="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">' + escHtml(r.bisl_hash || '').slice(0, 18) + '</span>';
  var topicLabel  = isSynth && r._topic
    ? ' &nbsp;·&nbsp; <span class="material-symbols-outlined text-sm">label</span>' + escHtml(r._topic)
    : '';
  document.getElementById('result-meta').innerHTML =
    '<span class="material-symbols-outlined text-sm">event</span>' + new Date().toLocaleString() +
    ' &nbsp;·&nbsp; <span class="material-symbols-outlined text-sm">bolt</span>' + engineLabel +
    sourceLabel + topicLabel;

  // Trust Score Ring
  var score    = r.overall_score || 50;
  var circumf  = 351.9;
  var offset   = circumf - (score / 100 * circumf);
  var ringColors = { verified:'#10B981', likely:'#3B82F6', partial:'#F59E0B', misleading:'#F97316', false:'#EF4444' };
  var ringColor  = ringColors[vc] || ringColors['partial'];
  var ring = document.getElementById('trust-ring');
  ring.style.strokeDashoffset = circumf;
  ring.setAttribute('stroke', ringColor);
  setTimeout(() => { ring.style.strokeDashoffset = offset; }, 100);
  document.getElementById('trust-score-num').textContent = score;
  document.getElementById('trust-grade').textContent = r.overall_grade || '--';
  document.getElementById('trust-grade').style.color  = ringColor;

  // 7-Layer Bar — AI Synthesized 기사는 미제공 (v2.0 적용 예정)
  var layerIcons = ['source','translate','database','query_stats','robot','fact_check','verified'];
  var la = r.layer_analysis || [];
  var layersBar = document.getElementById('result-layers-bar');
  layersBar.classList.toggle('hidden', la.length === 0);
  document.getElementById('result-layers-bar').innerHTML = la.map((l, i) => {
    var s = l.score || 70;
    var c = s >= 80 ? 'text-emerald-500' : s >= 60 ? 'text-blue-500' : s >= 40 ? 'text-amber-500' : 'text-red-500';
    return `<div class="flex flex-col items-center gap-1 text-center cursor-pointer group" title="${escHtml(l.name)}: ${l.summary}">
      <span class="material-symbols-outlined text-2xl ${c} group-hover:scale-110 transition-transform">${layerIcons[i] || 'check'}</span>
      <span class="text-[9px] font-bold ${c}">${l.layer}</span>
      <span class="text-[9px] text-slate-400">${s}</span>
    </div>`;
  }).join('');

  // Metrics — AI Synthesized 기사는 미제공 (v2.0 적용 예정)
  var m = r.metrics || {};
  var hasMetrics = Object.values(m).some(function(v) { return v > 0; });
  document.getElementById('metrics-row').classList.toggle('hidden', !hasMetrics);
  var metricKeys = [['factual','Factual','article'],['logic','Logic','psychology'],['source_quality','Sources','hub'],['cross_validation','Cross-Val','compare_arrows'],['recency','Recency','schedule']];
  document.getElementById('metrics-row').innerHTML = metricKeys.map(([k, label, icon]) => {
    var v = m[k] || 0;
    var c = v >= 80 ? 'text-emerald-600' : v >= 60 ? 'text-blue-600' : v >= 40 ? 'text-amber-600' : 'text-red-600';
    return `<div class="flex flex-col items-center gap-1 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
      <span class="material-symbols-outlined text-lg ${c}">${icon}</span>
      <span class="text-xl font-black ${c}">${v}</span>
      <span class="text-[10px] text-slate-500 uppercase tracking-wide">${label}</span>
    </div>`;
  }).join('');

  // Summary
  document.getElementById('result-summary').textContent = r.executive_summary || '';

  // AI Synthesized 기사 본문 (HTML 4–5단락)
  var bodySection = document.getElementById('ai-news-body-section');
  var bodyEl      = document.getElementById('ai-news-body');
  if (bodySection && bodyEl) {
    if (r._body) {
      bodySection.classList.remove('hidden');
      bodyEl.innerHTML = r._body;
      // Hero 이미지 (DALL-E 생성 썸네일)
      var heroDiv = document.getElementById('ai-news-hero-image');
      var heroImg = document.getElementById('ai-news-hero-img');
      if (heroDiv && heroImg) {
        if (r._thumb) {
          heroImg.src = r._thumb;
          heroImg.alt = r._title || '';
          heroDiv.classList.remove('hidden');
        } else {
          heroDiv.classList.add('hidden');
        }
      }
    } else {
      bodySection.classList.add('hidden');
      bodyEl.innerHTML = '';
    }
  }

  // Claims
  var claims = r.claims || [];
  document.getElementById('claims-list').innerHTML = claims.slice(0, 10).map(c => {
    var st = (c.status || '').toUpperCase();
    var isCon = st === 'CONFIRMED';
    var isDis = st === 'DISPUTED' || st === 'FALSE';
    var border = isCon ? 'border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10'
               : isDis ? 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10'
               :         'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10';
    var badge  = isCon ? '<span class="text-emerald-600 text-xs font-bold">✓ CONFIRMED</span>'
               : isDis ? '<span class="text-red-600 text-xs font-bold">✗ DISPUTED</span>'
               :         '<span class="text-amber-600 text-xs font-bold">~ PARTIAL</span>';
    return `<div class="border-l-4 ${border} pl-4 py-3 rounded-r-xl">
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm text-slate-800 dark:text-slate-200 font-medium leading-snug">${escHtml(c.sentence || '')}</p>
        ${badge}
      </div>
      ${c.verdict ? `<p class="text-xs text-slate-500 mt-1 leading-relaxed">${escHtml(c.verdict)}</p>` : ''}
    </div>`;
  }).join('') || '<p class="text-slate-400 text-sm">No individual claims analyzed.</p>';

  // Evidence
  var ev = r.key_evidence || {};
  var evHtml = '';
  if (ev.supporting && ev.supporting.length) {
    evHtml += `<div class="p-5 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
      <h4 class="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400 tracking-widest mb-3">Supporting Evidence</h4>
      <ul class="space-y-2">${ev.supporting.slice(0, 4).map(s => `<li class="text-sm text-emerald-900 dark:text-emerald-200 flex items-start gap-2"><span class="text-emerald-500 mt-0.5">✓</span>${escHtml(s)}</li>`).join('')}</ul>
    </div>`;
  }
  if (ev.contradicting && ev.contradicting.length) {
    evHtml += `<div class="p-5 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">
      <h4 class="text-xs font-bold uppercase text-red-700 dark:text-red-400 tracking-widest mb-3">Contradicting Evidence</h4>
      <ul class="space-y-2">${ev.contradicting.slice(0, 4).map(s => `<li class="text-sm text-red-900 dark:text-red-200 flex items-start gap-2"><span class="text-red-500 mt-0.5">✗</span>${escHtml(s)}</li>`).join('')}</ul>
    </div>`;
  }
  document.getElementById('evidence-section').innerHTML = evHtml;

  // Temporal
  var temp = r.temporal;
  if (temp && temp.freshness) {
    var tEl = document.getElementById('temporal-section');
    tEl.classList.remove('hidden');
    tEl.innerHTML = `<div class="flex flex-wrap gap-6 items-center">
      <div><span class="font-bold text-slate-800 dark:text-slate-200 block">Freshness</span><span class="capitalize">${temp.freshness}</span></div>
      <div><span class="font-bold text-slate-800 dark:text-slate-200 block">Timeframe</span><span>${temp.timeframe || 'unknown'}</span></div>
      <div><span class="font-bold text-slate-800 dark:text-slate-200 block">Expiry Risk</span>
        <span class="${temp.expiry_risk === 'LOW' ? 'text-emerald-600' : temp.expiry_risk === 'HIGH' ? 'text-red-600' : 'text-amber-600'}">${temp.expiry_risk}</span></div>
      ${temp.recheck_recommended ? '<div class="flex items-center gap-1 text-amber-600"><span class="material-symbols-outlined text-sm">refresh</span><span class="font-medium">Recheck Recommended</span></div>' : ''}
    </div>`;
  }

  // Citations
  var cits = r.web_citations || [];
  if (cits.length) {
    var relDiv = document.getElementById('related-section');
    relDiv.classList.remove('hidden');
    document.getElementById('related-cards').innerHTML = cits.slice(0, 3).map(c => `
      <div class="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
        <span class="material-symbols-outlined text-primary">link</span>
        <a href="${escHtml(c)}" target="_blank" class="text-sm text-primary hover:underline truncate">${escHtml(c)}</a>
      </div>`).join('');
  }
}
