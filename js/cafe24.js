// =============================================
// ===== 카페24 등록 CSV 내보내기 (상품조회 → Cafe24 대량등록) =====
// 🔴 READ-ONLY: 재고/바코드/매출공식/POS 무접촉. 상품 데이터를 97컬럼 CSV(utf-8-sig)로 변환만.
//   상수(97헤더·결제/배송/반품 HTML·간략설명 스켈레톤·원단정보 박스) = js/cafe24-data.js(샘플서 verbatim 생성).
//   이 파일 = 순수 로직(변환 헬퍼 + 행 빌더 + CSV + 선택 + 경고 UI). 소유주 결정(C1~C7) 반영.
// =============================================
(function () {
  'use strict';

  // ---- 상수 접근 (cafe24-data.js 선로드 전제) ----
  function DATA() { return (typeof window !== 'undefined' && window.C24_DATA) || null; }

  // ---- 코드표 (짧은 상수는 여기 인라인; 큰 HTML blob은 C24_DATA) ----
  var BRAND_CODE = { '르망고': 'B0000000', '르망고 느와': 'B000000D' };
  var ORIGIN = {                       // 제조국 → {원산지 코드, 간략설명 국가 헤더}
    '대한민국': { code: '1798', country: '한국' },
    '한국':     { code: '1798', country: '한국' },
    '중국':     { code: '264',  country: '중국' }
  };
  // 옵션 사이즈 = 바코드 등록된 사이즈 중 F 제외(F=단일사이즈 → 옵션 없음). SIZES 순서 유지, 2XL 포함(C-decision 3).
  var OPTION_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];

  // =============================================
  // Phase 1 — 변환 헬퍼 (순수 함수, per-row 경고는 warns 배열에 push)
  // =============================================

  // 수모 판정 = 품번 typeCode 'SC'(수영모, positional §2.8: [분류2][성별1][타입2]… → slice(3,5)). (C7)
  function _c24IsCap(p) {
    return String((p && p.productCode) || '').slice(3, 5).toUpperCase() === 'SC';
  }

  // 품번 뒤 4자리
  function _c24Last4(p) {
    return String((p && p.productCode) || '').slice(-4);
  }

  // 바코드 등록 여부(store.js _inbHasBarcode 미러 — cross-file 비노출 함수라 로직 복제, EXACT 트림 검사)
  function _c24HasBarcode(p, size) {
    return !!(p && p.barcodes && p.barcodes[size] && String(p.barcodes[size]).trim());
  }
  // 옵션용 사이즈(F 제외, 바코드 등록만)
  function _c24Sizes(p) {
    return OPTION_SIZES.filter(function (sz) { return _c24HasBarcode(p, sz); });
  }

  // 색상 약어 (C6): colorCode → colorKr→마스터 code → '' (+warn '색상 약어 없음')
  function _c24ColorAbbrev(p, warns) {
    var cc = String((p && p.colorCode) || '').trim();
    if (cc) return cc;
    var kr = String((p && p.colorKr) || '').trim();
    if (kr && typeof _colorMasters !== 'undefined' && Array.isArray(_colorMasters)) {
      var m = _colorMasters.find(function (x) { return x && String(x.nameKr).trim() === kr; });
      if (m && m.code) return String(m.code).trim();
    }
    if (warns) warns.push('color');
    return '';
  }

  // 백스타일 한글 (C5): designCode → _designCodes KR; else backStyle EN → EN매칭 → KR; else EN 원문 (+warn)
  function _c24BackStyleKr(p, warns) {
    var dc = String((p && p.designCode) || '').trim();
    var codes = (typeof _designCodes !== 'undefined' && Array.isArray(_designCodes)) ? _designCodes : [];
    if (dc) {
      var byCode = codes.find(function (d) { return d && String(d[0]) === dc; });
      if (byCode && byCode[2]) return String(byCode[2]);
    }
    var bs = String((p && p.backStyle) || '').trim();
    if (!bs) return '';
    var byEn = codes.find(function (d) { return d && d[1] && String(d[1]).toLowerCase() === bs.toLowerCase(); });
    if (byEn && byEn[2]) return String(byEn[2]);
    if (warns) warns.push('backstyle');   // EN 원문 폴백
    return bs;
  }

  // 레그컷 한글: _settings.legCuts 페어맵(code→표시명); 미매핑 → 원문
  function _c24LegCutKr(p) {
    var lc = String((p && p.legCut) || '').trim();
    if (!lc) return '';
    var s = (typeof _settings !== 'undefined' && _settings) ? _settings : {};
    var pairs = Array.isArray(s.legCuts) ? s.legCuts : [];
    var hit = pairs.find(function (x) { return Array.isArray(x) && String(x[0]) === lc; });
    return (hit && hit[1]) ? String(hit[1]) : lc;
  }

  // 제조일자 (C-decision 1): "YYYY년 M월" → YYYYMM01; 이미 YYYYMMDD(8자리) → 그대로; 그 외 → '' (+warn)
  function _c24MadeDate(p, warns) {
    var raw = String((p && p.madeMonth) || '').trim();
    if (!raw) return '';
    if (/^\d{8}$/.test(raw)) return raw;
    var m = raw.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
    if (m) {
      return m[1] + String(m[2]).padStart(2, '0') + '01';
    }
    if (warns) warns.push('madeDate');
    return '';
  }

  // 원산지 정보 {code, country} — 미매핑 → {code:'', country:null} (+warn)
  function _c24OriginInfo(p, warns) {
    var raw = String((p && p.madeIn) || '').trim();
    if (ORIGIN[raw]) return ORIGIN[raw];
    if (warns) warns.push('origin');
    return { code: '', country: null };
  }

  // 상품소재 (C2): our material(대시형 "겉감 - X 70% Y 30% 안감 - …") → 샘플형("겉감:X70%,Y30%\n안감:…"). 파싱실패=best-effort.
  function _c24Material(p) {
    var m = String((p && p.material) || '').trim();
    if (!m) return '';
    m = m.replace(/\s*안감\s*[-:]\s*/g, '\n안감:').replace(/^\s*겉감\s*[-:]\s*/, '겉감:');
    return m.split('\n').map(function (line) {
      return line
        .replace(/\s*(\d+(?:\.\d+)?)\s*%/g, '$1%,')   // " 70%" → "70%,"
        .replace(/%\s*,\s*/g, '%,')                    // "%, "  → "%,"
        .replace(/,{2,}/g, ',')                        // ",," → ","
        .replace(/,\s*$/, '');                         // 후행 콤마 제거
    }).join('\n');
  }

  // 복종(product type) → 정규 키. p.type 우선(one piece/onepiece 변형 정규화), 없으면 품번 typeCode 폴백.
  function _c24TypeKey(p) {
    var t = String((p && p.type) || '').toLowerCase().replace(/[\s._-]+/g, '');
    var known = { onepiece: 'onepiece', bikini: 'bikini', monokini: 'monokini', coverup: 'coverup', rashguard: 'rashguard' };
    if (known[t]) return known[t];
    var code = String((p && p.productCode) || '');
    var tc = /^[A-Za-z0-9]{13}$/.test(code) ? code.slice(3, 5).toUpperCase() : '';
    var byTc = { ON: 'onepiece', MO: 'monokini', BK: 'bikini', RG: 'rashguard' };   // 품번 typeCode 보충
    return byTc[tc] || '';
  }

  // 레그컷 → Cafe24 코드(406 노멀/407 미들/408 하이). EN·EN+개행·한글 모두 정규화. 로우컷/없음 → '' (401에서 멈춤)
  function _c24LegCutCode(p) {
    var n = String((p && p.legCut) || '').toLowerCase().replace(/\s+/g, '');   // "middle\ncut"·"middle cut" → "middlecut"
    if (n === 'normalcut' || n === '노멀컷') return '406';
    if (n === 'middlecut' || n === '미들컷') return '407';
    if (n === 'highcut' || n === '하이컷') return '408';
    return '';
  }

  // 분류번호(5) 코드 배열 산출. 신호=품번 positional(classCode=slice0,2 / gender=slice2,3 / typeCode=slice3,5) + brand + type + legCut.
  //   반환 {codes:[..]} 또는 {codes:null, reason} (미매핑 → 5/6/7 공란 + 경고, 추측 금지). BEST 392·COLLAB 415/424~426 절대 미방출.
  function _c24Category(p, warns) {
    var code = String((p && p.productCode) || '').trim();
    var code13 = /^[A-Za-z0-9]{13}$/.test(code);
    var classCode = code13 ? code.slice(0, 2).toUpperCase() : '';
    var genderCode = code13 ? code.slice(2, 3).toUpperCase()
      : (function () { var g = String((p && p.gender) || '').toUpperCase(); return /^[WMGBNKU]$/.test(g) ? g : ''; })();
    var brand = String((p && p.brand) || '').trim();
    var isNoir = brand === '르망고 느와' || classCode.charAt(0) === 'N';
    var isAcc = classCode.charAt(1) === 'G';   // 굿즈(LG/NG) = ACC
    var base = isAcc ? ['428', '390'] : ['428', '390', '391'];   // 🔴 ACC = NEW(391) 제외
    function fail(reason) { if (warns) warns.push('category'); return { codes: null, reason: reason }; }

    if (isNoir) {   // 느와 → NOIR 브랜치 전용(WOMEN/MEN 미적용)
      if (isAcc) return { codes: base.concat(['393', '395', '439']) };   // 느와 ACC(439). 395 포함=가정(§보고)
      var tkn = _c24TypeKey(p);
      var noirLeaf = { onepiece: '396', bikini: '397', monokini: '398', coverup: '399' }[tkn];
      if (noirLeaf) return { codes: base.concat(['393', '395', noirLeaf]) };
      return fail('느와-복종불명');
    }
    if (isAcc) {   // 비-느와 ACC(굿즈) → 414|리프 (ALL 레벨 없음)
      var tc = code13 ? code.slice(3, 5).toUpperCase() : '';
      var accLeaf = tc === 'SC' ? '420' : tc === 'BG' ? '422' : '423';   // 수모420/백422/기타423 (고글421 신호없음→기타)
      return { codes: base.concat(['414', accLeaf]) };
    }
    if (genderCode === 'W') {   // 여성 → 394|400|리프
      var tkw = _c24TypeKey(p);
      if (tkw === 'onepiece') { var lc = _c24LegCutCode(p); return { codes: base.concat(lc ? ['394', '400', '401', lc] : ['394', '400', '401']) }; }
      var wLeaf = { bikini: ['402', '435'], monokini: ['402', '436'], rashguard: ['403'], coverup: ['404'] }[tkw];
      if (wLeaf) return { codes: base.concat(['394', '400']).concat(wLeaf) };
      return fail('여성-복종불명');
    }
    if (genderCode === 'M') {   // 남성 → 405|409|리프 (브리프만 신호 있음)
      var tcm = code13 ? code.slice(3, 5).toUpperCase() : '';
      if (tcm === 'BR') return { codes: base.concat(['405', '409', '411']) };
      return fail('남성-복종불명(숏브리프410/5in쇼츠412 신호없음)');
    }
    if (genderCode === 'G') return { codes: base.concat(['413', '416', '417']) };   // 키즈 여아
    if (genderCode === 'B') return { codes: base.concat(['413', '416', '418']) };   // 키즈 남아
    if (genderCode === 'K') return { codes: base.concat(['413', '416']) };          // 키즈(세부 성별불명 → ALL까지)
    return fail(genderCode === 'N' || genderCode === 'U' ? '공용(브랜치 없음)' : '성별불명');
  }

  // 간략설명(14) 국가 헤더 HTML — 한국=verbatim, 중국=best-effort(전공정 라인 제외, work order), 그외=null(comment-text 생략)
  function _c24HeaderHtml(country) {
    var d = DATA(); if (!d) return null;
    var HK = d.BRIEF.HEADER_KR;
    if (country === '한국') return HK;
    if (country === '중국') {
      var ind = (HK.match(/^\s*/) || [''])[0];
      var tail = (HK.match(/\s*$/) || [''])[0];
      return ind + '<span>⭐</span> 중국 생산' + tail;
    }
    return null;
  }

  // 간략설명(14) 전체 HTML 조립 (수모=comment-text 헤더 생략)
  function _c24Brief(p, isCap, country, warns) {
    var d = DATA(); if (!d) return '';
    var B = d.BRIEF;
    var comment = String((p && p.comment) || '').trim();
    if (!comment) { if (warns) warns.push('comment'); }
    var commentHtml = comment.replace(/\r\n?|\n/g, '<br>');   // 줄바꿈 → <br>(HTML li 내부)
    var headHtml = isCap ? null : _c24HeaderHtml(country);
    var out = B.HEAD;
    if (headHtml != null) out += B.CT_OPEN + headHtml + B.CT_CLOSE;
    out += B.LIST_OPEN + commentHtml + B.LIST_END;
    return out;
  }

  // =============================================
  // Phase 2 — 행 빌더 (97셀) + CSV
  // =============================================
  function buildCafe24Row(p) {
    var warns = [];
    var d = DATA();
    var code = String((p && p.productCode) || '').trim();
    var isCap = _c24IsCap(p);
    var last4 = _c24Last4(p);
    var nameKr = String((p && p.nameKr) || '').trim();
    var nameEn = String((p && p.nameEn) || '').trim();
    var price = String(parseInt((p && p.salePrice), 10) || 0);
    var abbrev = _c24ColorAbbrev(p, warns);
    var cat = _c24Category(p, warns);        // 분류번호(5/6/7)
    var catCodes = cat.codes;

    // 상품명(8)/영문명(9): 이름 + (약어) + (뒤4)
    var name8 = nameKr + (abbrev ? (' ' + abbrev) : '') + '(' + last4 + ')';
    var name9 = nameEn ? (nameEn + (abbrev ? (' ' + abbrev) : '') + '(' + last4 + ')') : '';
    if (!nameEn) warns.push('nameEn');

    // 요약설명(13): 수모=blank; else 백스타일KR/레그컷KR(빈쪽 드롭, 슬래시 없음)
    var summary13 = '';
    if (!isCap) {
      var bsk = _c24BackStyleKr(p, warns);
      var lck = _c24LegCutKr(p);
      summary13 = [bsk, lck].filter(function (x) { return x; }).join('/');
    }

    // 원산지/국가
    var oi = _c24OriginInfo(p, warns);

    // 간략설명(14)
    var brief14 = _c24Brief(p, isCap, oi.country, warns);

    // 상세설명(15): CAFE24 상세 URL → convertUrlsToHtml
    var detailUrls = String((p && p.cafe24DetailUrl) || '').trim();
    var detail15 = detailUrls ? (typeof convertUrlsToHtml === 'function' ? convertUrlsToHtml(detailUrls) : '') : '';
    if (!detail15) warns.push('detailUrl');

    // 검색어(18): 수모="수모,<뒤4>"(C2); else "브랜드,한글명,색상명(한글)"(C1, 빈 색상 드롭)
    var search18;
    if (isCap) {
      search18 = '수모,' + last4;
    } else {
      var brand = String((p && p.brand) || '').trim();
      var colorKr = String((p && p.colorKr) || '').trim();
      var parts = [];
      if (brand) parts.push(brand);
      if (nameKr) parts.push(nameKr);
      if (colorKr) parts.push(colorKr);
      search18 = parts.join(',');
    }

    // 옵션(33/37): 수모 또는 사이즈옵션 없음 → 옵션사용 N + 빈 옵션 (C-decision 5)
    var sizes = isCap ? [] : _c24Sizes(p);
    var optUse = sizes.length ? 'Y' : 'N';
    var optInput = sizes.length ? ('Size{' + sizes.join('|') + '}') : '';

    // 이미지(47~50): cafe24Main[0]. 목록/작은목록/축소 3개 동일; 상세(47)=수모 blank·else 동일
    var img = (typeof _firstImageUrl === 'function') ? (_firstImageUrl(p && p.cafe24Main) || '') : '';
    if (!img) warns.push('mainImage');
    var img47 = isCap ? '' : img;

    // 제조일자(57) / 브랜드(54) / 소재(79)
    var madeDate = _c24MadeDate(p, warns);
    var brandCode = BRAND_CODE[String((p && p.brand) || '').trim()] || 'B0000000';
    var material79 = _c24Material(p);

    // ---- 97셀 (index i → 컬럼 i+1). 상수는 인라인, 나머지 blank. ----
    var C = new Array(97).fill('');
    C[0]  = '';            // 1 상품코드
    C[1]  = code;          // 2 자체 상품코드
    C[2]  = 'N';           // 3 진열상태
    C[3]  = 'N';           // 4 판매상태
    C[4]  = catCodes ? catCodes.join('|') : '';                                    // 5 상품분류 번호(auto)
    C[5]  = catCodes ? catCodes.map(function () { return 'N'; }).join('|') : '';    // 6 신상품영역(코드당 N)
    C[6]  = C[5];                                                                   // 7 추천상품영역(=6)
    C[7]  = name8;         // 8 상품명
    C[8]  = name9;         // 9 영문 상품명
    C[9]  = isCap ? '' : name8;  // 10 상품명(관리용)
    C[10] = isCap ? '' : name8;  // 11 공급사 상품명
    C[11] = code;          // 12 모델명
    C[12] = summary13;     // 13 상품 요약설명
    C[13] = brief14;       // 14 상품 간략설명
    C[14] = detail15;      // 15 상품 상세설명
    C[15] = 'A';           // 16 모바일 상세설명 설정
    // 17 모바일 상세설명 = ''
    C[17] = search18;      // 18 검색어설정
    C[18] = 'A|10';        // 19 과세구분
    C[19] = price;         // 20 소비자가
    C[20] = '0';           // 21 공급가
    C[21] = price;         // 22 상품가
    C[22] = price;         // 23 판매가
    C[23] = 'N';           // 24 판매가 대체문구 사용
    // 25 판매가 대체문구 = ''
    C[25] = 'O';           // 26 주문수량 제한 기준
    C[26] = '1';           // 27 최소 주문수량
    C[27] = '999';         // 28 최대 주문수량
    C[28] = '1';           // 29 적립금
    C[29] = 'P';           // 30 적립금 구분
    C[30] = 'N';           // 31 공통이벤트 정보
    C[31] = 'N';           // 32 성인인증
    C[32] = optUse;        // 33 옵션사용
    C[33] = 'T';           // 34 품목 구성방식
    C[34] = 'C';           // 35 옵션 표시방식
    // 36 옵션세트명 = ''
    C[36] = optInput;      // 37 옵션입력
    // 38~40 = ''
    C[40] = 'F';           // 41 필수여부
    C[41] = 'Soldout';     // 42 품절표시 문구
    C[42] = 'F';           // 43 추가입력옵션
    // 44~46 = ''
    C[46] = img47;         // 47 이미지등록(상세)
    C[47] = img;           // 48 이미지등록(목록)
    C[48] = img;           // 49 이미지등록(작은목록)
    C[49] = img;           // 50 이미지등록(축소)
    // 51 이미지등록(추가) = ''
    C[51] = 'M0000000';    // 52 제조사
    C[52] = 'S0000000';    // 53 공급사
    C[53] = brandCode;     // 54 브랜드
    C[54] = 'T0000000';    // 55 트렌드
    C[55] = 'C000000A';    // 56 자체분류 코드
    C[56] = madeDate;      // 57 제조일자
    C[57] = 'F';           // 58 출시일자
    C[58] = 'F';           // 59 유효기간 사용여부
    // 60 유효기간 = ''
    C[60] = oi.code;       // 61 원산지
    // 62 상품부피 = ''
    C[62] = d ? d.PAY : '';       // 63 상품결제안내
    C[63] = d ? d.SHIP : '';      // 64 상품배송안내
    C[64] = d ? d.RETURN : '';    // 65 교환/반품안내
    C[65] = d ? (isCap ? d.FABRIC_CAP : d.FABRIC_ADULT) : '';  // 66 서비스문의/안내 (C4: 수모 분기)
    C[66] = 'F';           // 67 배송정보
    // 68~71 = ''
    C[71] = '3|7';         // 72 배송기간
    // 73~74 = ''
    C[74] = 'N';           // 75 스토어픽업 설정
    C[75] = '0';           // 76 상품 전체중량
    // 77~78 = ''
    C[78] = material79;    // 79 상품소재
    // 80 영문 상품소재 = '' (EN 소재 필드 없음)
    // 81 옷감 = ''
    C[81] = 'Y';           // 82 SEO 노출 설정
    // 83~90 = ''
    // 91~94 = ''
    C[94] = nameKr;        // 95 추가항목08_한글상품명
    C[95] = '1';           // 96 추가항목09_오늘배송출발 사용여부
    C[96] = '14';          // 97 추가항목10_오늘배송출발 시간설정

    return { cells: C, warns: warns, catReason: cat.reason || '' };
  }

  // ---- CSV 셀 인용 (RFC4180: 콤마·따옴표·개행 → "…" + "" 이스케이프) ----
  function _c24Cell(v) {
    v = (v == null) ? '' : String(v);
    if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  // ---- 전체 CSV 빌드 (BOM + \r\n) + per-row 경고 수집 ----
  function buildCafe24Csv(products) {
    var d = DATA();
    var rows = [d ? d.HEADER : []];
    var warnRows = [];
    products.forEach(function (p) {
      var r = buildCafe24Row(p);
      rows.push(r.cells);
      if (r.warns.length) warnRows.push({ code: p.productCode || '(무품번)', warns: r.warns, catReason: r.catReason || '' });
    });
    var csv = rows.map(function (r) { return r.map(_c24Cell).join(','); }).join('\r\n');
    return { csv: '﻿' + csv, warnRows: warnRows, count: products.length };
  }

  // =============================================
  // Phase 3 — 선택 모델(hybrid) + 버튼 + 경고 요약
  // =============================================
  // 선택(C6): 체크 있으면 체크만, 없으면 검색결과 전체(State.product.filtered, soft-deleted 제외)
  function _c24Selection() {
    var checked = Array.prototype.slice.call(document.querySelectorAll('#productTable .prod-check:checked'))
      .map(function (el) { return el.getAttribute('data-code'); });
    if (checked.length) {
      var byCode = checked.map(function (c) {
        return (State.allProducts || []).find(function (p) { return p.productCode === c; });
      }).filter(Boolean);
      return { mode: '선택 상품', products: byCode };
    }
    var filtered = ((State.product && State.product.filtered) || []).filter(function (p) { return p && !p.deleted; });
    return { mode: '검색결과 전체', products: filtered };
  }

  var WARN_LABEL = {
    category: '분류 미매핑(성별/복종 신호 부족 → 5/6/7 공란)',
    color: '색상 약어 없음(상품명 약어 생략)',
    origin: '원산지 미매핑(제조국 확인 필요)',
    backstyle: '백스타일 영문 폴백(요약설명 확인)',
    detailUrl: '상세 URL 없음(상세설명 비어있음)',
    mainImage: '대표이미지 없음(이미지 비어있음)',
    nameEn: '영문명 없음(영문 상품명 비어있음)',
    madeDate: '제조일자 파싱 실패',
    comment: '디자이너 코멘트 없음(간략설명 비어있음)'
  };
  var WARN_ORDER = ['category', 'color', 'origin', 'backstyle', 'detailUrl', 'mainImage', 'nameEn', 'madeDate', 'comment'];

  // 경고 요약 모달 (동적 <dialog>, 자체 close·복사 textarea)
  function _c24ShowWarnings(mode, count, warnRows) {
    var agg = {};
    WARN_ORDER.forEach(function (k) { agg[k] = []; });
    warnRows.forEach(function (w) {
      var seen = {};
      w.warns.forEach(function (k) {
        if (seen[k]) return; seen[k] = 1;
        if (!agg[k]) return;
        if (k === 'category' && w.catReason) agg[k].push(w.code + '(' + w.catReason + ')');
        else agg[k].push(w.code);
      });
    });
    var lines = [];
    var copyBlocks = [];
    WARN_ORDER.forEach(function (k) {
      var codes = agg[k];
      if (!codes.length) return;
      lines.push('<div class="c24-warn-row"><span class="c24-warn-cat">⚠️ ' + WARN_LABEL[k] +
        '</span><span class="c24-warn-cnt">' + codes.length + '건</span></div>');
      copyBlocks.push('[' + WARN_LABEL[k] + '] (' + codes.length + ')\n' + codes.join(', '));
    });
    var okRows = count - warnRows.length;
    var head = '카페24 등록 CSV 생성 완료 — ' + mode + ' <b>' + count + '</b>건 (경고 ' + warnRows.length + '건 · 정상 ' + okRows + '건)';
    var body = lines.length
      ? ('<div class="c24-warn-list">' + lines.join('') + '</div>' +
         '<div class="c24-warn-note">⚠️ 경고 항목은 값이 비어/불완전한 채로 내보내졌습니다. 카페24 업로드 전에 아래 품번을 보정하거나, 시스템에서 채운 뒤 재내보내기 하세요. (CSV는 이미 다운로드됨)</div>' +
         '<textarea class="c24-warn-copy" readonly>' + copyBlocks.join('\n\n').replace(/</g, '&lt;') + '</textarea>')
      : '<div class="c24-warn-note">✅ 모든 항목 정상 — 누락/폴백 경고 없음.</div>';

    var dlg = document.createElement('dialog');
    dlg.className = 'c24-warn-dialog';
    dlg.innerHTML = '<div class="c24-warn-box">' +
      '<div class="c24-warn-title">' + head + '</div>' +
      body +
      '<div class="c24-warn-btns">' +
      (copyBlocks.length ? '<button type="button" class="btn btn-outline c24-warn-copybtn">품번 목록 복사</button>' : '') +
      '<button type="button" class="btn btn-accent c24-warn-close">닫기</button>' +
      '</div></div>';
    function done() { try { dlg.close(); } catch (e) {} dlg.remove(); }
    dlg.querySelector('.c24-warn-close').addEventListener('click', done, { once: true });
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); done(); }, { once: true });
    var cbtn = dlg.querySelector('.c24-warn-copybtn');
    if (cbtn) cbtn.addEventListener('click', function () {
      var ta = dlg.querySelector('.c24-warn-copy');
      if (ta) { ta.select(); try { navigator.clipboard.writeText(ta.value); } catch (e) {} showToast('품번 목록 복사됨'); }
    });
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector('.c24-warn-close').focus();
  }

  // KST YYYYMMDD (파일명). 매출/재고와 무관한 표시용 → 로컬 날짜 허용(파일명 접미사).
  function _c24TodayStamp() {
    if (typeof kstStamp === 'function') { return kstStamp().slice(0, 8); }   // KST 유틸 있으면 사용
    var d = new Date();
    return String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  // 진입점 (버튼 onclick)
  function exportCafe24Csv() {
    if (!DATA()) { showToast('카페24 상수 파일(cafe24-data.js) 로드 실패 — 새로고침 후 재시도', 'error'); return; }
    var sel = _c24Selection();
    if (!sel.products.length) { showToast('내보낼 상품이 없습니다.', 'warning'); return; }
    korConfirm('카페24 등록 CSV\n\n' + sel.mode + ' ' + sel.products.length + '건을 CSV로 내보냅니다.\n(체크된 상품이 있으면 체크만, 없으면 검색결과 전체)', '내보내기', '취소')
      .then(function (ok) {
        if (!ok) return;
        var built;
        try {
          built = buildCafe24Csv(sel.products);
        } catch (e) {
          console.error('[Cafe24] CSV 빌드 실패', e);
          showToast('CSV 생성 오류: ' + (e && e.message || e), 'error');
          return;
        }
        try {
          var blob = new Blob([built.csv], { type: 'text/csv;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'cafe24_등록_' + _c24TodayStamp() + '.csv';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        } catch (e) {
          console.error('[Cafe24] 다운로드 실패', e);
          showToast('다운로드 오류: ' + (e && e.message || e), 'error');
          return;
        }
        if (typeof logActivity === 'function') {
          logActivity('export', '상품조회', '카페24 등록 CSV ' + sel.mode + ' ' + built.count + '건(경고 ' + built.warnRows.length + ')');
        }
        _c24ShowWarnings(sel.mode, built.count, built.warnRows);
      });
  }

  // ---- window 노출 (버튼·검증·재사용) ----
  window.buildCafe24Row = buildCafe24Row;
  window.buildCafe24Csv = buildCafe24Csv;
  window.exportCafe24Csv = exportCafe24Csv;
  // 순수 헬퍼(검증/시뮬 용)
  window._c24helpers = {
    isCap: _c24IsCap, last4: _c24Last4, sizes: _c24Sizes,
    colorAbbrev: _c24ColorAbbrev, backStyleKr: _c24BackStyleKr, legCutKr: _c24LegCutKr,
    madeDate: _c24MadeDate, originInfo: _c24OriginInfo, material: _c24Material,
    brief: _c24Brief, cell: _c24Cell,
    category: _c24Category, typeKey: _c24TypeKey, legCutCode: _c24LegCutCode
  };
})();
