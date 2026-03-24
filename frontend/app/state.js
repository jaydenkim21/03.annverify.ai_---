// ① Client Layer — 상태 관리 (State Management)

var state = {
  currentPage:      'home',
  lastResult:       null,
  lastInput:        '',
  imageB64:         null,
  imageMime:        null,
  newsData:         [],
  partnerArticles:  [],
  partnerMeta:      [],
  partnerSortType:  'all',
  communityData:    [],
  communityDetail:  null,
  communityComments:{},
  myActivity:       { comments: [], likesGiven: 0, votes: [] },
  history:          JSON.parse(localStorage.getItem('ann_history') || '[]'),
  activePartner:    'all',
  reportFrom:       null,   // 'partner' | 'ainews' | null(user)
  reportCategory:   null,   // partner/ainews 카테고리
};
