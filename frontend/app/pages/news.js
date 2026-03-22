// ① Client Layer — AI News 페이지 (Beta v1.0)
// Firestore aiNews 컬렉션에서 Claude 합성 기사를 읽어 카드 렌더링
// 카드 클릭 → 저장된 Verification Report 즉시 표시 (재팩트체크 없음)

var _newsLoading = false;

// 카테고리별 그라디언트 (Security, Energy 추가)
var CAT_GRADIENT = {
  'World':    'from-blue-500 to-indigo-600',
  'Tech':     'from-violet-500 to-purple-700',
  'Finance':  'from-emerald-500 to-teal-700',
  'Science':  'from-cyan-500 to-blue-700',
  'Health':   'from-pink-500 to-rose-600',
  'Politics': 'from-orange-500 to-red-600',
  'Security': 'from-red-600 to-rose-800',
  'Energy':   'from-yellow-500 to-orange-600',
};

function newsGradeClass(grade) {
  if (!grade) return 'text-slate-400 border-slate-200 bg-white dark:bg-slate-800';
  if (grade.startsWith('A')) return 'text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-900/40 dark:border-emerald-700';
  if (grade.startsWith('B')) return 'text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-900/40 dark:border-blue-700';
  if (grade === 'C')         return 'text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-900/40 dark:border-amber-700';
  return 'text-red-600 border-red-300 bg-red-50 dark:bg-red-900/40 dark:border-red-700';
}

function newsScoreColor(score) {
  if (score >= 85) return 'text-emerald-600';
  if (score >= 76) return 'text-blue-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

// ── AI News 인터랙션 헬퍼 ─────────────────────────────────────────────
function _isAnnLiked(id)          { return localStorage.getItem('ann_ld_' + id) === '1'; }
function _getAnnLikeCount(id)     { return parseInt(localStorage.getItem('ann_lc_' + id) || '0', 10); }
function _isAnnBookmarked(id)     { return localStorage.getItem('ann_bm_' + id) === '1'; }
function _getAnnBookmarkCount(id) { return parseInt(localStorage.getItem('ann_bmc_' + id) || '0', 10); }
function _getAnnDiscussCount(id)  { return parseInt(localStorage.getItem('ann_dc_' + id) || '0', 10); }
function _capCountAnn(n)          { return Math.min(Math.max(0, parseInt(n) || 0), 99); }

function newsTimeAgo(dateStr) {
  if (!dateStr) return '';
  try {
    var m = Math.floor((Date.now() - new Date(dateStr)) / 60000);
    if (m < 1)    return 'just now';
    if (m < 60)   return m + 'm ago';
    if (m < 1440) return Math.floor(m / 60) + 'h ago';
    return Math.floor(m / 1440) + 'd ago';
  } catch (_) { return ''; }
}

// ── 데이터 로드 — Firestore aiNews 컬렉션 ────────────────────────────
async function loadNews() {
  if (_newsLoading) return;
  _newsLoading = true;

  // 현재 AI News 탭이 활성화된 경우에만 스켈레톤 표시 (백그라운드 프리페치 시 UI 방해 방지)
  if (state.currentPage === 'news') {
    document.getElementById('news-grid').innerHTML =
      Array(6).fill('<div class="skeleton rounded-3xl h-80"></div>').join('');
  }

  try {
    // deployedAt: 구형·신형 기사 모두 보유한 필드 (publishedAt은 신형만 존재 → 인덱스 행 유발)
    // Promise.race: Firebase SDK 기본 타임아웃 없음 → 10초 초과 시 강제 에러 처리
    var fsQuery = db.collection('aiNews').orderBy('deployedAt', 'desc').limit(60).get();
    var fsTimeout = new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('Firestore timeout')); }, 10000);
    });
    var snap = await Promise.race([fsQuery, fsTimeout]);

    state.newsData = snap.docs.map(function(d) {
      return Object.assign({ id: d.id }, d.data());
    });

    // Firestore 데이터 없으면 Worker API 폴백
    if (state.newsData.length === 0) {
      var res = await fetch(API_URL + '/api/v4/news/feed');
      if (res.ok) {
        var data = await res.json();
        state.newsData = data.articles || [];
      }
    }

    renderNews();
  } catch (err) {
    document.getElementById('news-grid').innerHTML = `
      <div class="col-span-3 py-16 text-center text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-3 block">wifi_off</span>
        <p class="mb-4">Failed to load news feed: ${escHtml(err.message)}</p>
        <button onclick="loadNews()" class="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm">Retry</button>
      </div>`;
  } finally {
    _newsLoading = false;
  }
}

