// =============================================
// ===== 디자인번호(백스타일) 통합 관리 [코드4, 영문명, 한글명] =====
// =============================================
const __designCodes_DEFAULT = [
  ['0001','Backless','백리스'],['0002','Tube','튜브'],['0006','Corset Dress','코르셋 드레스'],
  ['0007','Bikini top','비키니 탑'],['0008','Bikini bottom','비키니 바텀'],
  ['0009','Bikini top OEM','비키니 탑 OEM'],['0010','Bikini bottom OEM','비키니 바텀 OEM'],
  ['0011','Bikini top_Balconette','비키니 탑 발코네트'],['0012','Bikini bottom_high waisted','비키니 바텀 하이웨이스트'],
  ['1000','Open back','오픈 백'],['1004','Open back Band','오픈 백 밴드'],
  ['1005','Kids rashguard top','키즈 래시가드 탑'],['1006','Kids rashguard bottom','키즈 래시가드 바텀'],
  ['1007','Kids rashguard zip-up','키즈 래시가드 집업'],['1008','U back All-In-One','U백 올인원'],
  ['1009','rashguard top','래시가드 탑'],['1010','rashguard bottom','래시가드 바텀'],
  ['1011','rashguard zip-up','래시가드 집업'],['1012','rashguard short zip-up','래시가드 숏 집업'],
  ['1013','rashguard short bottom','래시가드 숏 바텀'],
  ['1589','V-Shoulder Modified','V숄더 변형'],['1593','Tie back Modified','타이백 변형'],
  ['1594','V-Shoulder','V숄더'],['1596','Crossed X Band','크로스드 X 밴드'],
  ['1597','Butterfly back','버터플라이 백'],['1598','Ballet back','발레 백'],
  ['1602','V-Shoulder / V-Shoulder Modified','V숄더 / V숄더 변형'],
  ['1603','Ballet X','발레 X'],['1604','Ballet X modified','발레 X 변형'],
  ['1605','Flying cross','플라잉 크로스'],['1606','Flying cross modified','플라잉 크로스 변형'],
  ['1607','(미정)','미정'],['1608','(미정)','미정'],['1609','(미정)','미정'],['1610','(미정)','미정'],
  ['1612','Crossed X Modified','크로스드 X 변형'],['1613','Open back Band','오픈 백 밴드'],
  ['1614','I-Shaped back / Crossed X Modified','I자 백 / 크로스드 X 변형'],
  ['1615','Double cross','더블 크로스'],['1616','Crossed X Modified','크로스드 X 변형'],
  ['1617','Crossed X Piercing','크로스드 X 피어싱'],['1618','Corset','코르셋'],
  ['1620','Double cross Modified','더블 크로스 변형'],['1621','Crossed X Modified','크로스드 X 변형'],
  ['1624','Water drop','물방울'],['1625','Tie back','타이백'],['1626','Crossed X','크로스드 X'],
  ['1627','Open back','오픈 백'],['1628','V-Shoulder','V숄더'],['1629','Double cross','더블 크로스'],
  ['1630','Nil (Brief)','닐 (브리프)'],['1635','Nil (Brief)','닐 (브리프)'],['1636','Nil (Brief)','닐 (브리프)'],
  ['1679','Open back','오픈 백'],['1800','Crossed X Modified(스트렙탈부착)','크로스드 X 변형 (스트랩탈착)'],
  ['2001','Crop Rashguard','크롭 래시가드'],['2630','Nil (Jammer)','닐 (재머)'],
  ['3900','Sleeveless','민소매'],['4000','Athleisure','애슬레저'],
  ['4100','Athleisure top','애슬레저 탑'],['4110','Short sleeve','반소매'],['4120','Long sleeve','긴소매'],
  ['4300','Athleisure bottom','애슬레저 바텀'],['4310','Short pants','숏 팬츠'],['4320','Long pants','롱 팬츠'],
  ['4500','Athleisure etc','애슬레저 기타'],['5000','Garment','의류'],
  ['5100','Garment top','의류 탑'],['5300','Garment bottom','의류 바텀'],['5500','Garment etc','의류 기타'],
  ['6000','Swimming cap','수영모'],['6001','Kids Fabric Cap','키즈 패브릭 캡'],
  ['6100','General','일반'],['6900','Wrinkle free','구김없는'],
  ['7000','Bag','가방'],['7100','Mesh','메쉬'],['7900','Backpack','백팩'],
  ['8000','Long sleeve','긴소매'],['8002','Short sleeve','반소매'],
  ['8003','Corset M','코르셋 남성'],['8004','Corset F','코르셋 여성'],
  ['8005','Tube F','튜브 여성'],['8006','Ruffle sleeve F','러플 슬리브 여성'],
  ['8007','Side ribbon M','사이드 리본 남성'],['8008','Back ribbon M','백 리본 남성'],
  ['8009','Wrap Dress','랩 드레스'],['8010','Ruffle collar Dress','러플 칼라 드레스'],
  ['8011','Tankini','탱키니'],['8012','One Shoulder','원숄더'],
  ['8013','Balconette Dress','발코네트 드레스'],['8014','Short sleeve Dress','반소매 드레스'],
  ['9000','ETC','기타'],['9001','Mask','마스크'],['9002','Goggle strap','고글 스트랩'],
  ['9003','Goggle case','고글 케이스'],['9004','Goggle','고글'],
  ['9005','Silicone bra','실리콘 브라'],['9006','Shoes','신발'],['9007','Towel','타월']
]
let _designCodes = (() => {
  try {
    const saved = localStorage.getItem('lemango_design_codes_v1')
    return saved ? JSON.parse(saved) : __designCodes_DEFAULT.map(r => [...r])
  } catch { return __designCodes_DEFAULT.map(r => [...r]) }
})()

