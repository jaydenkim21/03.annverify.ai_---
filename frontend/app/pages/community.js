// ① Client Layer — Community 페이지

var SOURCE_BADGE = {
  user:    { label:'User',         icon:'person',    cls:'text-violet-600 bg-violet-50 dark:bg-violet-900/20' },
  ainews:  { label:'AI News',      icon:'smart_toy', cls:'text-primary bg-primary/10' },
  partner: { label:'Partner News', icon:'handshake', cls:'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
};

var _communitySort = 'recent'; // 현재 정렬 상태
var _communityTab  = 'all';   // 현재 활성 탭

// ── Firestore 데이터 정규화 헬퍼 ─────────────────────────────────────
function _normPost(docId, data) {
  var total = (data.yesCount || 0) + (data.partialCount || 0) + (data.noCount || 0);
  var yes     = total ? Math.round((data.yesCount    || 0) / total * 100) : 0;
  var partial = total ? Math.round((data.partialCount || 0) / total * 100) : 0;
  var no      = total ? 100 - yes - partial : 0;
  var tsMs    = data.ts && data.ts.seconds ? data.ts.seconds * 1000 : (data.ts || 0);
  return Object.assign({}, data, {
    _id:      docId,
    id:       docId,
    yes:      yes,
    partial:  partial,
    no:       no,
    likes:    data.likeCount    || 0,
    comments: data.commentCount || 0,
    date:     partnerTimeAgo(tsMs ? new Date(tsMs).toISOString() : '') || '',
    ts:       tsMs,
  });
}

// photoURL 있으면 이미지, 없으면 이니셜 원형
function _avatarHtml(photoURL, initial, colorCls, sizeCls) {
  sizeCls  = sizeCls  || 'w-10 h-10';
  colorCls = colorCls || 'bg-primary';
  var base = '<div class="' + sizeCls + ' ' + colorCls
    + ' text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0 relative overflow-hidden">'
    + escHtml(initial);
  if (photoURL) {
    base += '<img src="' + escHtml(photoURL) + '" alt="" '
      + 'class="absolute inset-0 w-full h-full object-cover" '
      + 'onerror="this.style.display=\'none\'">';
  }
  return base + '</div>';
}

function _normComment(docId, data) {
  var tsMs = data.ts && data.ts.seconds ? data.ts.seconds * 1000 : (data.ts || 0);
  return {
    _id:      docId,
    id:       docId,
    user:     data.userName    || 'Anonymous',
    role:     data.userRole    || '',
    initial:  (data.userName || 'A').charAt(0).toUpperCase(),
    color:    'bg-primary',
    photoURL: data.userPhotoURL || '',
    time:     partnerTimeAgo(tsMs ? new Date(tsMs).toISOString() : '') || 'just now',
    text:     data.text  || '',
    likes:    data.likeCount || 0,
    liked:    false,
    replies:  (data.replies || []).map(function(r) {
      var rTs = r.ts && r.ts.seconds ? r.ts.seconds * 1000 : (r.ts || 0);
      return {
        _id:      r._id || '',
        user:     r.userName    || 'Anonymous',
        role:     '',
        initial:  (r.userName || 'A').charAt(0).toUpperCase(),
        color:    'bg-slate-500',
        photoURL: r.userPhotoURL || '',
        time:     partnerTimeAgo(rTs ? new Date(rTs).toISOString() : '') || 'just now',
        text:     r.text    || '',
        likes:    r.likeCount || 0,
        liked:    false,
      };
    }),
  };
}

// ── 정렬 ─────────────────────────────────────────────────────────────
function setCommunitySort(sort) {
  _communitySort = sort;
  // PC 버튼 스타일 업데이트
  ['recent','oldest','comments','likes'].forEach(s => {
    var btn = document.getElementById('csort-' + s);
    if (!btn) return;
    btn.className = s === sort
      ? 'community-sort-btn px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary text-white transition-all'
      : 'community-sort-btn px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all';
  });
  // 모바일 드롭다운 동기화
  var sel = document.getElementById('csort-select');
  if (sel) sel.value = sort;
  renderCommunity(_communityTab);
}

function sortCommunityItems(items) {
  var sorted = items.slice();
  if      (_communitySort === 'recent')   sorted.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  else if (_communitySort === 'oldest')   sorted.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  else if (_communitySort === 'comments') sorted.sort((a, b) => (b.comments || 0) - (a.comments || 0));
  else if (_communitySort === 'likes')    sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  return sorted;
}

// ── 리스트 렌더링 ─────────────────────────────────────────────────────
function loadCommunity() {
  var grid = document.getElementById('community-grid');
  if (grid) {
    grid.innerHTML = '<div class="col-span-2 py-16 text-center text-slate-400">'
      + '<span class="material-symbols-outlined text-4xl mb-3 block" style="animation:spin 1s linear infinite">progress_activity</span>'
      + '<p>Loading discussions…</p></div>';
  }
  db.collection('communityPosts').orderBy('ts', 'desc').limit(50).get()
    .then(function(snap) {
      state.communityData = snap.docs.map(function(doc) {
        return _normPost(doc.id, doc.data());
      });
      renderCommunity();
    })
    .catch(function() {
      state.communityData = [];
      renderCommunity();
    });
}

function setCommunityTab(tab) {
  _communityTab = tab;
  // PC 탭 버튼 스타일 업데이트
  ['all','user','ainews','partner'].forEach(t => {
    var btn = document.getElementById('ctab-' + t);
    if (!btn) return;
    btn.className = t === tab
      ? 'pb-3 text-sm font-bold border-b-2 border-primary text-primary px-1 whitespace-nowrap'
      : 'pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-1 border-b-2 border-transparent whitespace-nowrap';
  });
  // 모바일 드롭다운 동기화
  var sel = document.getElementById('ctab-select');
  if (sel) sel.value = tab;
  renderCommunity(tab);
}

function renderCommunity(tab) {
  var items = state.communityData || [];
  if      (tab === 'user')    items = items.filter(i => i.source === 'user');
  else if (tab === 'ainews')  items = items.filter(i => i.source === 'ainews');
  else if (tab === 'partner') items = items.filter(i => i.source === 'partner');
  // 'all' : 필터 없음
  items = sortCommunityItems(items);

  var emptyMsg = {
    user:    "You haven't fact-checked any claims yet.",
    ainews:  'No AI News fact-checks available.',
    partner: 'No Partner News fact-checks available.',
    all:     'No discussions found.',
  };
  var scoreColor = s => s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-blue-600' : s >= 40 ? 'text-amber-600' : 'text-red-600';
  document.getElementById('community-grid').innerHTML = items.length
    ? items.map(item => `
      <article onclick="openCommunityDetail('${item.id}')" class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 news-card cursor-pointer hover:border-primary/40 hover:shadow-xl transition-all">
        <div class="flex items-start justify-between gap-3 mb-4">
          <span class="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2.5 py-1 rounded-full">${item.tag}</span>
          <span class="text-lg font-black ${scoreColor(item.score)}">${item.score}</span>
        </div>
        <h3 class="font-display font-bold text-slate-900 dark:text-white leading-snug mb-5">${escHtml(item.title)}</h3>
        <div class="flex gap-2 mb-5">
          <div class="flex-1 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold text-center">
            ✓ Yes Verified <span class="font-normal opacity-70">${item.yes}%</span>
          </div>
          <div class="flex-1 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-bold text-center">
            ~ Partial <span class="font-normal opacity-70">${item.partial}%</span>
          </div>
          <div class="flex-1 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-bold text-center">
            ✗ No <span class="font-normal opacity-70">${item.no}%</span>
          </div>
        </div>
        <div class="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
          <span class="${SOURCE_BADGE[item.source].cls} text-xs font-bold flex items-center gap-1 px-2.5 py-1 rounded-full">
            <span class="material-symbols-outlined text-sm">${SOURCE_BADGE[item.source].icon}</span>
            ${SOURCE_BADGE[item.source].label}
          </span>
          <div class="flex items-center gap-3 text-slate-400">
            <span class="flex items-center gap-1 text-xs"><span class="material-symbols-outlined text-sm">favorite_border</span>${item.likes || 0}</span>
            <span class="flex items-center gap-1 text-xs"><span class="material-symbols-outlined text-sm">comment</span>${item.comments || 0}</span>
            <span class="text-xs">${item.date}</span>
          </div>
        </div>
      </article>`).join('')
    : `<div class="col-span-2 py-16 text-center text-slate-400">
        <span class="material-symbols-outlined text-4xl mb-3 block">forum</span>
        <p class="mb-4">${emptyMsg[tab] || emptyMsg.all}</p>
        <button onclick="goPage('home')" class="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm">Start Verifying</button>
      </div>`;
}

// ── 디테일 페이지 ─────────────────────────────────────────────────────
function openCommunityDetail(id) {
  db.collection('communityPosts').doc(id).get().then(function(snap) {
    if (!snap.exists) return;
    var item = _normPost(snap.id, snap.data());
    state.communityDetail = item;
    if (!state.communityComments) state.communityComments = {};
    // Firestore에서 댓글 로드
    db.collection('communityPosts').doc(id).collection('comments')
      .orderBy('ts', 'desc').limit(50).get().then(function(cSnap) {
        state.communityComments[id] = cSnap.docs.map(function(d) {
          return _normComment(d.id, d.data());
        });
        renderCommunityDetail(item);
        goPage('community-detail');
      }).catch(function() {
        state.communityComments[id] = [];
        renderCommunityDetail(item);
        goPage('community-detail');
      });
  }).catch(function() {
    showToast('게시글을 불러오지 못했습니다.', 'error');
  });
}

function renderCommunityDetail(item) {
  var verdictColor = {
    'TOP VERIFIED':     'bg-emerald-500',
    'LIKELY TRUE':      'bg-blue-500',
    'PARTIAL VERIFIED': 'bg-amber-500',
    'UNVERIFIED':       'bg-slate-400',
  };
  var vcls = verdictColor[item.verdict] || 'bg-slate-400';
  var scoreColor = item.score >= 80 ? 'text-emerald-600' : item.score >= 60 ? 'text-blue-600' : item.score >= 40 ? 'text-amber-600' : 'text-red-600';
  var src = SOURCE_BADGE[item.source] || SOURCE_BADGE.user;

  // 클레임 카드 — 이미지 좌 1/3 + 콘텐츠 우 2/3
  document.getElementById('cd-claim-card').innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm overflow-hidden border border-slate-100 dark:border-slate-800 mb-6">
      <div class="flex flex-col sm:flex-row">
        ${item.image ? `<div class="sm:w-1/3 shrink-0"><img src="${escHtml(item.image)}" alt="" class="w-full h-48 sm:h-full object-cover"/></div>` : ''}
        <div class="flex-1 p-5 sm:p-6 min-w-0">
          <div class="flex items-center gap-2 mb-3 flex-wrap">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-wide ${vcls}">${item.verdict || 'UNVERIFIED'}</span>
            <span class="${src.cls} text-[10px] font-bold flex items-center gap-1 px-2.5 py-1 rounded-full">
              <span class="material-symbols-outlined text-xs">${src.icon}</span>${src.label}
            </span>
            <span class="ml-auto text-xs text-slate-400">${item.date || ''}</span>
          </div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-primary mb-1.5">Fact-Checked Claim</p>
          <h2 class="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug mb-2">${escHtml(item.title)}</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">${escHtml(item.description || '')}</p>
          <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-2">
              <span class="text-xs text-slate-400 font-medium uppercase tracking-wide">Trust Score</span>
              <span class="text-lg font-black ${scoreColor}">${item.score}%</span>
            </div>
            <div class="flex gap-2 ml-auto flex-wrap">
              <span class="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-lg">✓ ${item.yes}%</span>
              <span class="text-[10px] font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-lg">~ ${item.partial}%</span>
              <span class="text-[10px] font-bold bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-2 py-1 rounded-lg">✗ ${item.no}%</span>
            </div>
          </div>
          ${item.claimSource ? `<p class="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">${escHtml(item.claimSource)}</p>` : ''}
        </div>
      </div>
    </div>`;

  // 커뮤니티 폴
  document.getElementById('cd-poll').innerHTML = `
    <div class="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-6">
      <div class="flex items-center gap-2 mb-4">
        <span class="material-symbols-outlined text-primary text-lg">how_to_vote</span>
        <div>
          <p class="font-bold text-slate-900 dark:text-white text-sm">Community Poll</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">Do you agree with this claim?</p>
        </div>
      </div>
      <div class="flex gap-3">
        <button onclick="voteCommunity('${item.id}','yes',this)" class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20">
          <span class="material-symbols-outlined text-base">thumb_up</span>Yes, Verified
        </button>
        <button onclick="voteCommunity('${item.id}','partial',this)" class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-sm font-bold rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all">
          <span class="material-symbols-outlined text-base">remove</span>Partially
        </button>
        <button onclick="voteCommunity('${item.id}','no',this)" class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
          <span class="material-symbols-outlined text-base">thumb_down</span>No
        </button>
      </div>
    </div>`;

  renderCommunityComments(item.id);
}

function renderCommunityComments(id) {
  var comments = (state.communityComments && state.communityComments[id]) || [];
  var total    = comments.reduce(function(n, c) { return n + 1 + (c.replies ? c.replies.length : 0); }, 0);

  document.getElementById('cd-comment-count').textContent = total;

  var listEl = document.getElementById('cd-comments-list');
  listEl.innerHTML = comments.map(function(c, ci) {
    var repliesHtml = '';
    if (c.replies && c.replies.length) {
      repliesHtml = '<div class="mt-3 ml-8 space-y-3">'
        + c.replies.map(function(r, ri) {
          return '<div class="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 flex gap-3">'
            + _avatarHtml(r.photoURL, r.initial, r.color || 'bg-slate-500', 'w-7 h-7')
            + '<div class="flex-1 min-w-0">'
              + '<div class="flex items-center gap-2 mb-1 flex-wrap">'
                + '<span class="text-xs font-bold text-slate-900 dark:text-white">' + escHtml(r.user) + '</span>'
                + '<span class="text-xs text-slate-400 ml-auto">' + r.time + '</span>'
              + '</div>'
              + '<p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-1.5">' + escHtml(r.text) + '</p>'
              + '<button onclick="likeCommunityComment(\'' + id + '\',' + ci + ',' + ri + ',this)" class="flex items-center gap-1 text-xs ' + (r.liked ? 'text-primary font-bold' : 'text-slate-400 hover:text-primary') + ' transition-colors">'
                + '<span class="material-symbols-outlined text-sm">' + (r.liked ? 'favorite' : 'favorite_border') + '</span>'
                + '<span class="like-count">' + r.likes + '</span>'
              + '</button>'
            + '</div>'
          + '</div>';
        }).join('')
        + '</div>';
    }

    return '<div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 mb-4">'
      + '<div class="flex gap-3">'
        + _avatarHtml(c.photoURL, c.initial, c.color || 'bg-primary', 'w-10 h-10')
        + '<div class="flex-1 min-w-0">'
          + '<div class="flex items-center gap-2 mb-1 flex-wrap">'
            + '<span class="text-sm font-bold text-slate-900 dark:text-white">' + escHtml(c.user) + '</span>'
            + (c.role ? '<span class="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full">' + escHtml(c.role) + '</span>' : '')
            + '<span class="text-xs text-slate-400 ml-auto">' + c.time + '</span>'
          + '</div>'
          + '<p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-3">' + escHtml(c.text) + '</p>'
          + '<div class="flex items-center gap-4">'
            + '<button onclick="likeCommunityComment(\'' + id + '\',' + ci + ',null,this)" class="flex items-center gap-1 text-xs ' + (c.liked ? 'text-primary font-bold' : 'text-slate-400 hover:text-primary') + ' transition-colors">'
              + '<span class="material-symbols-outlined text-sm">' + (c.liked ? 'favorite' : 'favorite_border') + '</span>'
              + '<span class="like-count">' + c.likes + '</span>'
            + '</button>'
            + '<button onclick="toggleReplyInput(\'reply-input-' + ci + '\')" class="text-xs text-slate-400 hover:text-primary transition-colors flex items-center gap-1">'
              + '<span class="material-symbols-outlined text-sm">reply</span>Reply'
            + '</button>'
          + '</div>'
          + '<div id="reply-input-' + ci + '" class="hidden mt-3">'
            + '<div class="flex gap-2">'
              + '<input type="text" placeholder="Write a reply…" class="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"/>'
              + '<button onclick="postCommunityReply(\'' + id + '\',' + ci + ',\'reply-input-' + ci + '\')" class="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-colors">Post</button>'
            + '</div>'
          + '</div>'
        + '</div>'
      + '</div>'
      + repliesHtml
      + '</div>';
  }).join('') || '<p class="text-sm text-slate-400 text-center py-8">Be the first to share your perspective!</p>';
}

function voteCommunity(id, vote, btn) {
  // UI 업데이트
  var container = btn.closest('#cd-poll');
  var btns = container.querySelectorAll('button');
  btns.forEach(function(b) {
    b.className = b.className
      .replace('bg-primary text-white shadow-lg shadow-primary/20', 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300');
  });
  btn.className = btn.className
    .replace('border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300', 'bg-primary text-white shadow-lg shadow-primary/20');

  var user = typeof auth !== 'undefined' && auth.currentUser;
  if (!user) { showToast('로그인 후 투표할 수 있습니다.', 'info'); return; }

  var postRef = db.collection('communityPosts').doc(id);
  var voteRef = postRef.collection('votes').doc(user.uid);

  // 트랜잭션: 이전 투표 확인 후 카운트 조정
  db.runTransaction(function(tx) {
    return tx.get(voteRef).then(function(voteSnap) {
      var prevVote = voteSnap.exists ? voteSnap.data().vote : null;
      if (prevVote === vote) return; // 동일 투표 → 무시
      var updates = {};
      if (prevVote) updates[prevVote + 'Count'] = firebase.firestore.FieldValue.increment(-1);
      updates[vote + 'Count'] = firebase.firestore.FieldValue.increment(1);
      tx.set(voteRef, { vote: vote, ts: Date.now() });
      tx.update(postRef, updates);
    });
  }).catch(function(e) { console.warn('vote 저장 실패:', e); });

  // 로컬 state 활동 추적
  var item = state.communityDetail || {};
  var entry = { id: id, vote: vote, title: item.title || '', ts: Date.now() };
  var existing = (state.myActivity.votes || []).findIndex(function(v) { return v.id === id; });
  if (existing >= 0) state.myActivity.votes.splice(existing, 1, entry);
  else               (state.myActivity.votes = state.myActivity.votes || []).unshift(entry);
}

function toggleReplyInput(elId) {
  var el = document.getElementById(elId);
  if (el) el.classList.toggle('hidden');
}

function likeCommunityComment(itemId, ci, ri, btn) {
  var comments = state.communityComments && state.communityComments[itemId];
  if (!comments || !comments[ci]) return;
  var isReply = ri !== null && ri !== undefined;
  var target  = isReply ? (comments[ci].replies && comments[ci].replies[ri]) : comments[ci];
  if (!target) return;

  target.liked  = !target.liked;
  target.likes += target.liked ? 1 : -1;

  var delta = target.liked ? 1 : -1;

  // Firestore: 최상위 댓글 좋아요
  if (!isReply && comments[ci]._id) {
    db.collection('communityPosts').doc(itemId).collection('comments').doc(comments[ci]._id)
      .update({ likeCount: firebase.firestore.FieldValue.increment(delta) })
      .catch(function(e) { console.warn('댓글 좋아요 저장 실패:', e); });
  }

  // DOM 즉시 반영
  var iconEl  = btn.querySelector('.material-symbols-outlined');
  var countEl = btn.querySelector('.like-count');
  if (iconEl)  iconEl.textContent  = target.liked ? 'favorite' : 'favorite_border';
  if (countEl) countEl.textContent = target.likes;
  btn.className = btn.className.includes('text-primary')
    ? btn.className.replace('text-primary font-bold', 'text-slate-400 hover:text-primary')
    : btn.className.replace('text-slate-400 hover:text-primary', 'text-primary font-bold');
}

function postCommunityComment() {
  var item = state.communityDetail;
  if (!item) return;
  var user = auth && auth.currentUser;
  if (!user) { showToast('로그인 후 댓글을 작성할 수 있습니다.', 'info'); return; }
  var textarea = document.getElementById('cd-comment-textarea');
  var text = textarea ? textarea.value.trim() : '';
  if (!text) return;

  var name = user.displayName || user.email.split('@')[0];
  var ts   = Date.now();
  var commentData = {
    uid: user.uid, userName: name, userRole: '', userPhotoURL: user.photoURL || '',
    text: text, likeCount: 0, replies: [], ts: ts,
  };

  // Firestore 저장 → 반환된 ID로 로컬 state 추가
  db.collection('communityPosts').doc(item.id).collection('comments').add(commentData)
    .then(function(ref) {
      if (!state.communityComments) state.communityComments = {};
      if (!state.communityComments[item.id]) state.communityComments[item.id] = [];
      state.communityComments[item.id].unshift(_normComment(ref.id, commentData));
      if (textarea) textarea.value = '';
      renderCommunityComments(item.id);
      // 게시글 댓글 수 증가
      db.collection('communityPosts').doc(item.id)
        .update({ commentCount: firebase.firestore.FieldValue.increment(1) }).catch(function() {});
      // 활동 추적
      if (!state.myActivity) state.myActivity = { comments:[], votes:[], likesGiven:0 };
      state.myActivity.comments.unshift({ itemId: item.id, title: item.title, text: text, ts: ts });
    }).catch(function(e) { console.warn('댓글 저장 실패:', e); showToast('댓글 저장에 실패했습니다.', 'error'); });
}

function postCommunityReply(itemId, ci, inputWrapperId) {
  var wrap  = document.getElementById(inputWrapperId);
  var input = wrap ? wrap.querySelector('input') : null;
  var text  = input ? input.value.trim() : '';
  if (!text) return;
  var user = auth && auth.currentUser;
  if (!user) { showToast('로그인 후 답글을 작성할 수 있습니다.', 'info'); return; }
  var name     = user.displayName || user.email.split('@')[0];
  var ts       = Date.now();
  var replyObj = { uid: user.uid, userName: name, userPhotoURL: user.photoURL || '', text: text, likeCount: 0, ts: ts };

  var comment = state.communityComments && state.communityComments[itemId] && state.communityComments[itemId][ci];
  if (!comment) return;

  // Firestore 댓글 문서의 replies 배열에 추가
  if (comment._id) {
    db.collection('communityPosts').doc(itemId).collection('comments').doc(comment._id)
      .update({ replies: firebase.firestore.FieldValue.arrayUnion(replyObj) })
      .catch(function(e) { console.warn('답글 저장 실패:', e); });
  }

  // 로컬 state 즉시 반영
  var localReply = {
    user: name, role:'', initial: name.charAt(0).toUpperCase(),
    color:'bg-slate-500', photoURL: user.photoURL || '',
    time:'just now', text: text, likes:0, liked:false,
  };
  comment.replies.push(localReply);
  if (input) input.value = '';
  renderCommunityComments(itemId);
}
