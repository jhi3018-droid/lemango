// =============================================
// ===== 백업 관리 시스템 (Firebase Storage 기반) =====
// =============================================
//
// 2026-05-21: Firestore 단일 문서 1MB 한도 초과로 백업 실패 → Firebase Storage로 이전
//   - 신규 백업 경로: backups/{type}/{dateStr}.json (Storage 객체)
//   - 레거시 경로:    backups/{type}/items/{dateStr} (Firestore) — 읽기 전용, 복원은 가능, 신규 작성 안 함
//   - 압축 미적용 결정: Storage 한도 충분(50MB) + 사람이 읽기 가능 + 외부 라이브러리 의존성 회피
//   - 권한: grade >= 3 (관리자 이상)에서만 작성/복원 가능. storage.rules + JS 게이트 이중 적용

const BACKUP_LS_KEYS = [
  'lemango_events_v1',
  'lemango_work_items_v1',
  'lemango_settings_v1',
  'lemango_channels_v1',
  'lemango_platforms_v1',
  'lemango_design_codes_v1',
  'lemango_work_categories_v1',
  'lemango_depts_v1',
  'lemango_product_history_v1',
  'lemango_watches_v1',
  'lemango_notif_settings_v1',
]

const BACKUP_MIN_GRADE = 3

// 권한 헬퍼 — grade>=3 (관리자 이상)
function _backupHasPermission() {
  return !!(State && State.currentUser && (State.currentUser.grade || 0) >= BACKUP_MIN_GRADE)
}

// 관리자 전용 토스트 (다른 사용자는 silent 처리)
function _backupAdminToast(msg, type) {
  if (typeof showToast === 'function' && _backupHasPermission()) showToast(msg, type)
}