// =============================================
// ===== 분류코드 관리 [코드2, 이름] (품번 자동생성 1번째 자리) =====
// =============================================
const __classCodes_DEFAULT = [
  ['LS', '르망고 수영복'],
  ['LW', '르망고 의류'],
  ['LG', '르망고 굿즈'],
  ['NS', '느와 수영복'],
  ['NW', '느와 의류'],
  ['NG', '느와 굿즈']
]
let _classCodes = (() => {
  try {
    const saved = localStorage.getItem('lemango_class_codes_v1')
    return saved ? JSON.parse(saved) : __classCodes_DEFAULT.map(r => [...r])
  } catch { return __classCodes_DEFAULT.map(r => [...r]) }
})()
async function saveClassCodes() {
  localStorage.setItem('lemango_class_codes_v1', JSON.stringify(_classCodes))
  if (typeof _fsSync !== 'function') return
  try {
    await _fsSync('classCodes', _classCodes)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['classCodes'] = Date.now()
  } catch (e) {
    if (typeof _onSaveFailed === 'function') _onSaveFailed('saveClassCodes', e)
    else console.error('saveClassCodes failed:', e)
  }
}
window.saveClassCodes = saveClassCodes
async function saveDesignCodes() {
  localStorage.setItem('lemango_design_codes_v1', JSON.stringify(_designCodes))
  if (typeof _fsSync !== 'function') return
  try {
    await _fsSync('designCodes', _designCodes)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['designCodes'] = Date.now()
  } catch (e) {
    if (typeof _onSaveFailed === 'function') _onSaveFailed('saveDesignCodes', e)
    else console.error('saveDesignCodes failed:', e)
  }
}

// 🔴 B1: 구 백스타일 드롭다운 함수군(renderBackStyleList/selectBackStyle/showBsForm/confirmBsForm/deleteBackStyle)은
//   존재하지 않는 pcBackStyle/pcBsSearch/bsDropdown 를 참조하던 dead code 였음(register 폼 백스타일=디자인 코드 picker 로 통합) → 제거.
//   백스타일 picker = 디자인 코드 picker(pcDesign/pcDesignSearch/designDropdown) 단일화. selectDesign 이 백스타일명(rBackStyle) 자동채움.

// ===== 디자인번호(=백스타일) 드롭다운 =====
// 🔴 B1: register 폼 백스타일(=디자인 코드) picker 초기화. 패널 제거 → 기본정보 인라인.
//   🔴 기본 선택 없음(공란) — 백스타일=사용자가 의도적으로 선택(스푸리어스 기본값 방지 · 업로드의 designCode='' 공란과 값 정합 · 디자인 반려 테스트 가능).
//   분류/성별/타입/연도/시즌 select = HTML 정적 옵션(성별=6종 PCODE) + 분류는 populateAllSelects LIVE 오버라이드.
function initRegisterCodePicker() {
  if (!document.getElementById('pcDesign')) return
  document.getElementById('pcDesign').value = ''
  const s = document.getElementById('pcDesignSearch'); if (s) { s.value = ''; s.placeholder = '코드 또는 패턴명 검색 (예: 1626 / Crossed / 크로스)' }
  const bs = document.getElementById('rBackStyle'); if (bs) bs.value = ''
  renderDesignList('')
}
window.initRegisterCodePicker = initRegisterCodePicker

