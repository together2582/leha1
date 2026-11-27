// ===== 중단시간 분석 핵심 규칙 (기획서 6.2 ~ 7) =====
// 화면과 분리해 두어 node에서도 검산할 수 있게 함.

var EQUIP = {
  '대형': ['UHT', '포장로봇', '충진기', '상승컨베어', '로봇파렛타이저', '컨베어라인', '박싱/제함기', '냉각터널', '날인기(압인)'],
  '소형': ['카토너/케이서', '충진기', '컨베어', '로봇파렛타이저', '냉각터널', 'UHT', '스파이럴', '날인기/중량선별기', '핫멜트']
};
var ETC = '설비 외';
var ETC_WORDS = ['보일러', 'RO수', '아로수', '원수', '위생교육', '안전교육', '안전사고', '정전', '품목교체', '외포장 정리', '인원부족', '라인정리', 'Brix', '부자재'];

// 처음 단어표 (기획서 6.5 초안, 담당자 확인 후 확정)
var DEFAULT_WORDS = {
  '대형': {
    'UHT': ['UHT', '살균온도 저하', 'CIP'],
    '포장로봇': ['포장로봇', '담기로봇', '담기자동화', '자동화담기'],
    '충진기': ['충진'],
    '상승컨베어': ['상승컨베어', '경사 컨베어'],
    '로봇파렛타이저': ['파렛타이저', '파렛타이져'],
    '컨베어라인': ['배출컨베어', '컨베어라인'],
    '박싱/제함기': ['제함기', '박싱', '외포장 비상정지'],
    '냉각터널': ['냉각터널', '냉각조'],
    '날인기(압인)': ['날인기', '압인']
  },
  '소형': {
    '카토너/케이서': ['카토너', '케이서'],
    '충진기': ['충진'],
    '컨베어': ['컨베어', '컨베이어'],
    '로봇파렛타이저': ['파렛타이저', '파렛타이져'],
    '냉각터널': ['냉각터널', '냉각조'],
    'UHT': ['UHT', '살균온도 저하'],
    '스파이럴': ['스파이럴'],
    '날인기/중량선별기': ['날인기', '중량선별기'],
    '핫멜트': ['핫멜트']
  }
};
DEFAULT_WORDS['대형'][ETC] = ETC_WORDS.slice();
DEFAULT_WORDS['소형'][ETC] = ETC_WORDS.slice();

// 띄어쓰기와 영문 대소문자 차이 무시
function norm(s) { return String(s).replace(/\s+/g, '').toLowerCase(); }

// 전각 괄호·쉼표를 보통 문자로
function clean(s) {
  return String(s).replace(/（/g, '(').replace(/）/g, ')').replace(/，/g, ',');
}

