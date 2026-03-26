// ① Client Layer — 공통 유틸리티

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function shareReport() {
  var txt = 'ANN Verify Report\n\nClaim: ' + state.lastInput +
            '\nScore: ' + (state.lastResult && state.lastResult.overall_score || '--') +
            '\nGrade: ' + (state.lastResult && state.lastResult.overall_grade || '--');
  if (navigator.share) {
    navigator.share({ title: 'ANN Verify Report', text: txt });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(window.location.href);
    alert('Link copied to clipboard!');
  }
}

function downloadReport() {
  if (!state.lastResult) { alert('No report to download.'); return; }

  var J = window.jspdf && window.jspdf.jsPDF;
  if (!J) { alert('PDF library not loaded. Please refresh and try again.'); return; }

  var type = '';
  var el;
  el = document.getElementById('partner-report-view');
  if (el && !el.classList.contains('hidden')) type = 'partner';
  el = document.getElementById('ai-news-article-view');
  if (el && !el.classList.contains('hidden')) type = 'ainews';
  el = document.getElementById('report-result');
  if (el && !el.classList.contains('hidden')) type = 'standard';
  if (!type) { alert('No report to download.'); return; }

  var ts = Date.now();
  var filename = type === 'ainews'   ? 'ann-news-report-'    + ts + '.pdf'
               : type === 'partner'  ? 'ann-partner-report-' + ts + '.pdf'
               :                       'ann-report-'         + ts + '.pdf';
  try {
    var doc = new J('portrait', 'mm', 'a4');
    if (type === 'ainews')   _buildAnnNewsPdf(doc);
    else if (type === 'partner')  _buildPartnerReportPdf(doc);
    else                          _buildStandardReportPdf(doc);
    doc.save(filename);
  } catch(e) {
    console.error('PDF generation failed:', e);
    alert('PDF generation failed. See console for details.');
  }
}

// ═══════════════════════════════════════════════════════════
//  PDF 공통 설정 & 헬퍼
// ═══════════════════════════════════════════════════════════

var _P = {
  W: 210, H: 297,        // A4 mm
  ML: 15, MR: 15,
  MT: 15, MB: 15,
  get CW() { return this.W - this.ML - this.MR; },  // 180mm

  C: {
    primary:  [9,   149, 236],
    emerald:  [16,  185, 129],
    amber:    [245, 158,  11],
    orange:   [249, 115,  22],
    red:      [239,  68,  68],
    blue:     [ 59, 130, 246],
    dark:     [ 15,  23,  42],
    body:     [ 51,  65,  85],
    muted:    [100, 116, 139],
    divider:  [226, 232, 240],
    bgLight:  [248, 250, 252],
    white:    [255, 255, 255],
  }
};

function _gradeColor(grade) {
  var g = String(grade || '').trim().charAt(0).toUpperCase();
  if (g === 'A') return _P.C.emerald;
  if (g === 'B') return _P.C.blue;
  if (g === 'C') return _P.C.amber;
  if (g === 'D') return _P.C.orange;
  return _P.C.red;
}

function _scoreColor(score) {
  var s = Number(score) || 0;
  if (s >= 80) return _P.C.emerald;
  if (s >= 60) return _P.C.blue;
  if (s >= 40) return _P.C.amber;
  return _P.C.red;
}

// pt → mm 줄높이 (1.4 line-spacing)
function _lh(fs) { return fs * 1.4 / 2.83; }

// y가 페이지 끝에 가까우면 새 페이지 추가, 새 y 반환
function _br(doc, y, needed) {
  if (y + (needed || 8) > _P.H - _P.MB) {
    doc.addPage();
    return _P.MT;
  }
  return y;
}

// setText: fontSize, bold, color 일괄 설정
function _set(doc, fs, bold, color) {
  doc.setFontSize(fs);
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  if (color) doc.setTextColor(color[0], color[1], color[2]);
}

// 텍스트 블록 출력 (줄바꿈 + 페이지 넘기기). 새 y 반환
function _txt(doc, text, y, opts) {
  if (!text) return y;
  opts = opts || {};
  var x    = opts.x  || _P.ML;
  var fs   = opts.fs || 9;
  var bold = opts.bold || false;
  var col  = opts.col  || _P.C.body;
  var maxW = opts.maxW || (_P.CW - (x - _P.ML));

  _set(doc, fs, bold, col);
  var lineH = _lh(fs);
  var lines = doc.splitTextToSize(String(text), maxW);
  for (var i = 0; i < lines.length; i++) {
    y = _br(doc, y, lineH * 1.5);
    doc.text(lines[i], x, y);
    y += lineH * (i < lines.length - 1 ? 1.15 : 1);
  }
  return y;
}

