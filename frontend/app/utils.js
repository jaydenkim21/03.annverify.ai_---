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
  // 1) 버튼 숨기기 (공유·다운로드·Back to List 등 액션 버튼)
  var hiddenEls = el.querySelectorAll('button, a[onclick]');
  hiddenEls.forEach(function(b) { b.dataset._pdfHidden = b.style.display; b.style.display = 'none'; });

  // 2) 페이지 잘림 방지 스타일 주입
  var style = document.createElement('style');
  style.id = '_pdf_style';
  style.textContent = [
    'p, h1, h2, h3, h4, li, td, th, .pdf-no-break { page-break-inside: avoid !important; }',
    'img { page-break-inside: avoid !important; max-width: 100% !important; height: auto !important; }',
    '* { box-sizing: border-box !important; max-width: 100% !important; }',
    '.grid { display: block !important; }',
    '.grid > * { width: 100% !important; margin-bottom: 16px !important; }',
    '.flex { flex-wrap: wrap !important; }',
    'pre, code { white-space: pre-wrap !important; word-break: break-all !important; }'
  ].join('\n');
  document.head.appendChild(style);

  var opt = {
    margin:      [10, 10, 10, 10],
    filename:    filename,
    image:       { type: 'jpeg', quality: 0.97 },
    html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 794 },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:   { mode: ['avoid-all', 'css', 'legacy'], before: '.pdf-page-break' }
  };

  html2pdf().set(opt).from(el).save().then(function() {
    // 복원
    hiddenEls.forEach(function(b) { b.style.display = b.dataset._pdfHidden || ''; });
    var s = document.getElementById('_pdf_style');
    if (s) s.remove();
  });
}
