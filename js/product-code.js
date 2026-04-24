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
async function saveDesignCodes() {
  localStorage.setItem('lemango_design_codes_v1', JSON.stringify(_designCodes))
  if (typeof _fsSync !== 'function') return
  try {
    await _fsSync('designCodes', _designCodes)
  } catch (e) {
    if (typeof _onSaveFailed === 'function') _onSaveFailed('saveDesignCodes', e)
    else console.error('saveDesignCodes failed:', e)
  }
}

// ===== 백스타일 드롭다운 (디자인번호와 동일 데이터 사용) =====
function renderBackStyleList(query) {
  const q = query.toLowerCase().trim()
  const list = q
    ? _designCodes.filter(([code, en, kr]) =>
        code.includes(q) || en.toLowerCase().includes(q) || kr.toLowerCase().includes(q))
    : _designCodes
  const current = document.getElementById('pcBackStyle')?.value
  const dd = document.getElementById('bsDropdown')
  if (!dd) return
  if (list.length === 0) { dd.innerHTML = '<div class="design-no-result">검색 결과 없음</div>'; return }
  dd.innerHTML = list.map(([code, en, kr]) =>
    `<div class="design-option${code === current ? ' selected' : ''}" onclick="selectBackStyle('${code}')">
      <span class="design-code">${code}</span>
      <span class="design-names"><span class="design-en">${en}</span><span class="design-kr">${kr}</span></span>
    </div>`
  ).join('')
  const sel = dd.querySelector('.design-option.selected')
  if (sel) sel.scrollIntoView({ block: 'nearest' })
}

function filterBackStyleList() {
  renderBackStyleList(document.getElementById('pcBsSearch')?.value || '')
}

function selectBackStyle(code) {
  const found = _designCodes.find(([c]) => c === code)
  if (!found) return
  document.getElementById('pcBackStyle').value = code
  document.getElementById('pcBsSearch').value = ''
  document.getElementById('pcBsSearch').placeholder = `${code} - ${found[1]} (${found[2]})`
  renderBackStyleList('')
}

let _bsFormMode = 'add'
function showBsForm(mode) {
  _bsFormMode = mode
  const form = document.getElementById('bsForm')
  document.getElementById('bsFormCode').value = ''
  document.getElementById('bsFormEn').value   = ''
  document.getElementById('bsFormKr').value   = ''
  if (mode === 'edit') {
    const cur = document.getElementById('pcBackStyle')?.value
    if (!cur) { showToast('수정할 디자인번호를 선택하세요.', 'warning'); return }
    const found = _designCodes.find(([c]) => c === cur)
    if (found) {
      document.getElementById('bsFormCode').value = found[0]
      document.getElementById('bsFormEn').value   = found[1]
      document.getElementById('bsFormKr').value   = found[2]
    }
  }
  form.style.display = 'flex'
  document.getElementById('bsFormCode').focus()
}

function confirmBsForm() {
  const code = document.getElementById('bsFormCode').value.trim()
  const en   = document.getElementById('bsFormEn').value.trim()
  const kr   = document.getElementById('bsFormKr').value.trim()
  if (!code || !en || !kr) { showToast('코드, 영문명, 한글명을 모두 입력하세요.', 'warning'); return }
  if (!/^\d{4}$/.test(code)) { showToast('코드는 4자리 숫자여야 합니다.', 'warning'); return }

  if (_bsFormMode === 'add') {
    if (_designCodes.some(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'warning'); return }
    _designCodes.push([code, en, kr])
    saveDesignCodes()
    renderBackStyleList('')
    selectBackStyle(code)
  } else {
    const cur = document.getElementById('pcBackStyle').value
    const idx = _designCodes.findIndex(([c]) => c === cur)
    if (idx === -1) return
    if (code !== cur && _designCodes.some(([c]) => c === code)) { showToast('이미 존재하는 코드입니다.', 'warning'); return }
    _designCodes[idx] = [code, en, kr]
    saveDesignCodes()
    renderBackStyleList('')
    selectBackStyle(code)
  }
  document.getElementById('bsForm').style.display = 'none'
}

async function deleteBackStyle() {
  const cur = document.getElementById('pcBackStyle')?.value
  if (!cur) { showToast('삭제할 디자인번호를 선택하세요.', 'warning'); return }
  const found = _designCodes.find(([c]) => c === cur)
  if (!found) return
  if (!await korConfirm(`"${found[1]} (${found[2]})" 디자인번호를 삭제하시겠습니까?`)) return
  _designCodes = _designCodes.filter(([c]) => c !== cur)
  saveDesignCodes()
  document.getElementById('pcBackStyle').value = ''
  document.getElementById('pcBsSearch').placeholder = '코드 또는 스타일명 검색'
  document.getElementById('pcBsSearch').value = ''
  renderBackStyleList('')
}