// 섹션 타이틀 (파란 밑줄). 새 y 반환
function _secTitle(doc, title, y) {
  y = _br(doc, y, 12);
  _set(doc, 9.5, true, _P.C.dark);
  doc.text(title.toUpperCase(), _P.ML, y);
  y += _lh(9.5) + 0.5;
  doc.setDrawColor(_P.C.primary[0], _P.C.primary[1], _P.C.primary[2]);
  doc.setLineWidth(0.4);
  doc.line(_P.ML, y, _P.ML + _P.CW, y);
  return y + 4;
}

// 프로그레스 바 (y: 바 중심선). 그린 후 y += 5 권장
function _bar(doc, y, score, label) {
  var x = _P.ML, w = _P.CW - 20, h = 3;
  var col = _scoreColor(score);
  var fill = Math.min(1, Math.max(0, (score || 0) / 100));

  // 레이블 + 점수
  _set(doc, 8, true, _P.C.dark);
  doc.text(String(label || ''), x, y);
  _set(doc, 8, false, _P.C.muted);
  doc.text(String(score || 0), x + _P.CW, y, { align: 'right' });
  y += _lh(8) + 1;

  // 배경 바
  doc.setFillColor(_P.C.divider[0], _P.C.divider[1], _P.C.divider[2]);
  doc.rect(x, y, w, h, 'F');
  // 채워진 바
  if (fill > 0) {
    doc.setFillColor(col[0], col[1], col[2]);
    doc.rect(x, y, fill * w, h, 'F');
  }
  return y + h + 4;
}