// ── 백업 데이터 수집 ──
async function _collectBackupData() {
  const data = {}

  // 1) localStorage 데이터
  data.localStorage = {}
  BACKUP_LS_KEYS.forEach(key => {
    const val = localStorage.getItem(key)
    if (val) data.localStorage[key] = val
  })

  // 2) 메모리 상태 (JSON 로드 상품 + 기획)
  data.allProducts = JSON.parse(JSON.stringify(State.allProducts || []))
  data.planItems = JSON.parse(JSON.stringify(State.planItems || []))

  // 3) Firestore 컬렉션 (users 제외, activityLogs 포함 — Storage는 용량 여유 충분)
  const collections = ['posts', 'comments', 'activityLogs', 'personalSchedules']
  data.firestore = {}
  for (const col of collections) {
    try {
      const snap = await db.collection(col).get()
      data.firestore[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (e) {
      console.warn('[Backup] Firestore read fail:', col, e.message)
      data.firestore[col] = []
    }
  }

  return data
}

// ── 백업 저장 (Firebase Storage에 JSON 객체 업로드) ──
async function _saveBackup(type, dateStr) {
  if (!_backupHasPermission()) {
    console.log('[Backup] 권한 없음 — 건너뜀 (grade < 3)')
    return { success: false, skipped: true }
  }
  if (!storage) {
    console.error('[Backup] Storage SDK 미초기화')
    return { success: false, error: 'storage-uninitialized' }
  }
  let json, sizeKB
  try {
    const data = await _collectBackupData()
    data.createdAt = new Date().toISOString()
    data.type = type
    data.dateStr = dateStr
    json = JSON.stringify(data)
    sizeKB = Math.round(json.length / 1024)
  } catch (e) {
    console.error('[Backup] 데이터 수집 실패:', e.message)
    _backupAdminToast(`⚠️ 백업 데이터 수집 실패: ${e.message}`, 'error')
    return { success: false, error: e.message }
  }

  try {
    const blob = new Blob([json], { type: 'application/json' })
    const ref = storage.ref(`backups/${type}/${dateStr}.json`)
    await ref.put(blob, {
      contentType: 'application/json',
      customMetadata: { createdAt: new Date().toISOString(), type, dateStr }
    })
    console.log(`[Backup] ${type}/${dateStr}.json 저장 완료 (${sizeKB} KB)`)
    return { success: true, size: sizeKB, dateStr, type }
  } catch (e) {
    console.error('[Backup] Storage 저장 실패:', e.code || e.name, e.message)
    _backupAdminToast(`⚠️ 백업 저장에 실패했습니다. 관리자에게 문의하세요. (${e.code || e.message})`, 'error')
    return { success: false, error: e.message, code: e.code }
  }
}

// ── 오래된 백업 정리 (Storage 객체만 — 레거시 Firestore는 건드리지 않음) ──
async function _cleanOldBackups() {
  if (!_backupHasPermission() || !storage) return
  const now = new Date()
  const cleanType = async (type, daysRetain) => {
    try {
      const cutoff = new Date(now)
      cutoff.setDate(cutoff.getDate() - daysRetain)
      const listResult = await storage.ref(`backups/${type}`).listAll()
      let count = 0
      for (const item of listResult.items) {
        const m = item.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/)
        if (!m) continue
        const fileDate = new Date(m[1] + 'T00:00:00')
        if (fileDate < cutoff) {
          try { await item.delete(); count++ }
          catch (delErr) { console.warn(`[Backup] ${type}/${item.name} 삭제 실패:`, delErr.message) }
        }
      }
      if (count > 0) console.log(`[Backup] ${type} ${count}건 정리`)
    } catch (e) {
      console.warn(`[Backup] ${type} cleanup fail:`, e.message)
    }
  }
  await cleanType('daily', 7)
  await cleanType('weekly', 90)
  await cleanType('monthly', 90)
  // 마이그레이션 안전 정책: 레거시 Firestore 백업(backups/{type}/items/*)은 정리 대상에서 제외.
  // 시간 경과 후 owner가 콘솔에서 수동 정리하거나, 그대로 유지해 복원 옵션을 남깁니다.
}

// ── 자동 백업 실행 (23:59 또는 로그인 시 당일 미백업 보완) ──
async function runAutoBackup() {
  if (!_backupHasPermission()) {
    // 비-관리자는 조용히 종료 (기존 동작 유지 — silent)
    return
  }
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10) // YYYY-MM-DD
  const backupFlag = 'lemango_last_backup_date_v1'

  // 이미 오늘 백업했으면 skip
  if (localStorage.getItem(backupFlag) === dateStr) return

  // 1) daily 백업
  const dailyResult = await _saveBackup('daily', dateStr)

  // 2) 일요일이면 weekly
  if (today.getDay() === 0) {
    await _saveBackup('weekly', dateStr)
  }

  // 3) 매월 1일이면 monthly
  if (today.getDate() === 1) {
    await _saveBackup('monthly', dateStr)
  }

  // 4) 오래된 Storage 백업 정리
  await _cleanOldBackups()

  // daily 가 성공했을 때만 플래그 갱신 (실패한 날은 다음 로그인 때 재시도)
  if (dailyResult && dailyResult.success) {
    localStorage.setItem(backupFlag, dateStr)
    console.log('[Backup] 자동 백업 완료:', dateStr, `(${dailyResult.size} KB)`)
  } else if (dailyResult && !dailyResult.skipped) {
    console.warn('[Backup] 자동 백업 실패 — 다음 로그인 때 재시도')
  }
}

// ── 23:59 타이머 설정 ──
let _backupTimerId = null
function scheduleBackupTimer() {
  if (_backupTimerId) clearTimeout(_backupTimerId)
  if (!_backupHasPermission()) return
  const now = new Date()
  const target = new Date(now)
  target.setHours(23, 59, 0, 0)
  if (now >= target) {
    // 이미 23:59 지났으면 내일
    target.setDate(target.getDate() + 1)
  }
  const ms = target - now
  _backupTimerId = setTimeout(async () => {
    await runAutoBackup()
    // 다음날 타이머 재설정
    scheduleBackupTimer()
  }, ms)
  console.log(`[Backup] 다음 백업 예약: ${target.toLocaleString()} (${Math.round(ms/60000)}분 후)`)
}

