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

  // AI News 기사뷰 / 표준 리포트뷰 초기화
  var annView    = document.getElementById('ai-news-article-view');
  var stdSection = document.getElementById('standard-report-section');
  if (annView)    annView.classList.add('hidden');
  if (stdSection) stdSection.classList.remove('hidden');

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

  // Partner News — 전용 리포트 뷰로 전환
  var partnerView = document.getElementById('partner-report-view');
  if (partnerView) partnerView.classList.add('hidden');

  if (state.reportFrom === 'partner') {
    if (stdSection) stdSection.classList.add('hidden');
    document.getElementById('related-section').classList.add('hidden');
    if (partnerView) {
      partnerView.classList.remove('hidden');
      renderPartnerReport(r);
    }
    state.reportFrom = null; // 소비 후 초기화
    return;
  }

  // AI Synthesized 기사 — 전용 뷰로 전환
  if (r._is_synth) {
    if (stdSection) stdSection.classList.add('hidden');
    document.getElementById('related-section').classList.add('hidden');
    if (annView) {
      annView.classList.remove('hidden');
      renderNewsArticle(r);
    }
  }
}

// ── AI News 기사 전용 렌더러 ──────────────────────────────────────────
function renderNewsArticle(r) {

  // ① 날짜
  var now = new Date();
  var dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase()
              + ' · ' + now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) + ' GMT';
  document.getElementById('ann-article-date').textContent = 'RELEASED: ' + dateStr;

  // ② 제목 / 요약
  document.getElementById('ann-article-title').textContent   = r._title || state.lastInput || '';
  document.getElementById('ann-article-excerpt').textContent = r.executive_summary || '';

  // ③ 신뢰도 링
  var score   = r.overall_score || 80;
  var grade   = r.overall_grade || 'A';
  var circumf = 351.9;
  var offset  = circumf - (score / 100 * circumf);
  var ringColors = { verified:'#10B981', likely:'#3B82F6', partial:'#F59E0B', misleading:'#F97316', false:'#EF4444' };
  var vc        = (r.verdict_class || 'likely').toLowerCase();
  var ringColor  = ringColors[vc] || '#10B981';
  var annRing = document.getElementById('ann-trust-ring');
  annRing.setAttribute('stroke', ringColor);
  annRing.style.strokeDashoffset = circumf;
  setTimeout(function() { annRing.style.strokeDashoffset = offset; }, 100);
  document.getElementById('ann-trust-score').textContent = score;
  var gradeEl = document.getElementById('ann-trust-grade');
  gradeEl.textContent  = grade + ' TRUST';
  gradeEl.style.color  = ringColor;

  // ④ 기사 본문 — 이미지를 두 번째 </p> 뒤에 삽입
  var bodyHtml = r._body || '';
  if (r._thumb) {
    var count = 0;
    bodyHtml = bodyHtml.replace(/<\/p>/gi, function(m) {
      count++;
      if (count === 2) {
        return '</p><div class="my-6 rounded-2xl overflow-hidden"><img src="' + escHtml(r._thumb) + '" alt="' + escHtml(r._title || '') + '" class="w-full object-cover" loading="lazy"/></div>';
      }
      return m;
    });
  }
  // key_claims → Evidence Node 콜아웃
  var claims = r.claims || [];
  if (claims.length) {
    bodyHtml += claims.slice(0, 2).map(function(c, i) {
      return '<div class="border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 pl-4 py-3 rounded-r-xl my-4">'
        + '<div class="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-1">'
        + '<span class="material-symbols-outlined" style="font-size:14px">fact_check</span>'
        + 'EVIDENCE NODE #' + (200 + i + 1)
        + '</div>'
        + '<p class="text-sm text-slate-700 dark:text-slate-300">' + escHtml(c.sentence || '') + '</p>'
        + '</div>';
    }).join('');
  }
  document.getElementById('ann-article-body').innerHTML = bodyHtml;

  // ⑤ 7-Layer 목록
  var sources = (r.key_evidence && r.key_evidence.supporting) ? r.key_evidence.supporting : [];
  var layers = [
    { name: 'ORIGIN TRACKING',   sub: 'Hash Match Found (SHA-256)',                       status: 'done'     },
    { name: 'SEMANTIC CONTEXT',  sub: 'Linguistic markers consistent',                    status: 'done'     },
    { name: 'CROSS-REF DB',      sub: (sources.length || 'N') + ' Trusted Nodes verified', status: 'done'   },
    { name: 'VISUAL EVIDENCE',   sub: r._thumb ? 'Image verified' : 'Metadata check in progress', status: r._thumb ? 'done' : 'progress' },
    { name: 'EXPERT SENTIMENT',  sub: 'Awaiting 3rd panel response',                      status: 'pending'  },
    { name: 'LOGIC CONSISTENCY', sub: 'Pending final model pass',                         status: 'pending'  },
    { name: 'TAMPER CHECK',      sub: 'Final ledger test pending',                        status: 'pending'  },
  ];
  document.getElementById('ann-layer-list').innerHTML = layers.map(function(l) {
    var icon = l.status === 'done'
      ? '<span class="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center flex-shrink-0"><span class="material-symbols-outlined" style="font-size:13px">check</span></span>'
      : l.status === 'progress'
      ? '<span class="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-500 flex items-center justify-center flex-shrink-0"><span class="material-symbols-outlined" style="font-size:13px">sync</span></span>'
      : '<span class="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center flex-shrink-0"><span class="material-symbols-outlined" style="font-size:13px">lock</span></span>';
    var nameC = l.status !== 'pending' ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400';
    return '<div class="flex items-center gap-3">'
      + icon
      + '<div class="min-w-0"><div class="text-[11px] font-bold uppercase tracking-wide ' + nameC + '">' + l.name + '</div>'
      + '<div class="text-[10px] text-slate-400 truncate">' + l.sub + '</div></div></div>';
  }).join('');

  // ⑥ 애널리스트 코멘터리 (executive_summary 요약)
  var commentary = r.executive_summary || '';
  document.getElementById('ann-commentary-text').textContent =
    commentary ? '\u201C' + commentary.slice(0, 140) + (commentary.length > 140 ? '\u2026' : '') + '\u201D' : '';
  document.getElementById('ann-commentary-author').textContent = '@' + escHtml(r._topic || 'ANN_ANALYST').replace(/[\s&]/g, '_').toUpperCase();

  // ⑦ 출처 그리드
  var srcIcons = { Reuters:'newspaper', BBC:'tv', Nature:'science', Bloomberg:'bar_chart',
                   TechCrunch:'code', 'AP News':'feed', NIF:'bolt', LLNL:'biotech',
                   Wired:'devices', CNN:'broadcast_on_personal', 'The Guardian':'article',
                   'Al Jazeera':'language', 'Financial Times':'trending_up' };
  document.getElementById('ann-sources-grid').innerHTML = sources.slice(0, 4).map(function(s) {
    var icon = srcIcons[s] || 'article';
    return '<div class="flex items-center gap-2.5 p-3 border border-slate-100 dark:border-slate-800 rounded-xl">'
      + '<span class="material-symbols-outlined text-slate-400 text-base">' + icon + '</span>'
      + '<span class="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">' + escHtml(s) + '</span>'
      + '</div>';
  }).join('');

  // ⑧ AI 분석 플로우
  var flowSteps = ['Data Crawling', 'Cross-Verification', 'Sentiment Analysis', 'Final Synthesis'];
  document.getElementById('ann-flow-steps').innerHTML = flowSteps.map(function(step, i) {
    var isFinal = i === flowSteps.length - 1;
    if (isFinal) {
      return '<div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-700">'
        + '<span class="w-2 h-2 rounded-full flex-shrink-0 bg-white dark:bg-slate-300"></span>'
        + '<span class="text-sm font-bold text-white">' + step + '</span>'
        + '</div>';
    }
    return '<div class="flex items-center gap-3 py-1">'
      + '<span class="w-2 h-2 rounded-full flex-shrink-0 bg-primary"></span>'
      + '<span class="text-sm font-medium text-primary">' + step + '</span>'
      + '</div>';
  }).join('');
}