// ===== 디자인번호 드롭다운 =====
function initPcodePanel() {
  if (!document.getElementById('pcDesign')) return
  renderDesignList('')
  selectDesign('1626')
  renderBackStyleList('')
  document.getElementById('pcPreview').textContent = '-'
  document.getElementById('pcSeqDisplay').textContent = '-'
  const applyBtn = document.getElementById('pcApplyBtn')
  if (applyBtn) applyBtn.disabled = true
}

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
  renderDesignList('')
}

function togglePcodePanel() {
  const panel = document.getElementById('pcodePanel')
  const btn = document.getElementById('pcodeToggleBtn')
  const open = panel.style.display === 'none' || panel.style.display === ''
  panel.style.display = open ? 'flex' : 'none'
  btn.textContent = open ? '자동생성 ▴' : '자동생성 ▾'
}

// 적용됐지만 아직 등록 전인 품번 임시 예약 Set
const _reservedCodes = new Set()

function updateProductCode() {
  const cls = document.getElementById('pcClass')?.value
  const gen = document.getElementById('pcGender')?.value
  const typ = document.getElementById('pcType')?.value
  const des = document.getElementById('pcDesign')?.value
  const year = document.getElementById('pcYear')?.value
  const seasonNum = document.getElementById('pcSeasonNum')?.value
  if (!cls || !des) return

  const prefix = cls + gen + typ + des + year + seasonNum

  const used = new Set()
  ;[...State.allProducts, ...State.planItems].forEach(p => {
    const c = p.productCode || ''
    if (c.length === prefix.length + 2 && c.startsWith(prefix)) {
      used.add(c.slice(-2))
    }
  })
  _reservedCodes.forEach(c => {
    if (c.length === prefix.length + 2 && c.startsWith(prefix)) {
      used.add(c.slice(-2))
    }
  })

  let nextNum = null
  for (let i = 0; i <= 99; i++) {
    const candidate = String(i).padStart(2, '0')
    if (!used.has(candidate)) { nextNum = candidate; break }
  }

  const seqDisplay = document.getElementById('pcSeqDisplay')
  const applyBtn   = document.getElementById('pcApplyBtn')
  if (nextNum === null) {
    seqDisplay.textContent = '만료'
    document.getElementById('pcPreview').textContent = '사용 가능한 번호 없음'
    if (applyBtn) applyBtn.disabled = true
  } else {
    seqDisplay.textContent = nextNum
    document.getElementById('pcPreview').textContent = prefix + nextNum
    if (applyBtn) applyBtn.disabled = false
  }
}

function applyGeneratedCode() {
  const code = document.getElementById('pcPreview').textContent
  if (!code || code === '-' || code === '사용 가능한 번호 없음') return

  if (State.allProducts.some(p => p.productCode === code) ||
      State.planItems.some(p => p.productCode === code) ||
      _reservedCodes.has(code)) {
    showToast(`품번 "${code}"은 이미 사용 중입니다. 다시 생성해주세요.`, 'error')
    updateProductCode()
    return
  }

  _reservedCodes.add(code)

  document.getElementById('rProductCode').value = code
  document.getElementById('pcodePanel').style.display = 'none'
  document.getElementById('pcodeToggleBtn').textContent = '자동생성 ▾'

  const cls = document.getElementById('pcClass')?.value || ''
  const typ = document.getElementById('pcType')?.value || ''

  const brandEl = document.getElementById('rBrand')
  if (brandEl) {
    brandEl.value = cls.startsWith('N') ? '르망고 느와' : '르망고'
  }

  const typeEl = document.getElementById('rType')
  if (typeEl) {
    const typeMap = { ON: 'onepiece', MO: 'onepiece', BK: 'bikini', BR: 'bikini' }
    const mapped = typeMap[typ]
    if (mapped) typeEl.value = mapped
  }

  // 백스타일 자동 채우기
  const bsCode  = document.getElementById('pcBackStyle')?.value
  const bsEntry = _designCodes.find(([c]) => c === bsCode)
  const backStyleEl = document.getElementById('rBackStyle')
  if (backStyleEl && bsEntry) backStyleEl.value = bsEntry[1]

  showToast(`품번 ${code} 적용됨`, 'success')
}