// ── 백업 데이터 적용 (storage / firestore 공통 복원 로직) ──
async function _applyBackupData(data, dateStr) {
  // 1) localStorage 복원
  if (data.localStorage) {
    Object.entries(data.localStorage).forEach(([key, val]) => {
      localStorage.setItem(key, val)
    })
  }

  // 2) Firestore 컬렉션 복원 (users 제외)
  if (data.firestore) {
    for (const [col, docs] of Object.entries(data.firestore)) {
      // 기존 데이터 삭제
      const snap = await db.collection(col).get()
      if (snap.docs.length > 0) {
        const delBatch = db.batch()
        snap.docs.forEach(d => delBatch.delete(d.ref))
        await delBatch.commit()
      }
      // 백업 데이터 복원
      if (docs.length > 0) {
        // Firestore batch 최대 500건
        for (let i = 0; i < docs.length; i += 450) {
          const chunk = docs.slice(i, i + 450)
          const addBatch = db.batch()
          chunk.forEach(item => {
            const { id, ...rest } = item
            addBatch.set(db.collection(col).doc(id), rest)
          })
          await addBatch.commit()
        }
      }
    }
  }
}

// ── 복원 (source: 'storage' | 'firestore') ──
async function restoreBackup(type, dateStr, source) {
  if (!_backupHasPermission()) {
    if (typeof showToast === 'function') showToast('관리자만 복원할 수 있습니다.', 'warning')
    return false
  }
  source = source || 'storage'
  try {
    let data
    if (source === 'firestore') {
      const doc = await db.collection('backups').doc(type).collection('items').doc(dateStr).get()
      if (!doc.exists) { showToast('레거시 백업을 찾을 수 없습니다.', 'error'); return false }
      data = doc.data()
    } else {
      const ref = storage.ref(`backups/${type}/${dateStr}.json`)
      const url = await ref.getDownloadURL()
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      data = await resp.json()
    }

    await _applyBackupData(data, dateStr)

    showToast(`${dateStr} 백업 복원 완료. 새로고침합니다.`, 'success')
    setTimeout(() => location.reload(), 1500)
    return true
  } catch (e) {
    console.error('[Restore] 실패:', e)
    showToast('복원 실패: ' + (e.message || e.code || e), 'error')
    return false
  }
}

// ── 백업 목록 조회: Storage(신규) + Firestore(레거시) 통합, 신규 우선 정렬 ──
async function _loadBackupList(type) {
  const list = []

  // 1) Storage (현재 시스템)
  if (storage) {
    try {
      const listResult = await storage.ref(`backups/${type}`).listAll()
      for (const item of listResult.items) {
        const m = item.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/)
        if (!m) continue
        let createdAt = ''
        let sizeBytes = 0
        try {
          const meta = await item.getMetadata()
          createdAt = (meta.customMetadata && meta.customMetadata.createdAt) || meta.timeCreated || ''
          sizeBytes = meta.size || 0
        } catch (metaErr) { /* metadata optional */ }
        list.push({
          dateStr: m[1],
          createdAt: createdAt,
          type: type,
          source: 'storage',
          sizeBytes: sizeBytes
        })
      }
    } catch (e) {
      console.warn('[Backup] Storage list fail:', type, e.message)
    }
  }

  // 2) Firestore (레거시) — 신규 백업과 중복되지 않는 항목만
  try {
    const storageDates = new Set(list.map(l => l.dateStr))
    const snap = await db.collection('backups').doc(type).collection('items').get()
    snap.docs.forEach(d => {
      if (storageDates.has(d.id)) return
      list.push({
        dateStr: d.id,
        createdAt: d.data().createdAt || '',
        type: type,
        source: 'firestore',
        sizeBytes: 0
      })
    })
  } catch (e) {
    console.warn('[Backup] Firestore list fail:', type, e.message)
  }

  // 최신순 정렬
  list.sort((a, b) => b.dateStr.localeCompare(a.dateStr))
  return list
}