// 신뢰 점수 박스 (우측 고정). bx, by: 박스 좌상단
function _trustBox(doc, score, grade, bx, by) {
  var bw = 32, bh = 24;
  var col = _gradeColor(grade);
  var bgR = Math.round(col[0] + (255 - col[0]) * 0.85);
  var bgG = Math.round(col[1] + (255 - col[1]) * 0.85);
  var bgB = Math.round(col[2] + (255 - col[2]) * 0.85);

  doc.setFillColor(bgR, bgG, bgB);
  doc.roundedRect(bx, by, bw, bh, 2.5, 2.5, 'F');
  doc.setDrawColor(col[0], col[1], col[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(bx, by, bw, bh, 2.5, 2.5, 'S');

  _set(doc, 18, true, col);
  doc.text(String(score || '--'), bx + bw / 2, by + 11, { align: 'center' });
  _set(doc, 7.5, true, col);
  doc.text('Grade ' + (grade || '--'), bx + bw / 2, by + 17, { align: 'center' });
  _set(doc, 6.5, false, _P.C.muted);
  doc.text('TRUST SCORE', bx + bw / 2, by + 21.5, { align: 'center' });
}

// 페이지 하단 푸터
function _footer(doc) {
  var n = doc.internal.getNumberOfPages();
  for (var i = 1; i <= n; i++) {
    doc.setPage(i);
    _set(doc, 7, false, _P.C.muted);
    doc.text('ANN Verify · AI News Network', _P.ML, _P.H - 8);
    doc.text('Page ' + i + ' / ' + n, _P.W - _P.MR, _P.H - 8, { align: 'right' });
    doc.setDrawColor(_P.C.divider[0], _P.C.divider[1], _P.C.divider[2]);
    doc.setLineWidth(0.2);
    doc.line(_P.ML, _P.H - 10, _P.W - _P.MR, _P.H - 10);
  }
}

// 공통 헤더: 제목(좌) + 신뢰점수 박스(우) 나란히, 하단 두꺼운 파란 구분선
// score/grade 없으면 박스 생략
function _header(doc, title, subtitle, score, grade) {
  var x = _P.ML, y = _P.MT;
  var bw = 36, bh = 28;
  var bx = _P.W - _P.MR - bw;
  var titleW = (score !== undefined && score !== null) ? bx - x - 6 : _P.CW;

  // 얇은 상단 강조 바
  doc.setFillColor(_P.C.primary[0], _P.C.primary[1], _P.C.primary[2]);
  doc.rect(x, y, _P.CW, 1.5, 'F');
  y += 5;

  // 브랜드 + 날짜
  _set(doc, 7.5, true, _P.C.primary);
  doc.text('ANN VERIFY', x, y);
  var today = new Date().toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  _set(doc, 7.5, false, _P.C.muted);
  doc.text(today, _P.W - _P.MR, y, { align: 'right' });
  y += 7;

  // 제목 (좌측, 신뢰점수 박스 폭 제외)
  _set(doc, 15, true, _P.C.dark);
  var titleLines = doc.splitTextToSize(String(title || 'ANN Verify Report'), titleW);
  doc.text(titleLines, x, y);
  var titleEndY = y + titleLines.length * _lh(15);

  // 신뢰점수 박스 (우측, 제목과 나란히)
  if (score !== undefined && score !== null) {
    _trustBox(doc, score, grade, bx, y - 3);
  }

  y = Math.max(titleEndY, y + bh - 3) + 3;

  // 서브타이틀 (있을 때만)
  if (subtitle) {
    _set(doc, 8.5, false, _P.C.muted);
    var subLines = doc.splitTextToSize(String(subtitle), titleW);
    doc.text(subLines, x, y);
    y += subLines.length * _lh(8.5) + 2;
  }

  // 두꺼운 파란 구분선
  doc.setFillColor(_P.C.primary[0], _P.C.primary[1], _P.C.primary[2]);
  doc.rect(x, y, _P.CW, 1, 'F');
  return y + 7;
}

// 단락(p 태그) 단위로 텍스트 출력, 단락 사이 간격 삽입. 새 y 반환
function _txtParas(doc, el, y) {
  if (!el) return y;
  var paras = el.querySelectorAll('p');
  if (paras.length === 0) {
    return _txt(doc, el.innerText.trim(), y, { fs: 9, col: _P.C.body });
  }
  paras.forEach(function(p) {
    var t = p.textContent.trim();
    if (!t) return;
    y = _txt(doc, t, y, { fs: 9, col: _P.C.body });
    y += 3; // 단락 간격
  });
  return y;
}

// DOM 텍스트 안전 읽기
function _domText(id) {
  var el = document.getElementById(id);
  return el ? el.textContent.trim() : '';
}

// ═══════════════════════════════════════════════════════════
//  AI News 리포트 PDF
// ═══════════════════════════════════════════════════════════

function _buildAnnNewsPdf(doc) {
  var title    = _domText('ann-article-title');
  var date     = _domText('ann-article-date');
  var score    = _domText('ann-trust-score');
  var grade    = _domText('ann-trust-grade');
  var bodyEl   = document.getElementById('ann-article-body');
  var bodyText = bodyEl ? bodyEl.innerText.trim() : '';

  // ── 헤더 (제목 좌 + 신뢰점수 우) ──
  var y = _header(doc, title || 'AI News Report', date || '', score, grade);

  // ── 기사 본문 ──
  if (bodyText) {
    y = _secTitle(doc, 'Article', y);
    y = _txtParas(doc, bodyEl, y);
    y += 6;
  }

  // ── 소스 ──
  var sourceItems = document.querySelectorAll('#ann-sources-grid > div');
  if (sourceItems.length) {
    y = _secTitle(doc, 'Primary Sources', y);
    sourceItems.forEach(function(item) {
      var nameSpan = item.querySelector('span:not(.material-symbols-outlined)');
      var t = nameSpan ? nameSpan.textContent.trim() : '';
      if (!t) return;
      y = _br(doc, y, 7);
      _set(doc, 8, false, _P.C.body);
      doc.text('\u2022 ' + t, _P.ML + 2, y);
      y += _lh(8) * 1.25;
    });
  }

  _footer(doc);
}

// ═══════════════════════════════════════════════════════════
//  Standard Report PDF
// ═══════════════════════════════════════════════════════════

function _buildStandardReportPdf(doc) {
  var r       = state.lastResult || {};
  var title   = _domText('result-title') || state.lastInput || 'Fact Check Report';
  var score   = r.overall_score || _domText('trust-score-num') || '--';
  var grade   = r.overall_grade || _domText('trust-grade') || '--';
  var summary = _domText('result-summary');

  // ── 헤더 (제목 좌 + 신뢰점수 우) ──
  var y = _header(doc, title, null, score, grade);

  // ── Executive Summary ──
  if (summary) {
    y = _secTitle(doc, 'Executive Summary', y);
    y = _txt(doc, summary, y, { fs: 9, col: _P.C.body });
    y += 6;
  }

  // ── AI Synthesized 기사 본문 ──
  var aiBodySection = document.getElementById('ai-news-body-section');
  var aiBody = document.getElementById('ai-news-body');
  if (aiBodySection && !aiBodySection.classList.contains('hidden') && aiBody) {
    var aiText = aiBody.innerText.trim();
    if (aiText) {
      y = _secTitle(doc, 'AI Synthesized Article', y);
      y = _txtParas(doc, aiBody, y);
      y += 6;
    }
  }

  // ── Key Claims ──
  var claims = r.claims || [];
  if (claims.length) {
    y = _secTitle(doc, 'Key Claims', y);
    claims.slice(0, 10).forEach(function(c) {
      y = _br(doc, y, 10);
      var st     = (c.status || '').toUpperCase();
      var isCon  = st === 'CONFIRMED';
      var isDis  = st === 'DISPUTED' || st === 'FALSE';
      var dotCol = isCon ? _P.C.emerald : isDis ? _P.C.red : _P.C.amber;

      doc.setFillColor(dotCol[0], dotCol[1], dotCol[2]);
      doc.circle(_P.ML + 2, y - 1.5, 1.5, 'F');

      var claimText = (c.claim || c.text || JSON.stringify(c)).trim();
      y = _txt(doc, claimText, y, { x: _P.ML + 6, fs: 8.5, col: _P.C.body, maxW: _P.CW - 6 });

      _set(doc, 7, true, dotCol);
      doc.text(st || 'UNVERIFIED', _P.ML + 6, y);
      y += _lh(7) + 3;
    });
  }

  _footer(doc);
}

// ═══════════════════════════════════════════════════════════
//  Partner Report PDF
// ═══════════════════════════════════════════════════════════

function _buildPartnerReportPdf(doc) {
  var r     = state.lastResult || {};
  var title = _domText('pnr-title') || 'Partner News Report';
  var grade = r.overall_grade || _domText('pnr-trust-grade') || '--';
  var score = r.overall_score || '--';

  // ── 헤더 (제목 좌 + 신뢰점수 우) ──
  var y = _header(doc, title, null, score, grade);

  // ── 7-Layer 분석 ──
  var la = r.layer_analysis || [];
  if (la.length) {
    y = _secTitle(doc, '7-Layer Analysis', y);
    la.forEach(function(l) {
      y = _br(doc, y, 16);
      y = _bar(doc, y, l.score || 70, l.name || ('Layer ' + l.layer));
      if (l.summary) {
        y = _txt(doc, l.summary, y, { fs: 7.5, col: _P.C.muted });
        y += 2;
      }
    });
    y += 4;
  }

  // ── Summary ──
  var summary = _domText('result-summary');
  if (summary) {
    y = _secTitle(doc, 'Executive Summary', y);
    y = _txt(doc, summary, y, { fs: 9, col: _P.C.body });
    y += 5;
  }

  // ── Key Claims ──
  var claims = r.claims || [];
  if (claims.length) {
    y = _secTitle(doc, 'Key Claims', y);
    claims.slice(0, 10).forEach(function(c) {
      y = _br(doc, y, 10);
      var st     = (c.status || '').toUpperCase();
      var isCon  = st === 'CONFIRMED';
      var isDis  = st === 'DISPUTED' || st === 'FALSE';
      var dotCol = isCon ? _P.C.emerald : isDis ? _P.C.red : _P.C.amber;

      doc.setFillColor(dotCol[0], dotCol[1], dotCol[2]);
      doc.circle(_P.ML + 2, y - 1.5, 1.5, 'F');

      var claimText = (c.claim || c.text || JSON.stringify(c)).trim();
      y = _txt(doc, claimText, y, { x: _P.ML + 6, fs: 8.5, col: _P.C.body, maxW: _P.CW - 6 });

      _set(doc, 7, true, dotCol);
      doc.text(st || 'UNVERIFIED', _P.ML + 6, y);
      y += _lh(7) + 3;
    });
  }

  _footer(doc);
}
