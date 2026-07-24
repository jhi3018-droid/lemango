// =============================================
// ===== 사방넷 상품 대량등록 엑셀 내보내기 (상품조회 → 사방넷 대량등록) =====
// 🔴 READ-ONLY: Firestore write 0 · 리스너 0 · 재고/바코드/매출공식/POS 무접촉. 상품 데이터를 118컬럼 .xlsx 로 변환만.
//   헤더/시트명 = js/sabangnet-data.js(골든파일 verbatim). 색상약어/사이즈/혼용률/last4 = window._c24helpers 재사용(카페24와 동일 소스).
//   시즌 설정(경로/고정값) = 다이얼로그(localStorage 기억, 기본값=골든값). 선택 flow = 카페24 CSV 와 동일(#productTable 체크 or 검색결과).
// =============================================
(function () {
  'use strict';

  function DATA() { return (typeof window !== 'undefined' && window.SB_DATA) || null; }
  function H() { return (typeof _c24helpers !== 'undefined' && _c24helpers) || (window._c24helpers) || null; }

  var BASE = 'https://lemango.cafe24.com';
  var LS_KEY = 'lemango_sabang_season_v1';

  // 시즌 설정 기본값(골든파일 값). 경로/검색어/혼용률/사이즈 기본 + 고정 시즌 필드.
  var SEASON_DEFAULTS = {
    season: '26ss', grp: 'women_02', conceptGrp: 'women_01',
    prodYear: '2026', madeDate: '20260401', madeYm: '202604',
    seasonCode: '7', genderCode: '2', shipFee: '3000',
    searchKeyword: '르망고,수영복,실내수영복,원피스수영복',
    defaultSizes: 'XS,S,M,L,XL',
    fabric: '겉감 - 폴리에스터 70%폴리우레탄 30%안감 - 폴리에스터 90%폴리우레탄 10%',
    seasonLabel: '2602시즌'
  };
  function loadSeason() {
    try { var s = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); return Object.assign({}, SEASON_DEFAULTS, s || {}); }
    catch (e) { return Object.assign({}, SEASON_DEFAULTS); }
  }
  function saveSeason(cfg) { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {} }

  // 🔴 고정 상수(골든값) — 코드 1곳. col# = 1-based.
  var FIXED = {
    9: '2',            // 상품구분
    13: '르망고',       // 제조사
    14: '대한민국',     // 원산지(제조국)
    19: '2',           // 상품상태
    20: '1',           // 판매지역
    21: '1',           // 세금구분
    22: '1',           // 배송비구분
    24: '1',           // 반품지구분
    25: '0',           // 원가 (🔴 의도적 0 — costPrice 미사용)
    28: '색상',        // 옵션제목(1)
    80: '001',         // 속성분류코드
    83: '상세페이지 참조', // 속성값3
    84: '르망고',       // 속성값4
    85: '대한민국',     // 속성값5
    86: '상세페이지 참조', // 속성값6
    88: '공정거래위원회 고시 소비자 분쟁 해결 기준에 의거 교환 또는 보상 받을수 있습니다.', // 속성값8
    89: '르망고 / 070-4337-0868', // 속성값9
    90: '해당없음'      // 속성값10
  };

  // 코드 뒤 4자리
  function last4(p) { var h = H(); return (h && h.last4) ? h.last4(p) : String((p && p.productCode) || '').slice(-4); }

  // 색상약어(BL/PK/…) = 카페24 재사용(p.colorCode → colorKr→마스터 code → '' + warn)
  function colorAbbrev(p, warns) { var h = H(); return h ? h.colorAbbrev(p, warns) : String((p && p.colorCode) || '').trim(); }

  // 사이즈 CSV = 바코드 등록 사이즈(카페24 _c24Sizes) · 없으면 다이얼로그 기본값
  function sizesCsv(p, cfg) { var h = H(); var arr = h ? h.sizes(p) : []; return (arr && arr.length) ? arr.join(',') : (cfg.defaultSizes || ''); }

  // 혼용률 = master material(카페24 _c24Material) · 없으면 다이얼로그 기본값
  function fabric(p, cfg) { var h = H(); var m = (h && h.material) ? h.material(p) : ''; return (m && m.trim()) ? m : (cfg.fabric || ''); }

  // 브랜드 라벨 — p.brand(르망고 / 르망고 느와). 없으면 '르망고'.
  function brandLabel(p) { var b = String((p && p.brand) || '').trim(); return b || '르망고'; }

  // SUM 대표이미지 (col32/33/38 동일)
  function sumImage(code, cfg) { return BASE + '/goods/lemango/' + cfg.season + '/' + cfg.grp + '/' + code + '/' + code + '_SUM/1000_1.jpg'; }

  // 🔴 상세설명 HTML (col43) — 골든 시퀀스. \r\n(CRLF) 구분, <center><img src="…"></center> per line.
  //   P = {BASE}/goods/lemango/{season}/{grp}/{code}/{code}_900 · SW = {BASE}/image/product/swimwear · CONCEPT = women_01(고정).
  //   🔴 foil=true(포일 원단): comment.jpg 뒤에 2개 삽입(골든 r7/r10/r11/r12/r16 확인) → 총 28장, 일반=26장.
  function detailHtml(code, cfg, foil) {
    var P = BASE + '/goods/lemango/' + cfg.season + '/' + cfg.grp + '/' + code + '/' + code + '_900';
    var SW = BASE + '/image/product/swimwear';
    var CONCEPT = BASE + '/goods/lemango/' + cfg.season + '/' + cfg.conceptGrp + '/00_concecpt.jpg';   // 🔴 'concecpt' = 실제 파일명(오타 유지) · women_01(개념은 항상 women_01)
    var seq = [
      BASE + '/goods/intro.jpg',
      CONCEPT,
      SW + '/01_made.jpg',
      P + '/01.jpg',
      P + '/comment.jpg'
    ];
    if (foil) { seq.push(P + '/print.gif', SW + '/03_fabric_foil.jpg'); }   // 🔴 포일 원단 삽입(comment 뒤·oekotex 앞)
    seq.push(
      SW + '/04_oekotex_print.gif',
      P + '/02.jpg', P + '/03.jpg', P + '/04.jpg',
      SW + '/05_nipple.jpg',
      P + '/05.jpg', P + '/06.jpg', P + '/07.jpg', P + '/08.jpg',
      SW + '/06_lycra.jpg',
      SW + '/07_onelayer.jpg',
      SW + '/08_eco.jpg',
      SW + '/09_notice.jpg',
      P + '/09.jpg', P + '/10.jpg', P + '/11.jpg',
      SW + '/11_lining.jpg',
      SW + '/12_size.jpg',
      P + '/cut.jpg',
      SW + '/15_washing.jpg',
      SW + '/16_exchange.jpg'
    );
    return seq.map(function (u) { return '<center><img src="' + u + '"></center>'; }).join('\r\n');
  }

  // 🔴 포일 자동 프리필 판별 — master fabricType/fabricDesc/material 중 하나라도 '포일'/'foil'(대소문자 무관) 포함.
  //   ⚠️ 편의 프리필일 뿐, 최종 결정은 다이얼로그 체크리스트(오너가 토글).
  function autoFoil(p) {
    var s = (String((p && p.fabricType) || '') + ' ' + String((p && p.fabricDesc) || '') + ' ' + String((p && p.material) || '')).toLowerCase();
    return /포일|foil/.test(s);
  }

  // 필수 마스터 데이터 결핍 판정(B4) — 반환 부족 필드명 배열.
  function missingFields(p, cfg) {
    var miss = [];
    if (!String((p && p.nameKr) || '').trim()) miss.push('상품명(한글)');
    if (!String((p && p.nameEn) || '').trim()) miss.push('영문명');
    if (!colorAbbrev(p, null)) miss.push('색상약어');
    if (!String((p && p.colorKr) || '').trim()) miss.push('색상(한글)');
    if (!(Number((p && p.salePrice)) > 0)) miss.push('판매가');
    var h = H(); var szArr = h ? h.sizes(p) : [];
    if (!(szArr && szArr.length)) miss.push('사이즈(바코드)');
    return miss;
  }

  // 🔴 한 상품 → 118칸 행 배열(빈칸 유지). warns 는 per-row 부족필드 { code, missing } push. foil = 포일 원단 여부(체크리스트 최종값).
  function buildRow(p, cfg, warns, foil) {
    var d = DATA(); var n = (d && d.HEADERS) ? d.HEADERS.length : 118;
    var row = new Array(n).fill('');
    function set(col, val) { row[col - 1] = (val == null ? '' : String(val)); }

    var code = String((p && p.productCode) || '').trim();
    var l4 = last4(p);
    var abbr = colorAbbrev(p, null);
    var nameKr = String((p && p.nameKr) || '').trim();
    var nameEn = String((p && p.nameEn) || '').trim();
    var colorKr = String((p && p.colorKr) || '').trim();
    var img = sumImage(code, cfg);

    // A. 품번 파생
    set(3, code); set(4, code); set(6, code);
    set(32, img); set(33, img); set(38, img);
    set(43, detailHtml(code, cfg, !!foil));
    set(72, l4);
    // B. 마스터 조인. 🔴 약어 없으면 여분 공백 생략(카페24 동일 — `이름(6721)`). 골든 상품은 전부 약어 보유라 결과 동일.
    set(1, (nameKr + (abbr ? ' ' + abbr : '') + '(' + l4 + ')').trim());   // 상품명 = {nameKr} {약어}({last4})
    set(26, (p && p.salePrice) || 0); set(27, (p && p.salePrice) || 0);
    set(29, colorKr);            // 옵션상세명칭(1) = colorKr
    set(30, abbr);               // 옵션제목(2) = 색상약어
    set(31, sizesCsv(p, cfg));   // 옵션상세명칭(2) = 사이즈 CSV
    set(71, (nameEn + (abbr ? ' ' + abbr : '')).trim());   // 영문 상품명 = {nameEn} {약어}
    set(81, fabric(p, cfg));     // 속성값1 = 혼용률
    set(82, colorKr);            // 속성값2 = colorKr
    set(5, brandLabel(p));       // 브랜드명
    // C. 시즌 다이얼로그
    set(7, cfg.searchKeyword);
    set(15, cfg.prodYear); set(16, cfg.madeDate); set(17, cfg.seasonCode);
    set(18, cfg.genderCode); set(23, cfg.shipFee); set(87, cfg.madeYm);
    // D. 고정 상수
    Object.keys(FIXED).forEach(function (c) { set(+c, FIXED[c]); });

    if (warns) { var miss = missingFields(p, cfg); if (miss.length) warns.push({ code: code, missing: miss }); }
    return row;
  }

  // 선택(카페24 미러) — #productTable 체크 우선, 없으면 검색결과 전체(soft-deleted 제외)
  function selection() {
    var checked = Array.prototype.slice.call(document.querySelectorAll('#productTable .prod-check:checked'))
      .map(function (el) { return el.getAttribute('data-code'); });
    if (checked.length) {
      var byCode = checked.map(function (c) { return (State.allProducts || []).find(function (p) { return p.productCode === c; }); }).filter(Boolean);
      return { mode: '선택 상품', products: byCode };
    }
    var filtered = ((State.product && State.product.filtered) || []).filter(function (p) { return p && !p.deleted; });
    return { mode: '검색결과 전체', products: filtered };
  }

  // 🔴 워크북 생성 aoa. 시트명·헤더 verbatim. foilSet = 포일 품번 Set(체크리스트 최종값).
  function build(products, cfg, foilSet) {
    var d = DATA();
    var aoa = [d.HEADERS.slice()];   // 1행 = 헤더(verbatim)
    var warns = [];
    var fs = foilSet || new Set();
    products.forEach(function (p) { aoa.push(buildRow(p, cfg, warns, fs.has(String((p && p.productCode) || '').trim()))); });
    return { aoa: aoa, warns: warns, count: products.length };
  }

  function ymd() {
    var t = (typeof kstDateKey === 'function' && kstDateKey()) || new Date().toISOString().slice(0, 10);
    return String(t).replace(/-/g, '');
  }

  // ---- 시즌 설정 다이얼로그 ----
  function openSeasonDialog() {
    var sel = selection();
    if (!sel.products.length) { if (typeof showToast === 'function') showToast('내보낼 상품이 없습니다.', 'warning'); return; }
    var cfg = loadSeason();
    var m = document.getElementById('sbSeasonModal'); if (!m) return;
    var body = document.getElementById('sbSeasonBody');
    if (body) body.innerHTML = seasonFormHtml(sel, cfg);
    if (!m.open) m.showModal();
    if (typeof centerModal === 'function') centerModal(m);
  }
  function closeSeasonDialog() { var m = document.getElementById('sbSeasonModal'); if (m && m.open) m.close(); }

  // 선택 상품 캐시(포일 체크리스트 인덱스 참조 — 품번 문자열 인젝션 방지)
  var _sbSelCache = [];

  function seasonFormHtml(sel, cfg) {
    function esc(s) { return (typeof window.esc === 'function') ? window.esc(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function fld(id, label, val, hint) { return '<div class="sb-fld"><label>' + esc(label) + '</label><input type="text" id="' + id + '" value="' + esc(val) + '" autocomplete="off">' + (hint ? '<span class="sb-hint">' + esc(hint) + '</span>' : '') + '</div>'; }
    // 🔴 포일 체크리스트 — 자동 프리필(fabricType/fabricDesc/material '포일'/'foil') · 오너 토글이 최종.
    _sbSelCache = sel.products.slice();
    var autoN = 0;
    var foilRows = _sbSelCache.map(function (p, i) {
      var pre = autoFoil(p); if (pre) autoN++;
      var code = String((p && p.productCode) || '');
      var nm = String((p && p.nameKr) || '');
      return '<label class="sb-foil-item"><input type="checkbox" class="sb-foil-cb" value="' + i + '"' + (pre ? ' checked' : '') + '><code>' + esc(code) + '</code> <span>' + esc(nm) + '</span></label>';
    }).join('');
    var foilSection = '<div class="sb-foil-sec"><div class="sb-foil-head">🧵 포일 원단 상품 <span class="sb-hint">(체크된 상품만 상세설명에 포일 이미지 2장 추가 · 자동 ' + autoN + '건 프리필, 수정 가능)</span></div>' +
      '<div class="sb-foil-list">' + (foilRows || '<div class="sb-hint">상품 없음</div>') + '</div></div>';
    return '<div class="sb-season-head">대상: <b>' + esc(sel.mode) + ' ' + sel.products.length.toLocaleString() + '건</b> · 값은 기억됩니다(다음에 기본값).</div>' + foilSection +
      '<div class="sb-fld-grid">' +
      fld('sbSeason', '시즌 경로 (season)', cfg.season, '예: 26ss') +
      fld('sbGrp', '상품 그룹 (grp)', cfg.grp, '예: women_02') +
      fld('sbConceptGrp', '컨셉 그룹 (conceptGrp)', cfg.conceptGrp, '이미지 경로 — 보통 women_01') +
      fld('sbSeasonLabel', '파일명 시즌 라벨', cfg.seasonLabel, '파일명 접두') +
      fld('sbProdYear', '생산연도 (col15)', cfg.prodYear) +
      fld('sbMadeDate', '제조일 (col16)', cfg.madeDate, 'YYYYMMDD') +
      fld('sbMadeYm', '제조년월 (col87)', cfg.madeYm, 'YYYYMM') +
      fld('sbSeasonCode', '시즌코드 (col17)', cfg.seasonCode) +
      fld('sbGenderCode', '남녀구분 (col18)', cfg.genderCode) +
      fld('sbShipFee', '배송비 (col23)', cfg.shipFee) +
      fld('sbDefaultSizes', '기본 사이즈 CSV', cfg.defaultSizes, '바코드 없을 때 사용') +
      '</div>' +
      '<div class="sb-fld sb-fld-wide"><label>사이트검색어 (col7)</label><input type="text" id="sbSearchKeyword" value="' + esc(cfg.searchKeyword) + '" autocomplete="off"></div>' +
      '<div class="sb-fld sb-fld-wide"><label>혼용률 기본값 (col81 · 마스터 소재 없을 때)</label><input type="text" id="sbFabric" value="' + esc(cfg.fabric) + '" autocomplete="off"></div>' +
      '<div class="sb-season-actions"><button class="btn btn-outline" onclick="closeSbSeasonDialog()">취소</button><button class="btn btn-new" onclick="sbGenerateFromDialog()">엑셀 생성</button></div>';
  }
  function readDialog() {
    function v(id, dflt) { var el = document.getElementById(id); return el ? el.value.trim() : dflt; }
    var base = loadSeason();
    return {
      season: v('sbSeason', base.season), grp: v('sbGrp', base.grp), conceptGrp: v('sbConceptGrp', base.conceptGrp),
      seasonLabel: v('sbSeasonLabel', base.seasonLabel),
      prodYear: v('sbProdYear', base.prodYear), madeDate: v('sbMadeDate', base.madeDate), madeYm: v('sbMadeYm', base.madeYm),
      seasonCode: v('sbSeasonCode', base.seasonCode), genderCode: v('sbGenderCode', base.genderCode), shipFee: v('sbShipFee', base.shipFee),
      defaultSizes: v('sbDefaultSizes', base.defaultSizes), searchKeyword: v('sbSearchKeyword', base.searchKeyword), fabric: v('sbFabric', base.fabric)
    };
  }

  function generateFromDialog() {
    if (!DATA()) { if (typeof showToast === 'function') showToast('사방넷 상수(sabangnet-data.js) 로드 실패 — 새로고침', 'error'); return; }
    if (typeof XLSX === 'undefined') { if (typeof showToast === 'function') showToast('엑셀 모듈(XLSX) 로드 실패', 'error'); return; }
    var sel = selection();
    if (!sel.products.length) { if (typeof showToast === 'function') showToast('내보낼 상품이 없습니다.', 'warning'); return; }
    var cfg = readDialog();
    saveSeason(cfg);
    // 🔴 포일 = 체크리스트 최종값(인덱스 → _sbSelCache 품번). 프리필은 편의일 뿐.
    var foilSet = new Set();
    Array.prototype.slice.call(document.querySelectorAll('#sbSeasonBody .sb-foil-cb:checked')).forEach(function (cb) {
      var p = _sbSelCache[+cb.value]; if (p && p.productCode) foilSet.add(String(p.productCode).trim());
    });
    var built;
    try { built = build(sel.products, cfg, foilSet); }
    catch (e) { console.error('[Sabang] build 실패', e); if (typeof showToast === 'function') showToast('생성 오류: ' + (e && e.message || e), 'error'); return; }
    try {
      var ws = XLSX.utils.aoa_to_sheet(built.aoa);
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, DATA().SHEET_NAME);
      XLSX.writeFile(wb, cfg.seasonLabel + '_사방넷상품등록_' + ymd() + '.xlsx');
    } catch (e) { console.error('[Sabang] write 실패', e); if (typeof showToast === 'function') showToast('엑셀 저장 오류: ' + (e && e.message || e), 'error'); return; }
    if (typeof logActivity === 'function') { try { logActivity('export', '상품조회', '사방넷 등록 엑셀 ' + sel.mode + ' ' + built.count + '건(정보부족 ' + built.warns.length + ')'); } catch (e) {} }
    closeSeasonDialog();
    showWarnings(sel.mode, built.count, built.warns);
  }

  // ---- 정보 부족 경고(B4) — 다운로드는 되지만 부족 상품 목록화 ----
  function showWarnings(mode, count, warns) {
    if (typeof showToast === 'function') showToast('사방넷 엑셀 ' + count + '건 생성' + (warns.length ? ' · 정보부족 ' + warns.length + '건' : ''), warns.length ? 'warning' : 'success');
    if (!warns.length) return;
    var m = document.getElementById('sbWarnModal'); if (!m) return;
    function esc(s) { return (typeof window.esc === 'function') ? window.esc(String(s == null ? '' : s)) : String(s); }
    var byField = {};
    warns.forEach(function (w) { w.missing.forEach(function (f) { (byField[f] = byField[f] || []).push(w.code); }); });
    var html = '<div class="sb-warn-head">⚠️ <b>' + warns.length + '건</b> 정보 부족 — 빈칸으로 포함됨. 상품조회에서 채운 뒤 다시 내보내세요.</div>';
    Object.keys(byField).forEach(function (f) {
      var codes = byField[f];
      html += '<div class="sb-warn-grp"><div class="sb-warn-f">' + esc(f) + ' <b>' + codes.length + '건</b></div><textarea class="sb-warn-ta" readonly rows="2">' + esc(codes.join(', ')) + '</textarea></div>';
    });
    html += '<div class="sb-season-actions"><button class="btn btn-new" onclick="closeSbWarnModal()">확인</button></div>';
    var body = document.getElementById('sbWarnBody'); if (body) body.innerHTML = html;
    if (!m.open) m.showModal();
    if (typeof centerModal === 'function') centerModal(m);
  }
  function closeWarnModal() { var m = document.getElementById('sbWarnModal'); if (m && m.open) m.close(); }

  // ---- 진입점: 버튼 클릭 ----
  function exportSabangnetExcel() { openSeasonDialog(); }

  // ---- window 노출 ----
  window.exportSabangnetExcel = exportSabangnetExcel;
  window.closeSbSeasonDialog = closeSeasonDialog;
  window.sbGenerateFromDialog = generateFromDialog;
  window.closeSbWarnModal = closeWarnModal;
  window._sbhelpers = { buildRow: buildRow, build: build, detailHtml: detailHtml, sumImage: sumImage, colorAbbrev: colorAbbrev, sizesCsv: sizesCsv, fabric: fabric, missingFields: missingFields, autoFoil: autoFoil, SEASON_DEFAULTS: SEASON_DEFAULTS, FIXED: FIXED };
})();