// ── 백업관리 패널 렌더 ──
async function renderBackupPanel() {
  const panel = document.getElementById('backupManagePanel')
  if (!panel) return
  panel.innerHTML = '<div style="padding:24px;color:#888">백업 목록 불러오는 중...</div>'

  const [dailyList, weeklyList, monthlyList] = await Promise.all([
    _loadBackupList('daily'),
    _loadBackupList('weekly'),
    _loadBackupList('monthly'),
  ])

  // 최신 Storage 백업 날짜 → 상태 배지에 사용
  const latestStorageDaily = dailyList.find(b => b.source === 'storage')
  const latestStr = latestStorageDaily ? latestStorageDaily.dateStr : null
  let statusHtml = ''
  if (latestStr) {
    const lastDate = new Date(latestStr + 'T00:00:00')
    const today = new Date(); today.setHours(0,0,0,0)
    const daysAgo = Math.round((today - lastDate) / 86400000)
    const isStale = daysAgo > 1
    statusHtml = `<div class="bkp-status ${isStale ? 'bkp-status-warning' : ''}">
      <strong>마지막 백업:</strong> ${latestStr}
      <span class="bkp-days-ago">(${daysAgo === 0 ? '오늘' : daysAgo + '일 전'})</span>
      ${isStale ? '<span class="bkp-status-badge">⚠️ 1일 이상 경과</span>' : ''}
    </div>`
  } else {
    statusHtml = `<div class="bkp-status bkp-status-warning">
      <strong>마지막 백업:</strong> 없음
      <span class="bkp-status-badge">⚠️ 백업 데이터 없음 — 지금 백업 실행을 권장합니다</span>
    </div>`
  }

  let html = '<div class="bkp-container">'
  html += statusHtml

  // 수동 백업 버튼 — 3 tier 동시 실행
  html += '<div class="bkp-actions">'
  html += '<button class="btn btn-primary" onclick="manualBackup()">지금 백업 실행 (일간/주간/월간 동시)</button>'
  html += '<span class="bkp-hint">매일 23:59 자동 백업 · 일요일 주간 백업 · 매월 1일 월간 백업</span>'
  html += '</div>'

  // 3개 섹션
  html += _buildBackupSection('일별 백업', 'daily', dailyList, '최근 7일 보관')
  html += _buildBackupSection('주간 백업 (일요일)', 'weekly', weeklyList, '3개월 보관')
  html += _buildBackupSection('월간 백업 (1일)', 'monthly', monthlyList, '3개월 보관')

  html += '</div>'
  panel.innerHTML = html
}

function _buildBackupSection(title, type, list, retention) {
  let html = '<div class="bkp-section">'
  html += `<div class="bkp-section-header"><h4>${title}</h4><span class="bkp-retention">${retention}</span></div>`
  if (list.length === 0) {
    html += '<div class="bkp-empty">백업 데이터가 없습니다.</div>'
  } else {
    html += '<table class="bkp-table"><thead><tr><th>날짜</th><th>백업 시각</th><th>크기</th><th>저장소</th><th style="width:100px">복원</th></tr></thead><tbody>'
    list.forEach(item => {
      const timeStr = item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '-'
      const sizeStr = item.sizeBytes ? (Math.round(item.sizeBytes / 1024) + ' KB') : '-'
      const isLegacy = item.source === 'firestore'
      const sourceBadge = isLegacy
        ? '<span class="bkp-legacy-badge" title="레거시 Firestore 백업 — 신규 시스템 이전 데이터입니다">⚠️ 오래됨 (구버전)</span>'
        : '<span class="bkp-source-badge">Storage</span>'
      const rowClass = isLegacy ? 'bkp-row-legacy' : ''
      html += `<tr class="${rowClass}">`
      html += `<td><strong>${item.dateStr}</strong></td>`
      html += `<td>${timeStr}</td>`
      html += `<td>${sizeStr}</td>`
      html += `<td>${sourceBadge}</td>`
      html += `<td><button class="btn btn-outline bkp-restore-btn" onclick="confirmRestore('${type}','${item.dateStr}','${item.source}')">복원</button></td>`
      html += `</tr>`
    })
    html += '</tbody></table>'
  }
  html += '</div>'
  return html
}

