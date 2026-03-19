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
  var opt = {
    margin:      [10, 10, 10, 10],
    filename:    filename,
    image:       { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  html2pdf().set(opt).from(el).save();
}
