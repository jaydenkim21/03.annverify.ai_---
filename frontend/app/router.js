// ① Client Layer — 페이지 라우터 (SPA Navigation)

function goPage(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');

  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  state.currentPage = page;

  if (page === 'news'      && !state.newsData.length)      loadNews();
  if (page === 'partner'   && !state.partnerData.length)   loadPartner();
  if (page === 'community' && !state.communityData.length) loadCommunity();
  if (page === 'report')   renderReport();
  if (page === 'profile' && typeof renderProfilePage === 'function') renderProfilePage();

  window.scrollTo(0, 0);
}

// ── 다크모드 ──────────────────────────────────────────────────────────
function toggleDark() {
  var html   = document.documentElement;
  var isDark = html.classList.toggle('dark');
  document.getElementById('dark-icon').textContent  = isDark ? 'light_mode' : 'dark_mode';
  document.getElementById('dark-label').textContent = isDark ? 'Light Mode' : 'Dark Mode';
  localStorage.setItem('ann_dark', isDark ? '1' : '0');
}

(function initDark() {
  if (localStorage.getItem('ann_dark') === '1') {
    document.documentElement.classList.add('dark');
    document.getElementById('dark-icon').textContent  = 'light_mode';
    document.getElementById('dark-label').textContent = 'Light Mode';
  }
})();