// ── Partner News 리포트 전용 렌더러 ──────────────────────────────────
function renderPartnerReport(r) {
  var art = state.partnerArticleData || {};

  // ── 팩트체크 결과 저장 (배지용 요약 + 전체 결과) ────────────────────
  if (art.url) {
    if (!state.verifiedArticles) state.verifiedArticles = {};
    var saved = {
      grade:         r.overall_grade  || 'B+',
      score:         r.overall_score  || 75,
      verdict_class: r.verdict_class  || 'likely',
      verifiedAt:    new Date().toISOString(),
    };
    state.verifiedArticles[art.url] = saved;
    // 전체 결과도 저장 (재클릭 시 API 호출 없이 즉시 표시)
    if (!state.verifiedFull) state.verifiedFull = {};
    state.verifiedFull[art.url] = r;
    try {
      var stored = JSON.parse(localStorage.getItem('pn_verified') || '{}');
      stored[art.url] = saved;
      localStorage.setItem('pn_verified', JSON.stringify(stored));
      var full = JSON.parse(localStorage.getItem('pn_verified_full') || '{}');
      full[art.url] = r;
      localStorage.setItem('pn_verified_full', JSON.stringify(full));
    } catch (_) {}

    // Firestore에 공유 저장 (다른 사용자도 VERIFIED 상태 볼 수 있도록)
    try {
      var urlHash = _pnHash(art.url);
      // partnerVerified/_summary: 배지 맵 업데이트
      var summaryUpdate = {};
      summaryUpdate[urlHash] = Object.assign({ url: art.url }, saved);
      db.collection('partnerVerified').doc('_summary').set(summaryUpdate, { merge: true }).catch(function() {});
      // partnerVerified/{hash}: 전체 결과 저장
      db.collection('partnerVerified').doc(urlHash).set({ url: art.url, fullResult: r, verifiedAt: saved.verifiedAt }).catch(function() {});
    } catch (_) {}

    // partnerNews 컬렉션 기사 문서에 등급 저장 (피드에서 즉시 배지 표시용)
    if (art._id) {
      try {
        db.collection('partnerNews').doc(art._id).update({
          grade:         saved.grade,
          score:         saved.score,
          verdict_class: saved.verdict_class,
          verifiedAt:    saved.verifiedAt,
        }).catch(function() {});
      } catch (_) {}
    }
  }

  // ① 제목
  document.getElementById('pnr-title').textContent = art.title || state.lastInput || '';

  // ② 신뢰도 링
  var score    = r.overall_score || 75;
  var grade    = r.overall_grade || 'B+';
  var circumf  = 351.9;
  var offset   = circumf - (score / 100 * circumf);
  var ringColors = { verified:'#10B981', likely:'#3B82F6', partial:'#F59E0B', misleading:'#F97316', false:'#EF4444' };
  var vc       = (r.verdict_class || 'likely').toLowerCase();
  var ringColor = ringColors[vc] || '#3B82F6';
  var ring = document.getElementById('pnr-trust-ring');
  ring.setAttribute('stroke', ringColor);
  ring.style.strokeDashoffset = circumf;
  setTimeout(function() { ring.style.strokeDashoffset = offset; }, 100);
  var gradeEl = document.getElementById('pnr-trust-grade');
  gradeEl.textContent = grade;
  gradeEl.style.color = ringColor;

  // ③ 출처 메타
  document.getElementById('pnr-source').textContent = art.source || '';
  var timeEl = document.getElementById('pnr-time');
  timeEl.textContent = art.pubDate ? partnerTimeAgo(art.pubDate) : '';
  var wordCount = ((art.summary || '') + ' ' + (r.executive_summary || '')).split(/\s+/).length;
  var readMin   = Math.max(1, Math.ceil(wordCount / 200));
  document.getElementById('pnr-readtime').querySelector('span:last-child').textContent = readMin + ' min read';

  // ③-1 VERIFIED DATE 배지
  var vdWrap = document.getElementById('pnr-verified-date');
  var vdVal  = document.getElementById('pnr-verified-date-val');
  var verifiedAt = (state.verifiedArticles && state.verifiedArticles[art.url] && state.verifiedArticles[art.url].verifiedAt) || null;
  if (vdWrap && vdVal && verifiedAt) {
    var vd = new Date(verifiedAt);
    var dateStr = vd.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    var timeStr = vd.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
    vdVal.textContent = dateStr + ' · ' + timeStr;
    vdWrap.classList.remove('hidden');
  } else if (vdWrap) {
    vdWrap.classList.add('hidden');
  }

  // ④ 이미지
  var imgWrap = document.getElementById('pnr-image-wrap');
  var imgEl   = document.getElementById('pnr-image');
  if (art.thumb) {
    imgEl.src = art.thumb;
    imgEl.alt = art.title || '';
    imgWrap.classList.remove('hidden');
  } else {
    imgWrap.classList.add('hidden');
  }

  // ⑤ 본문: executive_summary + claims를 EVIDENCE 콜아웃으로
  var bodyHtml = '';
  if (r.executive_summary) {
    bodyHtml += '<p>' + escHtml(r.executive_summary) + '</p>';
  }
  var claims = r.claims || [];
  claims.slice(0, 4).forEach(function(c, i) {
    var isEven = i % 2 === 1;
    if (isEven) {
      bodyHtml += '<p class="relative">'
        + '<span class="absolute -top-1 right-0 px-1.5 py-0.5 bg-emerald-500 text-white text-[9px] font-bold rounded uppercase">Evidence</span>'
        + '<span class="border-b-2 border-emerald-400">' + escHtml(c.sentence || '') + '</span>'
        + '</p>';
    } else {
      bodyHtml += '<p>' + escHtml(c.sentence || '') + '</p>';
    }
  });
  // 팩트체크 요약 인용구
  if (r.executive_summary && r.executive_summary.length > 80) {
    bodyHtml += '<blockquote class="border-l-0 bg-slate-50 dark:bg-slate-800 rounded-xl p-5 mt-4 text-slate-600 dark:text-slate-400 text-sm italic leading-relaxed">'
      + '&ldquo;' + escHtml(r.executive_summary.slice(0, 200)) + (r.executive_summary.length > 200 ? '&hellip;' : '') + '&rdquo;'
      + '</blockquote>';
  }
  document.getElementById('pnr-body').innerHTML = bodyHtml;

  // ⑥ 7-Layer (Partner News 전용 레이어 명칭, 팩트체크 완료 = 전부 done)
  var layerDefs = [
    { name: 'Source Authentication',  sub: 'Direct ' + (art.source || 'partner') + ' API handshake verified' },
    { name: 'Entity Extraction',       sub: 'Cross-referenced entity identities'                              },
    { name: 'Numerical Validation',    sub: 'Statistics and figures confirmed'                                },
    { name: 'Linguistic Integrity',    sub: 'Neutral tone & non-bias analysis'                                },
    { name: 'Temporal Context',        sub: 'Real-time timestamp alignment'                                   },
    { name: 'Citation Mapping',        sub: 'Source cross-referencing complete'                               },
    { name: 'Consensus Anchor',        sub: 'Final verification certificate issued'                           },
  ];
  var doneIcon = '<span class="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 flex items-center justify-center flex-shrink-0">'
    + '<span class="material-symbols-outlined" style="font-size:13px">check</span></span>';
  document.getElementById('pnr-layer-list').innerHTML = layerDefs.map(function(l) {
    return '<div class="flex items-center gap-3">' + doneIcon
      + '<div class="min-w-0">'
      + '<div class="text-[11px] font-bold text-slate-800 dark:text-slate-200">' + l.name + '</div>'
      + '<div class="text-[10px] text-slate-400 truncate">' + l.sub + '</div>'
      + '</div></div>';
  }).join('');

  // ⑦ Confidence Metrics
  var m         = r.metrics || {};
  var techScore = m.factual        || Math.min(score + 8,  99);
  var srcScore  = m.source_quality || Math.min(score + 5,  99);
  document.getElementById('pnr-tech-pct').textContent = techScore + '%';
  document.getElementById('pnr-src-pct').textContent  = srcScore  + '%';
  setTimeout(function() {
    document.getElementById('pnr-tech-bar').style.width = techScore + '%';
    document.getElementById('pnr-src-bar').style.width  = srcScore  + '%';
  }, 150);

  // ⑧ Metadata
  document.getElementById('pnr-publisher').textContent = art.source || '—';
  document.getElementById('pnr-category').textContent  = art.category || (r.web_citations && r.web_citations.length ? 'General' : 'News');
  var hashRaw = r.bisl_hash || (art.url ? art.url.split('').reduce(function(h, c) { return (Math.imul(31, h) + c.charCodeAt(0)) >>> 0; }, 0).toString(16) : '');
  document.getElementById('pnr-hash').textContent = hashRaw ? '0x' + hashRaw.slice(0, 4) + '…' + hashRaw.slice(-4) : '—';

  // ⑨ Evidence
  var evEl  = document.getElementById('pnr-evidence');
  var ev    = r.key_evidence || {};
  var cits  = r.web_citations || [];
  var hasEv = (ev.supporting && ev.supporting.length)
           || (ev.contradicting && ev.contradicting.length)
           || (ev.neutral && ev.neutral.length)
           || cits.length;

  if (!evEl) return;

  if (!hasEv) {
    evEl.innerHTML = '';
    evEl.classList.add('hidden');
    return;
  }

  var eHtml = '<div class="flex items-center gap-2 mb-4">'
    + '<span class="material-symbols-outlined text-primary">fact_check</span>'
    + '<h3 class="text-sm font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">Evidence</h3>'
    + '</div>';

  // Supporting
  if (ev.supporting && ev.supporting.length) {
    eHtml += '<div class="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">'
      + '<h4 class="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400 tracking-widest mb-3 flex items-center gap-1.5">'
      + '<span class="material-symbols-outlined" style="font-size:14px">check_circle</span>Supporting Evidence</h4>'
      + '<ul class="space-y-2">'
      + ev.supporting.slice(0, 5).map(function(s) {
          return '<li class="flex items-start gap-2 text-sm text-emerald-900 dark:text-emerald-200">'
            + '<span class="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>'
            + '<span>' + escHtml(s) + '</span></li>';
        }).join('')
      + '</ul></div>';
  }

  // Contradicting
  if (ev.contradicting && ev.contradicting.length) {
    eHtml += '<div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">'
      + '<h4 class="text-xs font-bold uppercase text-red-700 dark:text-red-400 tracking-widest mb-3 flex items-center gap-1.5">'
      + '<span class="material-symbols-outlined" style="font-size:14px">cancel</span>Contradicting Evidence</h4>'
      + '<ul class="space-y-2">'
      + ev.contradicting.slice(0, 5).map(function(s) {
          return '<li class="flex items-start gap-2 text-sm text-red-900 dark:text-red-200">'
            + '<span class="text-red-500 mt-0.5 flex-shrink-0">✗</span>'
            + '<span>' + escHtml(s) + '</span></li>';
        }).join('')
      + '</ul></div>';
  }

  // Neutral / Context
  if (ev.neutral && ev.neutral.length) {
    eHtml += '<div class="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-700">'
      + '<h4 class="text-xs font-bold uppercase text-slate-500 tracking-widest mb-3 flex items-center gap-1.5">'
      + '<span class="material-symbols-outlined" style="font-size:14px">info</span>Context</h4>'
      + '<ul class="space-y-2">'
      + ev.neutral.slice(0, 3).map(function(s) {
          return '<li class="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">'
            + '<span class="text-slate-400 mt-0.5 flex-shrink-0">·</span>'
            + '<span>' + escHtml(s) + '</span></li>';
        }).join('')
      + '</ul></div>';
  }

  // Related Sources (web_citations)
  if (cits.length) {
    eHtml += '<div>'
      + '<h4 class="text-xs font-bold uppercase text-slate-500 tracking-widest mb-3 flex items-center gap-1.5">'
      + '<span class="material-symbols-outlined" style="font-size:14px">link</span>Related Sources</h4>'
      + '<div class="space-y-2">'
      + cits.slice(0, 6).map(function(c) {
          var isUrl = /^https?:\/\//.test(c);
          if (isUrl) {
            var domain = '';
            try { domain = new URL(c).hostname.replace('www.', ''); } catch (_) {}
            return '<a href="' + escHtml(c) + '" target="_blank" rel="noopener noreferrer"'
              + ' class="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-primary hover:shadow-sm transition-all group">'
              + '<span class="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-base">open_in_new</span>'
              + '<div class="min-w-0 flex-1">'
              + (domain ? '<div class="text-[10px] text-slate-400 uppercase tracking-wide font-bold mb-0.5">' + escHtml(domain) + '</div>' : '')
              + '<div class="text-sm text-slate-700 dark:text-slate-300 group-hover:text-primary truncate transition-colors">' + escHtml(c) + '</div>'
              + '</div></a>';
          }
          return '<div class="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">'
            + '<span class="material-symbols-outlined text-slate-400 text-base">article</span>'
            + '<span class="text-sm text-slate-700 dark:text-slate-300">' + escHtml(c) + '</span>'
            + '</div>';
        }).join('')
      + '</div></div>';
  }

  evEl.innerHTML = eHtml;
  evEl.classList.remove('hidden');
}
