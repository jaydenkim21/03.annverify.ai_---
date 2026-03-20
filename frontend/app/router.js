// ① Client Layer — 페이지 라우터 (SPA Navigation)

function goPage(page, pushHistory) {
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');

  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  state.currentPage = page;

  // 브라우저 히스토리 기록 (popstate 복원 시에는 pushHistory=false)
  if (pushHistory !== false) {
    history.pushState({ page: page }, '', '#' + page);
  }

  if (page === 'news'      && !state.newsData.length)      loadNews();
  if (page === 'partner'   && !state.partnerArticles.length) loadPartner();
  if (page === 'community' && !state.communityData.length) loadCommunity();
  if (page === 'report')             renderReport();
  if (page === 'profile'            && typeof renderProfilePage         === 'function') renderProfilePage();
  if (page === 'verify-history'     && typeof renderVerifyHistoryPage   === 'function') renderVerifyHistoryPage();
  if (page === 'subscription'       && typeof renderSubscriptionPage    === 'function') renderSubscriptionPage();
  if (page === 'community-detail'   && state.communityDetail && typeof renderCommunityDetail === 'function') renderCommunityDetail(state.communityDetail);

  // 홈으로 이동 시 입력창 초기화
  if (page === 'home') {
    var el = document.getElementById('home-input');
    if (el) { el.value = ''; }
    clearImage();
    toggleInputClear();
  }

  window.scrollTo(0, 0);
  // 모바일: 페이지 이동 시 사이드바 닫기
  if (typeof closeMobileSidebar === 'function') closeMobileSidebar();
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

// 브라우저 뒤로가기/앞으로가기 처리
window.addEventListener('popstate', function(e) {
  var page = (e.state && e.state.page) || 'home';
  goPage(page, false);
});

// 초기 진입 시 현재 페이지를 히스토리에 등록 + 새로고침 시 해당 페이지 복원
(function initHistory() {
  var hash = location.hash.replace('#', '');
  var validPages = ['home','news','partner','community','report','profile','verify-history','subscription','community-detail','about'];
  // 상태 데이터가 필요한 페이지는 상위 페이지로 폴백
  var fallbacks = { 'partner-report': 'partner', 'report': 'home', 'community-detail': 'community' };
  if (fallbacks[hash]) hash = fallbacks[hash];
  var startPage = validPages.includes(hash) ? hash : 'home';
  history.replaceState({ page: startPage }, '', '#' + startPage);
  if (startPage !== 'home') goPage(startPage, false);
})();