function renderDesignList(query) {
  const q = query.toLowerCase().trim()
  const list = q
    ? _designCodes.filter(([code, en, kr]) =>
        code.includes(q) || en.toLowerCase().includes(q) || kr.toLowerCase().includes(q)
      )
    : _designCodes
  const current = document.getElementById('pcDesign').value
  const dd = document.getElementById('designDropdown')
  if (list.length === 0) {
    dd.innerHTML = '<div class="design-no-result">검색 결과 없음</div>'
    return
  }
  dd.innerHTML = list.map(([code, en, kr]) =>
    `<div class="design-option${code === current ? ' selected' : ''}" onclick="selectDesign('${code}')">
      <span class="design-code">${code}</span>
      <span class="design-names"><span class="design-en">${en}</span><span class="design-kr">${kr}</span></span>
    </div>`
  ).join('')
  const sel = dd.querySelector('.design-option.selected')
  if (sel) sel.scrollIntoView({ block: 'nearest' })
}

function filterDesignList() {
  renderDesignList(document.getElementById('pcDesignSearch').value)
}

function selectDesign(code) {
  const found = _designCodes.find(([c]) => c === code)
  if (!found) return
  document.getElementById('pcDesign').value = code
  document.getElementById('pcDesignSearch').value = ''
  document.getElementById('pcDesignSearch').placeholder = `${code} - ${found[1]} (${found[2]})`
  const bs = document.getElementById('rBackStyle')   // 🔴 B1: 백스타일명(EN) 자동채움(read-only)
  if (bs) bs.value = found[1] || ''
  renderDesignList('')
}

// 적용됐지만 아직 등록 전인 품번 임시 예약 Set
const _reservedCodes = new Set()

// ============================================================
// ===== 🔴 품번 생성 공유 로직 (4 사이트 단일 소스 — §2.8) =====
// ============================================================
// basis = { cls, gen, typ, des, yearDigit, seasonNum }. 6개 전부 필수(반려 게이트).
const PCODE_FIELD_LABELS = [['cls','분류'],['gen','성별'],['typ','타입'],['des','디자인번호'],['yearDigit','연도'],['seasonNum','시즌']]
// 미입력 필드 라벨 배열(반려 메시지용). 빈값=미입력.
function pcodeMissing(b) {
  b = b || {}
  return PCODE_FIELD_LABELS.filter(([k]) => !String(b[k] == null ? '' : b[k]).trim()).map(([, label]) => label)
}
// 🔴 일련번호 basis = 분류+연도+시즌 만(성별/타입/디자인 무시 — 소유주 결정). 13자리 positional parse.
//   used = (분류=code[0:2] · 연도=code[9] · 시즌=code[10]) 일치 code 의 code[11:13]. 비-13자/제외코드 무시.
//   레거시(4자리 sequence 등 다른 규약)는 positional 해석 불가 → 최종 full-code 유일성은 apply 가드가 authoritative.
function nextSerial(basis, opts) {
  const cls = String((basis && basis.cls) || '')
  const yr  = String((basis && basis.yearDigit) || '')
  const sn  = String((basis && basis.seasonNum) || '')
  const excludeCode = (opts && opts.excludeCode) ? String(opts.excludeCode) : ''
  const used = new Set()
  const scan = (c) => {
    c = String(c || '')
    if (!c || c === excludeCode || c.length !== 13) return
    if (c.slice(0, 2) === cls && c[9] === yr && c[10] === sn) used.add(c.slice(11, 13))
  }
  const A = (typeof State !== 'undefined' && State.allProducts) ? State.allProducts : []
  const P = (typeof State !== 'undefined' && State.planItems) ? State.planItems : []
  A.forEach(p => scan(p && p.productCode))
  P.forEach(p => scan(p && p.productCode))
  _reservedCodes.forEach(scan)
  for (let i = 0; i <= 99; i++) { const cand = String(i).padStart(2, '0'); if (!used.has(cand)) return cand }
  return null   // 00~99 소진(overflow) — silent wrap 금지
}
// 공유 프리뷰 렌더러: 반려(미입력) → 소진(overflow) → 유효코드. els={preview,seq,apply,excludeCode}
// 반환: 유효 코드 문자열 or null.
function pcodeRenderPreview(basis, els) {
  els = els || {}
  const setP = (t) => { if (els.preview) els.preview.textContent = t }
  const setS = (t) => { if (els.seq) els.seq.textContent = t }
  const setA = (d) => { if (els.apply) els.apply.disabled = d }
  const missing = pcodeMissing(basis)
  if (missing.length) { setP('품번 생성 반려 — 미입력: ' + missing.join(', ')); setS('-'); setA(true); return null }
  const serial = nextSerial(basis, { excludeCode: els.excludeCode || '' })
  if (serial === null) { setP('이 분류+연도+시즌 그룹의 일련번호(00~99)가 소진되었습니다'); setS('만료'); setA(true); return null }
  const code = basis.cls + basis.gen + basis.typ + basis.des + basis.yearDigit + basis.seasonNum + serial
  setP(code); setS(serial); setA(false)
  return code
}
// apply 가드: 미리보기 텍스트가 유효 13자리 품번인지(반려/소진/안내 문구 차단)
function pcodeIsValidCode(code) { return !!code && /^[A-Za-z0-9]{13}$/.test(String(code).trim()) }
window.pcodeMissing = pcodeMissing; window.nextSerial = nextSerial
window.pcodeRenderPreview = pcodeRenderPreview; window.pcodeIsValidCode = pcodeIsValidCode