function filterNews() { renderNews(); }

function loadMoreNews() {
  alert('Full archive coming in v2.0!');
}

// ── Like 토글 ────────────────────────────────────────────────────────
function toggleAnnLike(id) {
  var liked = _isAnnLiked(id);
  var count = _getAnnLikeCount(id);
  var user  = typeof firebase !== 'undefined' && firebase.auth().currentUser;
  var uid   = user ? user.uid : null;
  if (liked) {
    count = Math.max(0, count - 1);
    localStorage.removeItem('ann_ld_' + id);
    try { var u = { likeCount: firebase.firestore.FieldValue.increment(-1) }; if (uid) u.likedBy = firebase.firestore.FieldValue.arrayRemove(uid); db.collection('annLikes').doc(id).set(u, { merge: true }).catch(function() {}); } catch (_) {}
  } else {
    count++;
    localStorage.setItem('ann_ld_' + id, '1');
    try { var u = { likeCount: firebase.firestore.FieldValue.increment(1) }; if (uid) u.likedBy = firebase.firestore.FieldValue.arrayUnion(uid); db.collection('annLikes').doc(id).set(u, { merge: true }).catch(function() {}); } catch (_) {}
  }
  localStorage.setItem('ann_lc_' + id, count);
  var newLiked = !liked;
  var btn = document.getElementById('ann-like-' + id);
  if (btn) {
    btn.className = 'ann-like flex items-center gap-1 text-sm transition-colors ' + (newLiked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500');
    var icon = btn.querySelector('.material-symbols-outlined'); if (icon) icon.style.fontVariationSettings = "'FILL' " + (newLiked ? 1 : 0);
    var el = document.getElementById('ann-lc-' + id); if (el) el.textContent = _capCountAnn(count);
  }
  if (state.annCurrentArticleId === id) {
    var dBtn = document.getElementById('ann-detail-like');
    if (dBtn) { dBtn.className = 'flex items-center gap-1 p-1.5 rounded-lg transition-colors ' + (newLiked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'); var ic = dBtn.querySelector('.material-symbols-outlined'); if (ic) ic.style.fontVariationSettings = "'FILL' " + (newLiked ? 1 : 0); }
    var dLc = document.getElementById('ann-detail-lc'); if (dLc) dLc.textContent = _capCountAnn(count);
  }
}

// ── Bookmark 토글 ─────────────────────────────────────────────────────
function toggleAnnBookmark(id) {
  var user = typeof firebase !== 'undefined' && firebase.auth().currentUser;
  if (!user) { showToast('로그인 후 북마크할 수 있습니다.', 'info'); return; }
  var bookmarked = _isAnnBookmarked(id);
  var count      = _getAnnBookmarkCount(id);
  var uid        = user.uid;
  if (bookmarked) {
    count = Math.max(0, count - 1);
    localStorage.removeItem('ann_bm_' + id);
    localStorage.setItem('ann_bmc_' + id, count);
    db.collection('bookmarks').doc(id).set({ bookmarkCount: firebase.firestore.FieldValue.increment(-1), bookmarkedBy: firebase.firestore.FieldValue.arrayRemove(uid) }, { merge: true }).catch(function() {});
  } else {
    count++;
    localStorage.setItem('ann_bm_' + id, '1');
    localStorage.setItem('ann_bmc_' + id, count);
    var article = (state.newsData || []).find(function(a) { return a.id === id; });
    db.collection('bookmarks').doc(id).set({ bookmarkCount: firebase.firestore.FieldValue.increment(1), bookmarkedBy: firebase.firestore.FieldValue.arrayUnion(uid), type: 'ainews', articleId: id, title: article ? (article.title || '') : '' }, { merge: true }).catch(function() {});
  }
  var newBm = !bookmarked;
  var btn = document.getElementById('ann-bm-' + id);
  if (btn) {
    btn.className = 'ann-bookmark flex items-center gap-1 text-sm transition-colors ' + (newBm ? 'text-primary' : 'text-slate-400 hover:text-primary');
    var icon = btn.querySelector('.material-symbols-outlined'); if (icon) icon.style.fontVariationSettings = "'FILL' " + (newBm ? 1 : 0);
    var el = document.getElementById('ann-bmc-' + id); if (el) el.textContent = _capCountAnn(count);
  }
  if (state.annCurrentArticleId === id) {
    var dBtn = document.getElementById('ann-detail-bm');
    if (dBtn) { dBtn.className = 'flex items-center gap-1 p-1.5 rounded-lg transition-colors ' + (newBm ? 'text-primary' : 'text-slate-400 hover:text-primary'); var ic = dBtn.querySelector('.material-symbols-outlined'); if (ic) ic.style.fontVariationSettings = "'FILL' " + (newBm ? 1 : 0); }
    var dBmc = document.getElementById('ann-detail-bmc'); if (dBmc) dBmc.textContent = _capCountAnn(count);
  }
}

// ── Discussion 이동 (없으면 자동 생성) ──────────────────────────────────
function openAnnDiscussion(id) {
  if (!id) return;
  var user = auth && auth.currentUser;
  if (!user) { showToast('로그인 후 Discussion을 시작할 수 있습니다.', 'info'); return; }

  // 즉시 community-detail로 이동 + 스켈레톤 표시
  if (typeof _showCommunityDetailSkeleton === 'function') _showCommunityDetailSkeleton();
  goPage('community-detail');

  db.collection('communityPosts').where('sourceId', '==', id).limit(1).get()
    .then(function(snap) {
      if (!snap.empty) {
        _loadCommunityDetail(snap.docs[0].id);
      } else {
        var article = (state.newsData || []).find(function(a) { return a.id === id; });
        var postData = {
          sourceId: id, sourceType: 'ainews',
          title:       article ? (article.title   || '') : '',
          description: article ? (article.excerpt || article.summary || '') : '',
          image:       article ? (article.thumb   || '') : '',
          tag:         article ? (article.category || article.cat || 'News') : 'News',
          score:       article ? (article.trust_score || article.score || 0) : 0,
          grade:       article ? (article.trust_grade || article.grade || '') : '',
          source: 'ainews',
          yesCount: 0, partialCount: 0, noCount: 0, likeCount: 0, commentCount: 0,
          ts: firebase.firestore.FieldValue.serverTimestamp(),
        };
        db.collection('communityPosts').add(postData)
          .then(function(ref) { _loadCommunityDetail(ref.id); })
          .catch(function(e) { console.error('Discussion 생성 실패:', e); showToast('Discussion을 만들지 못했습니다.', 'error'); });
      }
    })
    .catch(function(e) { console.error('Discussion 조회 실패:', e); showToast('Discussion을 불러오지 못했습니다.', 'error'); });
}

function openAnnDiscussionDetail() {
  openAnnDiscussion(state.annCurrentArticleId || '');
}

// ── 상세 페이지 아이콘 상태 업데이트 ─────────────────────────────────────
function _updateAnnDetailIcons(id) {
  if (!id) return;
  var liked = _isAnnLiked(id); var bookmarked = _isAnnBookmarked(id);
  var likeBtn = document.getElementById('ann-detail-like');
  if (likeBtn) {
    likeBtn.className = 'flex items-center gap-1 p-1.5 rounded-lg transition-colors ' + (liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500');
    var icon = likeBtn.querySelector('.material-symbols-outlined'); if (icon) icon.style.fontVariationSettings = "'FILL' " + (liked ? 1 : 0);
    var lc = document.getElementById('ann-detail-lc'); if (lc) lc.textContent = _capCountAnn(_getAnnLikeCount(id));
  }
  var bmBtn = document.getElementById('ann-detail-bm');
  if (bmBtn) {
    bmBtn.className = 'flex items-center gap-1 p-1.5 rounded-lg transition-colors ' + (bookmarked ? 'text-primary' : 'text-slate-400 hover:text-primary');
    var icon = bmBtn.querySelector('.material-symbols-outlined'); if (icon) icon.style.fontVariationSettings = "'FILL' " + (bookmarked ? 1 : 0);
    var bmc = document.getElementById('ann-detail-bmc'); if (bmc) bmc.textContent = _capCountAnn(_getAnnBookmarkCount(id));
  }
  var dc = document.getElementById('ann-detail-dc'); if (dc) dc.textContent = _capCountAnn(_getAnnDiscussCount(id));
  // Firestore 비동기 동기화
  try { db.collection('annLikes').doc(id).get().then(function(snap) {
    if (!snap.exists) return; var d = snap.data(); var c = _capCountAnn(d.likeCount || 0);
    localStorage.setItem('ann_lc_' + id, c); var el = document.getElementById('ann-detail-lc'); if (el) el.textContent = c;
    var uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
    if (uid && d.likedBy && d.likedBy.indexOf(uid) !== -1) { localStorage.setItem('ann_ld_' + id, '1'); var b = document.getElementById('ann-detail-like'); if (b) { b.className = 'flex items-center gap-1 p-1.5 rounded-lg transition-colors text-rose-500'; var ic = b.querySelector('.material-symbols-outlined'); if (ic) ic.style.fontVariationSettings = "'FILL' 1"; } }
  }).catch(function() {}); } catch (_) {}
  try { db.collection('bookmarks').doc(id).get().then(function(snap) {
    if (!snap.exists) return; var d = snap.data(); var c = _capCountAnn(d.bookmarkCount || 0);
    localStorage.setItem('ann_bmc_' + id, c); var el = document.getElementById('ann-detail-bmc'); if (el) el.textContent = c;
    var uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
    if (uid && d.bookmarkedBy && d.bookmarkedBy.indexOf(uid) !== -1) { localStorage.setItem('ann_bm_' + id, '1'); var b = document.getElementById('ann-detail-bm'); if (b) { b.className = 'flex items-center gap-1 p-1.5 rounded-lg transition-colors text-primary'; var ic = b.querySelector('.material-symbols-outlined'); if (ic) ic.style.fontVariationSettings = "'FILL' 1"; } }
  }).catch(function() {}); } catch (_) {}
  try { db.collection('communityPosts').where('sourceId', '==', id).where('sourceType', '==', 'ainews').limit(1).get().then(function(snap) {
    if (snap.empty) return; var c = _capCountAnn(snap.docs[0].data().commentCount || 0);
    localStorage.setItem('ann_dc_' + id, c); var el = document.getElementById('ann-detail-dc'); if (el) el.textContent = c;
  }).catch(function() {}); } catch (_) {}
}

// ── 이벤트 위임 (카드 Like/Bookmark/Discuss/Share) ────────────────────
var _newsEventsSet = false;
function _setupNewsEvents() {
  if (_newsEventsSet) return;
  _newsEventsSet = true;
  var grid = document.getElementById('news-grid');
  if (!grid) return;
  grid.addEventListener('click', function(e) {
    var card = e.target.closest('[data-ann-id]');
    if (!card) return;
    var id    = card.dataset.annId    || '';
    var title = card.dataset.annTitle || '';
    if (e.target.closest('.ann-like'))     { e.stopPropagation(); toggleAnnLike(id);     return; }
    if (e.target.closest('.ann-bookmark')) { e.stopPropagation(); toggleAnnBookmark(id); return; }
    if (e.target.closest('.ann-discuss'))  { e.stopPropagation(); openAnnDiscussion(id); return; }
    if (e.target.closest('.ann-share')) {
      e.stopPropagation();
      var article = (state.newsData || []).find(function(a) { return a.id === id; });
      var shareUrl = (article && article.url) ? article.url : window.location.href;
      sharePartnerArticle(shareUrl, title, e.target.closest('.ann-share'));
      return;
    }
  });
}

// ── Firestore에서 Like/Bookmark/Discuss 수 비동기 로드 ─────────────────
function _fetchAnnInteractions() {
  var uid = typeof firebase !== 'undefined' && firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
  (state.newsData || []).forEach(function(a) {
    if (!a.id) return;
    var id = a.id;
    try { db.collection('annLikes').doc(id).get().then(function(snap) {
      if (!snap.exists) return; var d = snap.data(); var c = _capCountAnn(d.likeCount || 0);
      localStorage.setItem('ann_lc_' + id, c); var el = document.getElementById('ann-lc-' + id); if (el) el.textContent = c;
      if (uid && d.likedBy && d.likedBy.indexOf(uid) !== -1) {
        localStorage.setItem('ann_ld_' + id, '1'); var btn = document.getElementById('ann-like-' + id);
        if (btn) { btn.className = 'ann-like flex items-center gap-1 text-sm transition-colors text-rose-500'; var icon = btn.querySelector('.material-symbols-outlined'); if (icon) icon.style.fontVariationSettings = "'FILL' 1"; }
      }
    }).catch(function() {}); } catch (_) {}
    try { db.collection('bookmarks').doc(id).get().then(function(snap) {
      if (!snap.exists) return; var d = snap.data(); var c = _capCountAnn(d.bookmarkCount || 0);
      localStorage.setItem('ann_bmc_' + id, c); var el = document.getElementById('ann-bmc-' + id); if (el) el.textContent = c;
      if (uid && d.bookmarkedBy && d.bookmarkedBy.indexOf(uid) !== -1) {
        localStorage.setItem('ann_bm_' + id, '1'); var btn = document.getElementById('ann-bm-' + id);
        if (btn) { btn.className = 'ann-bookmark flex items-center gap-1 text-sm transition-colors text-primary'; var icon = btn.querySelector('.material-symbols-outlined'); if (icon) icon.style.fontVariationSettings = "'FILL' 1"; }
      }
    }).catch(function() {}); } catch (_) {}
    try { db.collection('communityPosts').where('sourceId', '==', id).where('sourceType', '==', 'ainews').limit(1).get().then(function(snap) {
      if (snap.empty) return; var c = _capCountAnn(snap.docs[0].data().commentCount || 0);
      localStorage.setItem('ann_dc_' + id, c); var el = document.getElementById('ann-dc-' + id); if (el) el.textContent = c;
    }).catch(function() {}); } catch (_) {}
  });
}

// ── 카드 렌더링 ───────────────────────────────────────────────────────
function renderNews() {
  var sf    = (document.getElementById('news-score-filter') || {}).value || '';
  var cf    = (document.getElementById('news-cat-filter')   || {}).value || '';

  var items = (state.newsData || []).filter(function(n) {
    // 점수 필터: trust_score(신규) 또는 grade(구형) 기준
    var grade = n.trust_grade || n.grade || '';
    if (sf && !grade.startsWith(sf)) return false;
    // 카테고리 필터: category(신규) 또는 cat(구형)
    var cat = n.category || n.cat || '';
    if (cf && cat !== cf) return false;
    return true;
  });

  if (!items.length) {
    document.getElementById('news-grid').innerHTML = `
      <div class="col-span-3 py-16 text-center text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-3 block">article</span>
        <p>No articles match the current filter.</p>
      </div>`;
    return;
  }

  _setupNewsEvents();
  document.getElementById('news-grid').innerHTML = items.map(function(n) {
    var cat     = n.category || n.cat || 'World';
    var grade   = n.trust_grade || n.grade || '';
    var excerpt = n.excerpt || n.summary || '';
    var source  = n.source_label || n.source || '';
    var isSynth = n._engine === 'ai_synthesized';

    var gc     = newsGradeClass(grade);
    var grad   = CAT_GRADIENT[cat] || 'from-slate-500 to-slate-700';
    var time   = newsTimeAgo(n.publishedAt || n.pubDate);
    // 판정 배지: AI Synthesized vs 기존 verdict_class
    var verdictHtml = isSynth
      ? `<span class="px-2.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 text-[10px] font-bold uppercase">AI Synthesized</span>`
      : `<span class="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase">${escHtml((n.verdict_class || 'UNVERIFIED').replace(/_/g, ' '))}</span>`;

    var safeId = escHtml(n.id || '');

    var liked      = _isAnnLiked(safeId);
    var bookmarked = _isAnnBookmarked(safeId);
    var likeCount  = _capCountAnn(_getAnnLikeCount(safeId));
    var bmCount    = _capCountAnn(_getAnnBookmarkCount(safeId));
    var dcCount    = _capCountAnn(_getAnnDiscussCount(safeId));

    return `
    <article class="news-card bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col group"
             data-ann-id="${safeId}" data-ann-title="${escHtml(n.title || '')}">

      <!-- 썸네일 -->
      <div class="relative cursor-pointer overflow-hidden h-48 bg-gradient-to-br ${grad} shrink-0"
           onclick="runNewsCheck('${safeId}')">
        ${n.thumb
          ? `<img src="${escHtml(n.thumb)}" alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onerror="this.style.display='none'"/>`
          : ''}
        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
          <div class="w-14 h-14 rounded-full bg-white/0 group-hover:bg-white/90 transition-all flex items-center justify-center scale-75 group-hover:scale-100">
            <span class="material-symbols-outlined text-primary opacity-0 group-hover:opacity-100 transition-opacity text-2xl">article</span>
          </div>
        </div>
        <!-- 등급 배지 -->
        <div class="absolute top-3 right-3 w-10 h-10 rounded-full border-2 flex items-center justify-center text-xs font-black shadow-md ${gc}">
          ${escHtml(grade || '?')}
        </div>
        <!-- 출처 배지 -->
        <div class="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-black/50 text-white text-[10px] font-bold backdrop-blur-sm max-w-[70%] truncate">
          ${escHtml(isSynth ? 'ANN AI' : source)}
        </div>
        ${isSynth ? `<div class="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-violet-600/80 text-white text-[9px] font-bold backdrop-blur-sm">AI</div>` : ''}
      </div>

      <!-- 콘텐츠 -->
      <div class="p-5 flex flex-col flex-1">
        <div class="flex items-center gap-2 mb-3 flex-wrap">
          <span class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wide">${escHtml(cat)}</span>
          ${verdictHtml}
          ${time ? `<span class="ml-auto text-xs text-slate-400 shrink-0">${time}</span>` : ''}
        </div>
        <h3 class="font-display font-bold text-slate-900 dark:text-white text-base leading-snug mb-3 flex-1 cursor-pointer hover:text-primary transition-colors line-clamp-3"
            onclick="runNewsCheck('${safeId}')">${escHtml(n.title || '')}</h3>
        ${excerpt
          ? `<p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-4 line-clamp-2">${escHtml(excerpt)}</p>`
          : ''}
        <!-- 하단 버튼 -->
        <div class="flex items-center gap-2 mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-2 ml-auto">
            <button id="ann-like-${safeId}" class="ann-like flex items-center gap-1 text-sm transition-colors ${liked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'}">
              <span class="material-symbols-outlined text-base" style="font-variation-settings:'FILL' ${liked ? 1 : 0}">favorite</span>
              <span id="ann-lc-${safeId}">${likeCount}</span>
            </button>
            <button id="ann-bm-${safeId}" class="ann-bookmark flex items-center gap-1 text-sm transition-colors ${bookmarked ? 'text-primary' : 'text-slate-400 hover:text-primary'}">
              <span class="material-symbols-outlined text-base" style="font-variation-settings:'FILL' ${bookmarked ? 1 : 0}">bookmark</span>
              <span id="ann-bmc-${safeId}">${bmCount}</span>
            </button>
            <button class="ann-discuss flex items-center gap-1 text-sm text-slate-400 hover:text-primary transition-colors">
              <span class="material-symbols-outlined text-base">forum</span>
              <span id="ann-dc-${safeId}">${dcCount}</span>
            </button>
            <button class="ann-share text-slate-400 hover:text-primary transition-colors p-1" title="Share">
              <span class="material-symbols-outlined text-base">share</span>
            </button>
          </div>
        </div>
      </div>
    </article>`;
  }).join('');
  _fetchAnnInteractions();
}

// ── 카드 클릭 → Verification Report 즉시 표시 ────────────────────────
function runNewsCheck(articleId) {
  var article = (state.newsData || []).find(function(a) { return a.id === articleId; });
  if (!article) return;
  state.annCurrentArticleId = articleId;

  state.lastInput = article.title || article.url || '';
  state.imageB64  = null;

  var isSynth = article._engine === 'ai_synthesized';

  if (isSynth) {
    // ── AI Synthesized 기사: 합성 결과를 리포트로 표시 ──────────────
    var grade = article.trust_grade || 'B+';
    var vc    = grade.startsWith('A') ? 'likely' : 'partial';

    state.lastResult = {
      overall_score:     article.trust_score || 80,
      overall_grade:     grade,
      verdict_class:     vc,
      executive_summary: article.excerpt || '',
      _body:             article.body || '',          // HTML 본문 (4–5단락)
      layer_analysis:    [],                           // v2.0에서 추가 예정
      metrics:           {},                           // v2.0에서 추가 예정
      claims: (article.key_claims || []).map(function(c) {
        return { sentence: c, status: 'CONFIRMED', verdict: '' };
      }),
      key_evidence: {
        supporting:    article.crawled_from || [],
        contradicting: [],
      },
      temporal:       null,
      web_citations:  [],                              // URL 없음 — 출처명만 사용
      _engine:        'ai_news',
      _source:        article.source_label || 'AI Synthesized',
      _topic:         article.topic || '',
      _thumb:         article.thumb || null,
      _title:         article.title || '',
      _is_synth:      true,
    };
  } else {
    // ── 구형 팩트체크 저장 데이터 ────────────────────────────────────
    var f  = article.m_factual        || 0;
    var l  = article.m_logic          || 0;
    var sq = article.m_source_quality || 0;
    var cv = article.m_cross_val      || 0;
    var re = article.m_recency        || 0;
    var layers = f ? [
      { layer: 'L1', name: 'Source',      score: sq, summary: '' },
      { layer: 'L2', name: 'Language',    score: l,  summary: '' },
      { layer: 'L3', name: 'Context',     score: f,  summary: '' },
      { layer: 'L4', name: 'Statistics',  score: cv, summary: '' },
      { layer: 'L5', name: 'AI Bias',     score: l,  summary: '' },
      { layer: 'L6', name: 'Fact Check',  score: f,  summary: '' },
      { layer: 'L7', name: 'Consensus',   score: re, summary: '' },
    ] : [];

    state.lastResult = {
      overall_score:     article.score || 72,
      overall_grade:     article.grade || 'B',
      verdict_class:     _toVc(article.verdict_class),
      executive_summary: article.d_sum || article.summary || '',
      _body:             '',
      layer_analysis:    layers,
      metrics: {
        factual:          f,
        logic:            l,
        source_quality:   sq,
        cross_validation: cv,
        recency:          re,
      },
      claims: (article.d_claims || []).map(function(c) {
        return { sentence: c.t || '', status: c.s || 'PARTIAL', verdict: c.v || '' };
      }),
      key_evidence: {
        supporting:    article.d_sup || [],
        contradicting: article.d_con || [],
      },
      temporal: article.d_fresh ? {
        freshness:           article.d_fresh,
        timeframe:           article.d_tf,
        expiry_risk:         article.d_er,
        recheck_recommended: article.d_rc,
      } : null,
      web_citations: (article.d_cit || []).concat(article.url ? [article.url] : []),
      _engine: 'ai_news',
      _source: article.source || '',
    };
  }

  goPage('report');
}

// verdict_class 정규화 (구형 데이터 호환)
function _toVc(raw) {
  var v = (raw || '').toLowerCase();
  if (v === 'verified')                          return 'verified';
  if (v === 'likely_true' || v === 'likely')     return 'likely';
  if (v === 'partially_true' || v === 'partial') return 'partial';
  if (v === 'misleading')                        return 'misleading';
  if (v === 'false')                             return 'false';
  return 'partial';
}
