// ① Client Layer — 상태 관리 (State Management)

var state = {
  currentPage:      'home',
  lastResult:       null,
  lastInput:        '',
  imageB64:         null,
  imageMime:        null,
  newsData:         [],
  partnerData:      [],
  communityData:    [],
  communityDetail:  null,
  communityComments:{},
  history:          JSON.parse(localStorage.getItem('ann_history') || '[]'),
  activePartner:    'all',
  newsTag:          'Trending',
};
