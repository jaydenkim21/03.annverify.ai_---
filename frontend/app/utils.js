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

  // Determine which report view is currently visible
  var el = document.getElementById('partner-report-view');
  if (el && !el.classList.contains('hidden')) {
    _downloadElementAsPdf(el, 'ann-partner-report-' + Date.now() + '.pdf');
    return;
  }
  el = document.getElementById('ai-news-article-view');
  if (el && !el.classList.contains('hidden')) {
    _downloadElementAsPdf(el, 'ann-news-report-' + Date.now() + '.pdf');
    return;
  }
  el = document.getElementById('report-result');
  if (el && !el.classList.contains('hidden')) {
    _downloadElementAsPdf(el, 'ann-report-' + Date.now() + '.pdf');
    return;
  }
  // fallback: entire page-report section
  el = document.getElementById('page-report');
  _downloadElementAsPdf(el, 'ann-report-' + Date.now() + '.pdf');
}

function _downloadElementAsPdf(el, filename) {
  // A4 portrait 콘텐츠 폭: (210mm - 좌우 10mm 마진×2) / 25.4 × 96dpi ≈ 718px
  var PDF_W = 718;

  // onclone 내에서 클론된 요소를 찾기 위해 임시 ID 부여
  var origId = el.id;
  var tempId = origId || ('_pdf_tmp_' + Date.now());
  if (!origId) el.id = tempId;

  // 이미지 30% 축소: A4 콘텐츠 폭 190mm → 133mm (좌우 마진 38.5mm)
  var opt = {
    margin:      [10, 38.5, 10, 38.5],
    filename:    filename,
    image:       { type: 'jpeg', quality: 0.97 },
    html2canvas: {
      scale:       2,
      useCORS:     true,
      logging:     false,
      windowWidth: PDF_W,
      // html2canvas 1.x: onclone(clonedDoc) — 파라미터 1개
      onclone: function(clonedDoc) {
        // 사이드바 숨김 — position:fixed 이지만 z-index:50 으로 캡처 시 콘텐츠 위에 오버레이됨
        var sb = clonedDoc.getElementById('sidebar');
        if (sb) sb.style.display = 'none';

        // 모바일 상단 바 숨김
        var topbar = clonedDoc.getElementById('mobile-topbar');
        if (topbar) topbar.style.display = 'none';

        // main-content 마진·패딩 제거 (sm:ml-[336px] 재정의)
        var mc = clonedDoc.getElementById('main-content');
        if (mc) { mc.style.margin = '0'; mc.style.padding = '0'; }

        // ID로 클론된 대상 요소 찾기
        var clonedEl = clonedDoc.getElementById(tempId);
        if (!clonedEl) return;

        // 조상 요소들을 PDF 폭으로 제한 (max-w-7xl 등의 넓은 컨테이너 해제)
        var p = clonedEl.parentElement;
        while (p && p.tagName !== 'BODY') {
          p.style.maxWidth  = PDF_W + 'px';
          p.style.margin    = '0';
          p.style.padding   = '0';
          p.style.overflow  = 'visible';
          p = p.parentElement;
        }

        // 대상 요소 폭 고정
        clonedEl.style.width    = PDF_W + 'px';
        clonedEl.style.maxWidth = PDF_W + 'px';
        clonedEl.style.overflow = 'visible';

        // 액션 버튼 제거
        clonedEl.querySelectorAll('button, a[onclick]').forEach(function(b) {
          b.style.display = 'none';
        });

        // 스타일 주입: 그리드→블록, 이미지 폭 제한, 텍스트 줄바꿈
        var style = clonedDoc.createElement('style');
        style.textContent = [
          '* { box-sizing:border-box !important; overflow-wrap:break-word !important; word-break:break-word !important; }',
          'img { max-width:100% !important; height:auto !important; }',
          '.grid { display:block !important; }',
          '.grid > * { width:100% !important; margin-bottom:12px !important; }',
          '.flex { flex-wrap:wrap !important; }',
          'pre, code { white-space:pre-wrap !important; word-break:break-all !important; }'
        ].join('\n');
        clonedDoc.head.appendChild(style);
      }
    },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:   { mode: ['avoid-all', 'css', 'legacy'], before: '.pdf-page-break' }
  };

  html2pdf().set(opt).from(el).save().then(function() {
    if (!origId) el.id = '';
  }).catch(function(err) {
    console.error('PDF generation failed:', err);
    if (!origId) el.id = '';
  });
}
