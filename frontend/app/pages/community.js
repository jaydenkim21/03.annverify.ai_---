// ① Client Layer — Community 페이지

var SOURCE_BADGE = {
  user:    { label:'User',         icon:'person',    cls:'text-violet-600 bg-violet-50 dark:bg-violet-900/20' },
  ainews:  { label:'AI News',      icon:'smart_toy', cls:'text-primary bg-primary/10' },
  partner: { label:'Partner News', icon:'handshake', cls:'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
};

// source: 'user' | 'ainews' | 'partner'
var COMMUNITY_MOCK = [
  {
    id:1, tag:'Tech', score:62, yes:45, partial:30, no:25, date:'2h ago', comments:34, likes:128, ts:Date.now()-7200000,
    source:'user', verdict:'PARTIAL VERIFIED',
    title:'Is AI really replacing 40% of jobs by 2030?',
    description:'A widely-cited report claims artificial intelligence will automate 40% of all global jobs by 2030. The figure originates from a McKinsey analysis drawing on labor market data across 30 countries, but experts disagree on scope and timeline.',
    claimSource:'Source: McKinsey Global Institute / World Economic Forum',
    image:'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=600&q=80',
  },
  {
    id:2, tag:'Science', score:87, yes:71, partial:18, no:11, date:'5h ago', comments:52, likes:214, ts:Date.now()-18000000,
    source:'ainews', verdict:'TOP VERIFIED',
    title:'Climate models predict 4°C rise by 2100 — verified?',
    description:'Multiple peer-reviewed climate models now project a global average temperature increase of 3.8–4.2°C by 2100 under high-emission scenarios. The IPCC Sixth Assessment Report corroborates this range with high confidence.',
    claimSource:'Source: IPCC AR6 / Nature Climate Change',
    image:'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&q=80',
  },
  {
    id:3, tag:'Health', score:43, yes:28, partial:42, no:30, date:'8h ago', comments:19, likes:47, ts:Date.now()-28800000,
    source:'user', verdict:'UNVERIFIED',
    title:'Viral: "New study shows coffee prevents Alzheimer\'s"',
    description:'A viral social media post references a study claiming daily coffee consumption reduces Alzheimer\'s risk by up to 65%. While some observational studies show correlation, no causal mechanism has been established in peer-reviewed literature.',
    claimSource:'Source: Journal of Alzheimer\'s Disease (observational study, n=1,400)',
    image:'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80',
  },
  {
    id:4, tag:'Politics', score:92, yes:84, partial:10, no:6, date:'1d ago', comments:67, likes:301, ts:Date.now()-86400000,
    source:'partner', verdict:'TOP VERIFIED',
    title:'Did the Senate pass a net neutrality bill last week?',
    description:'The U.S. Senate voted 52–47 to restore net neutrality rules, reversing the 2017 FCC rollback. The legislation mandates ISPs treat all internet traffic equally and prohibits throttling or paid prioritization.',
    claimSource:'Source: U.S. Senate Records / FCC Official Statement',
    image:'https://images.unsplash.com/photo-1555848962-6e79363ec58f?w=600&q=80',
  },
  {
    id:5, tag:'Health', score:71, yes:55, partial:35, no:10, date:'1d ago', comments:88, likes:176, ts:Date.now()-90000000,
    source:'ainews', verdict:'LIKELY TRUE',
    title:'Social media causes depression in teenagers — evidence?',
    description:'A longitudinal study of 12,000 teenagers found a moderate correlation (r=0.31) between daily social media use exceeding 3 hours and self-reported depressive symptoms. Researchers caution against inferring direct causation.',
    claimSource:'Source: American Psychological Association / JAMA Pediatrics',
    image:'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600&q=80',
  },
  {
    id:6, tag:'Health', score:58, yes:38, partial:40, no:22, date:'2d ago', comments:41, likes:93, ts:Date.now()-172800000,
    source:'partner', verdict:'PARTIAL VERIFIED',
    title:'"Eating red meat 3x/week doubles heart disease risk" — true?',
    description:'The claim originates from a 2020 meta-analysis of dietary studies. However, the doubled risk applies specifically to processed red meat, not unprocessed cuts, and was observed only in populations with pre-existing cardiovascular risk factors.',
    claimSource:'Source: European Heart Journal / WHO Dietary Guidelines',
    image:'https://images.unsplash.com/photo-1558030006-450675393462?w=600&q=80',
  },
];

// 공용 목 댓글 데이터
var COMMUNITY_MOCK_COMMENTS = [
  {
    id:1, user:'Marcus Chen', role:'POLICY EXPERT', initial:'M', color:'bg-blue-500',
    time:'2h ago', text:'The analysis is technically accurate but only applies to certain sectors. It\'s important to read the fine print in the supporting documentation before drawing broad conclusions.',
    likes:34, liked:false,
    replies:[
      {id:11, user:'Sarah Jenkins', role:'', initial:'S', color:'bg-emerald-500',
       time:'1h ago', text:'Thanks for clarifying! I was wondering about the broader implications too.', likes:5, liked:false},
    ]
  },
  {
    id:2, user:'David Miller', role:'', initial:'D', color:'bg-slate-500',
    time:'5h ago', text:'Is there any word on the timeline for official adoption? The deadline seems quite ambitious given the current regulatory backlog.',
    likes:12, liked:false, replies:[]
  },
  {
    id:3, user:'Amy Rodriguez', role:'RESEARCHER', initial:'A', color:'bg-purple-500',
    time:'8h ago', text:'I\'ve been following this topic closely. The figures vary widely by region and sector — it\'s important not to apply a single statistic universally.',
    likes:28, liked:false, replies:[]
  },
];

var _communitySort = 'recent'; // 현재 정렬 상태
var _communityTab  = 'all';   // 현재 활성 탭

// ── 정렬 ─────────────────────────────────────────────────────────────
function setCommunitySort(sort) {
  _communitySort = sort;
  // 버튼 스타일 업데이트
  ['recent','oldest','comments','likes'].forEach(s => {
    var btn = document.getElementById('csort-' + s);
    if (!btn) return;
    btn.className = s === sort
      ? 'community-sort-btn px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary text-white transition-all'
      : 'community-sort-btn px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all';
  });
  // 현재 활성 탭 기준으로 재렌더링
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
  state.communityData = COMMUNITY_MOCK;
  renderCommunity();
}

function setCommunityTab(tab) {
  _communityTab = tab;
  ['all','user','ainews','partner'].forEach(t => {
    var btn = document.getElementById('ctab-' + t);
    if (!btn) return;
    btn.className = t === tab
      ? 'pb-3 text-sm font-bold border-b-2 border-primary text-primary px-1 whitespace-nowrap'
      : 'pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-1 border-b-2 border-transparent whitespace-nowrap';
  });
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
      <article onclick="openCommunityDetail(${item.id})" class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 news-card cursor-pointer hover:border-primary/40 hover:shadow-xl transition-all">
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
  var item = COMMUNITY_MOCK.find(c => c.id === id);
  if (!item) return;
  state.communityDetail = item;
  // 댓글 초기화 (각 항목마다 독립 복사본)
  if (!state.communityComments) state.communityComments = {};
  if (!state.communityComments[id]) {
    state.communityComments[id] = JSON.parse(JSON.stringify(COMMUNITY_MOCK_COMMENTS));
  }
  renderCommunityDetail(item);
  goPage('community-detail');
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

  // 클레임 카드
  document.getElementById('cd-claim-card').innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-6 sm:p-8 mb-6 flex flex-col sm:flex-row gap-6">
      <img src="${item.image}" alt="" class="w-full sm:w-48 h-40 sm:h-36 object-cover rounded-2xl shrink-0"/>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-3 mb-3 flex-wrap">
          <span class="px-3 py-1 rounded-full text-xs font-bold text-white ${vcls}">${item.verdict}</span>
          <span class="text-xs font-bold uppercase tracking-widest text-slate-400">TRUST SCORE</span>
          <span class="text-xl font-black ${scoreColor}">${item.score}%</span>
        </div>
        <p class="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Fact-Checked Claim</p>
        <h2 class="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug mb-3">Claim: ${escHtml(item.title)}</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">${escHtml(item.description)}</p>
        <div class="flex items-center justify-between flex-wrap gap-3">
          <p class="text-xs text-slate-400">${escHtml(item.claimSource)}</p>
          <button onclick="goPage('report')" class="text-xs font-bold text-primary border border-primary/30 px-3 py-1.5 rounded-xl hover:bg-primary/10 transition-colors flex items-center gap-1">
            <span class="material-symbols-outlined text-sm">open_in_new</span>View Full Evidence Report
          </button>
        </div>
      </div>
    </div>`;

  // 커뮤니티 폴
  document.getElementById('cd-poll').innerHTML = `
    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-6 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
      <div class="flex items-center gap-3 flex-1">
        <div class="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-primary text-xl">how_to_vote</span>
        </div>
        <div>
          <p class="font-bold text-slate-900 dark:text-white text-sm">Community Poll: Do you agree with this claim?</p>
          <p class="text-xs text-slate-400 mt-0.5">Based on the provided evidence, what is your stance?</p>
        </div>
      </div>
      <div class="flex gap-3 w-full sm:w-auto">
        <button onclick="voteCommunity(${item.id},'yes',this)" class="flex-1 sm:flex-none flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
          <span class="material-symbols-outlined text-base">thumb_up</span>Yes, Verified
        </button>
        <button onclick="voteCommunity(${item.id},'no',this)" class="flex-1 sm:flex-none flex items-center gap-2 px-5 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
          <span class="material-symbols-outlined text-base">thumb_down</span>No, Skeptical
        </button>
      </div>
    </div>`;

  renderCommunityComments(item.id);
}

function renderCommunityComments(id) {
  var comments = (state.communityComments && state.communityComments[id]) || [];
  var total    = comments.reduce((n, c) => n + 1 + (c.replies ? c.replies.length : 0), 0);

  document.getElementById('cd-comment-count').textContent = total;

  var listEl = document.getElementById('cd-comments-list');
  listEl.innerHTML = comments.map((c, ci) => `
    <div class="mb-6">
      <div class="flex gap-3">
        <div class="w-9 h-9 ${c.color} text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">${c.initial}</div>
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="text-sm font-bold text-slate-900 dark:text-white">${escHtml(c.user)}</span>
            ${c.role ? `<span class="text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full">${c.role}</span>` : ''}
            <span class="text-xs text-slate-400 ml-auto">${c.time}</span>
          </div>
          <p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-2">${escHtml(c.text)}</p>
          <div class="flex items-center gap-4">
            <button onclick="likeCommunityComment(${id},${ci},null,this)" class="flex items-center gap-1 text-xs ${c.liked ? 'text-primary font-bold' : 'text-slate-400 hover:text-primary'} transition-colors">
              <span class="material-symbols-outlined text-sm">${c.liked ? 'favorite' : 'favorite_border'}</span>
              <span class="like-count">${c.likes}</span>
            </button>
            <button onclick="toggleReplyInput('reply-input-${ci}')" class="text-xs text-slate-400 hover:text-primary transition-colors flex items-center gap-1">
              <span class="material-symbols-outlined text-sm">reply</span>Reply
            </button>
          </div>
          <!-- 답글 입력창 -->
          <div id="reply-input-${ci}" class="hidden mt-3">
            <div class="flex gap-2">
              <input type="text" placeholder="Write a reply..." class="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"/>
              <button onclick="postCommunityReply(${id},${ci},'reply-input-${ci}')" class="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-colors">Post</button>
            </div>
          </div>
          <!-- 답글 목록 -->
          ${c.replies && c.replies.length ? `
          <div class="mt-3 space-y-3 pl-4 border-l-2 border-slate-100 dark:border-slate-800">
            ${c.replies.map((r, ri) => `
              <div class="flex gap-3">
                <div class="w-7 h-7 ${r.color} text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">${r.initial}</div>
                <div class="flex-1">
                  <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <span class="text-sm font-bold text-slate-900 dark:text-white">${escHtml(r.user)}</span>
                    <span class="text-xs text-slate-400 ml-auto">${r.time}</span>
                  </div>
                  <p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-1">${escHtml(r.text)}</p>
                  <button onclick="likeCommunityComment(${id},${ci},${ri},this)" class="flex items-center gap-1 text-xs ${r.liked ? 'text-primary font-bold' : 'text-slate-400 hover:text-primary'} transition-colors">
                    <span class="material-symbols-outlined text-sm">${r.liked ? 'favorite' : 'favorite_border'}</span>
                    <span class="like-count">${r.likes}</span>
                  </button>
                </div>
              </div>`).join('')}
          </div>` : ''}
        </div>
      </div>
    </div>`).join('') || '<p class="text-sm text-slate-400 text-center py-8">Be the first to share your perspective!</p>';
}

function voteCommunity(_id, _vote, btn) {
  var container = btn.closest('#cd-poll');
  var btns = container.querySelectorAll('button');
  btns.forEach(b => {
    b.className = b.className
      .replace('bg-primary text-white shadow-lg shadow-primary/20','border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300');
  });
  btn.className = btn.className
    .replace('border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300','bg-primary text-white shadow-lg shadow-primary/20');
}

function toggleReplyInput(elId) {
  var el = document.getElementById(elId);
  if (el) el.classList.toggle('hidden');
}

function likeCommunityComment(itemId, ci, ri, btn) {
  var comments = state.communityComments[itemId];
  if (!comments || !comments[ci]) return;
  var target = (ri !== null && ri !== undefined && comments[ci].replies && comments[ci].replies[ri])
    ? comments[ci].replies[ri]
    : comments[ci];
  if (!target) return;
  target.liked = !target.liked;
  target.likes += target.liked ? 1 : -1;
  var iconEl  = btn.querySelector('.material-symbols-outlined');
  var countEl = btn.querySelector('.like-count');
  if (iconEl)  iconEl.textContent  = target.liked ? 'favorite' : 'favorite_border';
  if (countEl) countEl.textContent = target.likes;
  btn.className = btn.className.includes('text-primary')
    ? btn.className.replace('text-primary font-bold','text-slate-400 hover:text-primary')
    : btn.className.replace('text-slate-400 hover:text-primary','text-primary font-bold');
}

function postCommunityComment() {
  var item = state.communityDetail;
  if (!item) return;
  var user = auth && auth.currentUser;
  var textarea = document.getElementById('cd-comment-textarea');
  var text = textarea ? textarea.value.trim() : '';
  if (!text) return;

  var name    = user ? (user.displayName || user.email.split('@')[0]) : 'Anonymous';
  var initial = name.charAt(0).toUpperCase();
  var newComment = {
    id: Date.now(), user: name, role:'', initial: initial, color:'bg-primary',
    time:'just now', text: text, likes:0, liked:false, replies:[]
  };
  state.communityComments[item.id].unshift(newComment);
  textarea.value = '';
  renderCommunityComments(item.id);
}

function postCommunityReply(itemId, ci, inputWrapperId) {
  var wrap  = document.getElementById(inputWrapperId);
  var input = wrap ? wrap.querySelector('input') : null;
  var text  = input ? input.value.trim() : '';
  if (!text) return;
  var user    = auth && auth.currentUser;
  var name    = user ? (user.displayName || user.email.split('@')[0]) : 'Anonymous';
  var initial = name.charAt(0).toUpperCase();
  var reply   = { id: Date.now(), user: name, role:'', initial: initial, color:'bg-primary', time:'just now', text: text, likes:0, liked:false };
  state.communityComments[itemId][ci].replies.push(reply);
  renderCommunityComments(itemId);
}