// 🔴 B1: 공유 1-버튼 생성 코어. basis(6필드) → 반려 → 소진 → full-code 유일성 가드(authoritative) → target 채움 + 예약.
//   🔴 typeCode → type 절대 미기입(5-2 카테고리 할인 보호). 백스타일명은 selectDesign(picker) 이 이미 채움.
function _genCodeInto(basis, targetId, brandId) {
  const missing = pcodeMissing(basis)
  if (missing.length) { showToast('품번 생성 반려 — 미입력: ' + missing.join(', '), 'warning'); return }
  const targetEl = document.getElementById(targetId)
  const prev = (targetEl && targetEl.value || '').trim()
  if (prev && _reservedCodes.has(prev)) _reservedCodes.delete(prev)   // 재생성 시 이전 예약 해제
  const serial = nextSerial(basis, {})
  if (serial === null) { showToast('이 분류+연도+시즌 그룹의 일련번호(00~99)가 소진되었습니다. 연도/시즌을 확인하세요.', 'error'); return }
  const code = String(basis.cls) + String(basis.gen) + String(basis.typ) + String(basis.des) + String(basis.yearDigit) + String(basis.seasonNum) + serial
  if (!pcodeIsValidCode(code)) { showToast('품번 생성 반려 — 입력값을 확인하세요.', 'warning'); return }
  if (State.allProducts.some(p => p.productCode === code) ||
      State.planItems.some(p => p.productCode === code) ||
      _reservedCodes.has(code)) {
    showToast(`품번 "${code}"은 이미 사용 중입니다. 다시 생성해주세요.`, 'error'); return
  }
  _reservedCodes.add(code)
  if (targetEl) targetEl.value = code
  if (brandId) { const b = document.getElementById(brandId); if (b) b.value = String(basis.cls).startsWith('N') ? '르망고 느와' : '르망고' }
  showToast(`품번 ${code} 생성됨`, 'success')
}
// register 폼: 연도 select value = digit(직접). 백스타일 des = pcDesign(hidden).
function genRegisterCode() {
  _genCodeInto({
    cls:       document.getElementById('rClass')?.value,
    gen:       document.getElementById('rGender')?.value,
    typ:       document.getElementById('rTypeCode')?.value,
    des:       document.getElementById('pcDesign')?.value,
    yearDigit: document.getElementById('rYear')?.value,
    seasonNum: document.getElementById('rSeason')?.value
  }, 'rProductCode', 'rBrand')
}
window._genCodeInto = _genCodeInto
window.genRegisterCode = genRegisterCode