// ── 복원 2중 확인 ──
window.confirmRestore = async function(type, dateStr, source) {
  source = source || 'storage'
  const typeLabel = type === 'daily' ? '일별' : type === 'weekly' ? '주간' : '월간'
  const sourceLabel = source === 'firestore' ? ' (구버전 백업)' : ''
  const ok1 = await korConfirm(
    `${dateStr} (${typeLabel})${sourceLabel} 백업을 복원하시겠습니까?`,
    '복원', '취소'
  )
  if (!ok1) return

  const legacyWarn = source === 'firestore'
    ? '\n\n⚠️ 이 백업은 구버전(레거시) 백업입니다.\n현재 상품 데이터가 백업 시점의 작은 데이터로 되돌아갑니다.'
    : ''
  const ok2 = await korConfirm(
    '⚠ 현재 데이터가 모두 덮어씌워집니다.\n정말 복원하시겠습니까?' + legacyWarn,
    '최종 확인', '취소'
  )
  if (!ok2) return

  await restoreBackup(type, dateStr, source)
}

// ── 수동 백업 (3 tier 동시 시드) ──
window.manualBackup = async function() {
  if (!_backupHasPermission()) {
    if (typeof showToast === 'function') showToast('관리자만 실행할 수 있습니다.', 'warning')
    return
  }
  const ok = await korConfirm('지금 수동 백업을 실행하시겠습니까?\n(일간 + 주간 + 월간 3개 동시 저장)', '백업', '취소')
  if (!ok) return

  const dateStr = new Date().toISOString().slice(0, 10)
  showToast('백업 진행 중...', 'info')

  const dailyResult = await _saveBackup('daily', dateStr)
  const weeklyResult = await _saveBackup('weekly', dateStr)
  const monthlyResult = await _saveBackup('monthly', dateStr)

  const successes = []
  if (dailyResult.success) successes.push('일간')
  if (weeklyResult.success) successes.push('주간')
  if (monthlyResult.success) successes.push('월간')

  const sizeStr = dailyResult.size ? ` (${dailyResult.size} KB)` : ''
  if (successes.length === 3) {
    localStorage.setItem('lemango_last_backup_date_v1', dateStr)
    showToast(`백업이 완료되었습니다 (${successes.join(' / ')})${sizeStr}`, 'success')
    if (typeof logActivity === 'function') logActivity('setting', '백업', `수동 백업 완료: ${successes.join(', ')}${sizeStr}`)
  } else if (successes.length > 0) {
    if (dailyResult.success) localStorage.setItem('lemango_last_backup_date_v1', dateStr)
    showToast(`부분 백업: ${successes.join(' / ')} 성공`, 'warning')
  } else {
    showToast('백업 실패. 콘솔에서 오류를 확인해주세요.', 'error')
  }
  renderBackupPanel()
  // Settings 페이지의 백업 상태 카드도 갱신
  if (typeof renderBackupStatusCard === 'function') renderBackupStatusCard()
}

// ── Settings 탭 백업 상태 카드 갱신용 헬퍼 (settings.js에서 사용) ──
async function getBackupStatus() {
  if (!storage) return { hasBackup: false }
  try {
    const listResult = await storage.ref('backups/daily').listAll()
    let latest = null
    for (const item of listResult.items) {
      const m = item.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/)
      if (!m) continue
      if (!latest || m[1] > latest) latest = m[1]
    }
    if (!latest) return { hasBackup: false }
    const lastDate = new Date(latest + 'T00:00:00')
    const today = new Date(); today.setHours(0,0,0,0)
    const daysAgo = Math.round((today - lastDate) / 86400000)
    return { hasBackup: true, latest, daysAgo, isStale: daysAgo > 1 }
  } catch (e) {
    console.warn('[Backup] status check fail:', e.message)
    return { hasBackup: false, error: e.message }
  }
}

// window 노출
window.renderBackupPanel = renderBackupPanel
window.runAutoBackup = runAutoBackup
window.scheduleBackupTimer = scheduleBackupTimer
window.getBackupStatus = getBackupStatus