// 한 칸 읽기. 결과: {ok:true, items:[{reason, min}]} 또는 {ok:false, why}
// 칸 안 조각 중 하나라도 잘못되면 칸 전체를 확인 목록으로 보냄 (사유 안 쉼표 규칙)
function parseCell(text) {
  var t = clean(text).trim();
  if (!t) return { ok: true, items: [] };
  var parts = t.split(/[,\n\r]+/);
  var items = [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (!p) continue;
    var m = p.match(/^(.*)\(\s*(\d+(?:\.\d+)?)\s*\)$/);
    if (!m) {
      var why = /\(/.test(p) ? '마지막 괄호 안이 숫자가 아님' :
                /\d/.test(p) ? '괄호 없음' : '시간 없음';
      return { ok: false, why: why + ' (' + p + ')' };
    }
    var reason = m[1].trim();
    if (!reason) return { ok: false, why: '사유 없음 (' + p + ')' };
    items.push({ reason: reason, min: parseFloat(m[2]) });
  }
  return { ok: true, items: items };
}

// 분류. 결과: 분류 이름 또는 null(되묻기 필요)
function classify(reason, size, words, answers) {
  var n = norm(reason);
  if (n.indexOf(norm('살균온도 저하')) >= 0) return 'UHT';
  var key = size + '|' + n;
  if (answers && answers[key]) return answers[key];
  var table = words[size];
  var hits = [];
  for (var cat in table) {
    var ws = table[cat];
    for (var j = 0; j < ws.length; j++) {
      if (ws[j] && n.indexOf(norm(ws[j])) >= 0) { hits.push(cat); break; }
    }
  }
  return hits.length === 1 ? hits[0] : null;
}
function answerKey(reason, size) { return size + '|' + norm(reason); }

// 계산. entries: [{year:'올해'|'전년', size, reason, min, cat}]
// 결과: {rows:[{name, cur, curPct, prev, prevPct, diff, rate, top}], ...}
function compute(entries, size) {
  var list = EQUIP[size];
  var cur = {}, prev = {}, reasons = {};
  var names = list.concat([ETC]);
  names.forEach(function (n) { cur[n] = 0; prev[n] = 0; reasons[n] = {}; });
  entries.forEach(function (e) {
    if (e.size !== size) return;
    var c = (e.cat === ETC || list.indexOf(e.cat) >= 0) ? e.cat : null;
    if (!c) return;
    if (e.year === '올해') {
      cur[c] += e.min;
      var k = norm(e.reason);
      if (!reasons[c][k]) reasons[c][k] = { text: e.reason, min: 0, order: Object.keys(reasons[c]).length };
      reasons[c][k].min += e.min;
    } else prev[c] += e.min;
  });
  var totalCur = 0, totalPrev = 0;
  names.forEach(function (n) { totalCur += cur[n]; totalPrev += prev[n]; });

  function row(n, c, p, top) {
    return {
      name: n, cur: c, curPct: totalCur ? c / totalCur : 0,
      prev: p, prevPct: totalPrev ? p / totalPrev : 0,
      diff: c - p, rate: p ? (c - p) / p : null, top: top
    };
  }
  function topOf(n) {
    var arr = Object.keys(reasons[n]).map(function (k) { return reasons[n][k]; });
    arr.sort(function (a, b) { return b.min - a.min || a.order - b.order; });
    return arr.slice(0, 3).map(function (r) { return r.text; }).join(', ');
  }
  // 한쪽에라도 기록이 있는 설비만 (두 해 모두 없으면 생략)
  var eq = list.filter(function (n) { return cur[n] || prev[n]; });
  eq.sort(function (a, b) { return cur[b] - cur[a] || list.indexOf(a) - list.indexOf(b); });
  var rows = eq.map(function (n) { return row(n, cur[n], prev[n], topOf(n)); });
  rows.push(row(ETC, cur[ETC], prev[ETC], topOf(ETC)));
  rows.push(row('합계', totalCur, totalPrev, ''));
  return rows;
}

// 시트에서 '중단사유' 제목 칸들을 찾아 그 아래 칸들을 모음
// grid: 2차원 배열(행, 열). 결과: [{row(1부터), text}] 또는 null(제목 없음)
function readSheet(grid) {
  var heads = [];
  for (var r = 0; r < grid.length; r++) {
    var line = grid[r] || [];
    for (var c = 0; c < line.length; c++) {
      if (line[c] != null && norm(line[c]) === '중단사유') heads.push({ r: r, c: c });
    }
  }
  if (!heads.length) return null;
  return readBelow(grid, heads);
}
function readBelow(grid, heads) {
  var out = [];
  heads.forEach(function (h) {
    for (var r = h.r + 1; r < grid.length; r++) {
      var v = (grid[r] || [])[h.c];
      if (v != null && norm(v) === '중단사유') break; // 같은 열의 다음 제목에서 멈춤
      if (v == null || String(v).trim() === '') continue; // 빈 칸 건너뜀
      out.push({ row: r + 1, text: String(v) });
    }
  });
  return out;
}

var L = {
  EQUIP: EQUIP, ETC: ETC, DEFAULT_WORDS: DEFAULT_WORDS, norm: norm,
  parseCell: parseCell, classify: classify, answerKey: answerKey, compute: compute,
  readSheet: readSheet, readBelow: readBelow
};
if (typeof module !== 'undefined') module.exports = L;
