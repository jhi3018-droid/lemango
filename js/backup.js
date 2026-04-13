// =============================================
// ===== 백업 관리 시스템 =====
// =============================================

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

  // 3) Firestore 컬렉션 (users 제외)
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

// ── 백업 저장 ──
async function _saveBackup(type, dateStr) {
  const docId = dateStr // e.g. '2026-04-13'
  const data = await _collectBackupData()
  data.createdAt = new Date().toISOString()
  data.type = type
  data.dateStr = dateStr

  try {
    await db.collection('backups').doc(type).collection('items').doc(docId).set(data)
    console.log(`[Backup] ${type}/${docId} 저장 완료`)
    return true
  } catch (e) {
    console.error('[Backup] 저장 실패:', e.message)
    return false
  }
}

// ── 오래된 백업 정리 ──
async function _cleanOldBackups() {
  const now = new Date()

  // daily: 7일 보관
  try {
    const dailySnap = await db.collection('backups').doc('daily').collection('items').get()
    const cutoffDaily = new Date(now)
    cutoffDaily.setDate(cutoffDaily.getDate() - 7)
    const batch = db.batch()
    let count = 0
    dailySnap.docs.forEach(doc => {
      const d = new Date(doc.id + 'T00:00:00')
      if (d < cutoffDaily) { batch.delete(doc.ref); count++ }
    })
    if (count > 0) { await batch.commit(); console.log(`[Backup] daily ${count}건 정리`) }
  } catch (e) { console.warn('[Backup] daily cleanup fail:', e.message) }

  // weekly: 3개월(90일) 보관
  try {
    const weeklySnap = await db.collection('backups').doc('weekly').collection('items').get()
    const cutoffWeekly = new Date(now)
    cutoffWeekly.setDate(cutoffWeekly.getDate() - 90)
    const batch = db.batch()
    let count = 0
    weeklySnap.docs.forEach(doc => {
      const d = new Date(doc.id + 'T00:00:00')
      if (d < cutoffWeekly) { batch.delete(doc.ref); count++ }
    })
    if (count > 0) { await batch.commit(); console.log(`[Backup] weekly ${count}건 정리`) }
  } catch (e) { console.warn('[Backup] weekly cleanup fail:', e.message) }

  // monthly: 3개월(90일) 보관
  try {
    const monthlySnap = await db.collection('backups').doc('monthly').collection('items').get()
    const cutoffMonthly = new Date(now)
    cutoffMonthly.setDate(cutoffMonthly.getDate() - 90)
    const batch = db.batch()
    let count = 0
    monthlySnap.docs.forEach(doc => {
      const d = new Date(doc.id + 'T00:00:00')
      if (d < cutoffMonthly) { batch.delete(doc.ref); count++ }
    })
    if (count > 0) { await batch.commit(); console.log(`[Backup] monthly ${count}건 정리`) }
  } catch (e) { console.warn('[Backup] monthly cleanup fail:', e.message) }
}

// ── 자동 백업 실행 (23:59 또는 로그인 시 당일 미백업 보완) ──
async function runAutoBackup() {
  const today = new Date()
  const dateStr = today.toISOString().slice(0, 10) // YYYY-MM-DD
  const backupFlag = 'lemango_last_backup_date'

  // 이미 오늘 백업했으면 skip
  if (localStorage.getItem(backupFlag) === dateStr) return

  // 1) daily 백업
  await _saveBackup('daily', dateStr)

  // 2) 일요일이면 weekly
  if (today.getDay() === 0) {
    await _saveBackup('weekly', dateStr)
  }

  // 3) 매월 1일이면 monthly
  if (today.getDate() === 1) {
    await _saveBackup('monthly', dateStr)
  }

  // 4) 오래된 백업 정리
  await _cleanOldBackups()

  localStorage.setItem(backupFlag, dateStr)
  console.log('[Backup] 자동 백업 완료:', dateStr)
}

// ── 23:59 타이머 설정 ──
let _backupTimerId = null
function scheduleBackupTimer() {
  if (_backupTimerId) clearTimeout(_backupTimerId)
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

// ── 복원 ──
async function restoreBackup(type, dateStr) {
  try {
    const doc = await db.collection('backups').doc(type).collection('items').doc(dateStr).get()
    if (!doc.exists) { showToast('백업 데이터를 찾을 수 없습니다.', 'error'); return false }
    const data = doc.data()

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

    showToast(`${dateStr} 백업 복원 완료. 새로고침합니다.`, 'success')
    setTimeout(() => location.reload(), 1500)
    return true
  } catch (e) {
    console.error('[Restore] 실패:', e)
    showToast('복원 실패: ' + e.message, 'error')
    return false
  }
}

// ── 백업 목록 조회 ──
async function _loadBackupList(type) {
  try {
    const snap = await db.collection('backups').doc(type).collection('items')
      .orderBy(firebase.firestore.FieldPath.documentId(), 'desc').get()
    return snap.docs.map(d => ({
      dateStr: d.id,
      createdAt: d.data().createdAt || '',
      type: type
    }))
  } catch (e) {
    console.warn('[Backup] list fail:', type, e.message)
    return []
  }
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

  let html = '<div class="bkp-container">'

  // 수동 백업 버튼
  html += '<div class="bkp-actions">'
  html += '<button class="btn btn-primary" onclick="manualBackup()">수동 백업 실행</button>'
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
    html += '<table class="bkp-table"><thead><tr><th>날짜</th><th>백업 시각</th><th style="width:100px">복원</th></tr></thead><tbody>'
    list.forEach(item => {
      const timeStr = item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '-'
      html += `<tr>`
      html += `<td><strong>${item.dateStr}</strong></td>`
      html += `<td>${timeStr}</td>`
      html += `<td><button class="btn btn-outline bkp-restore-btn" onclick="confirmRestore('${type}','${item.dateStr}')">복원</button></td>`
      html += `</tr>`
    })
    html += '</tbody></table>'
  }
  html += '</div>'
  return html
}

// ── 복원 2중 확인 ──
window.confirmRestore = async function(type, dateStr) {
  const typeLabel = type === 'daily' ? '일별' : type === 'weekly' ? '주간' : '월간'
  const ok1 = await korConfirm(
    `${dateStr} (${typeLabel}) 백업을 복원하시겠습니까?`,
    '복원', '취소'
  )
  if (!ok1) return

  const ok2 = await korConfirm(
    '⚠ 현재 데이터가 모두 덮어씌워집니다.\n정말 복원하시겠습니까?',
    '최종 확인', '취소'
  )
  if (!ok2) return

  await restoreBackup(type, dateStr)
}

// ── 수동 백업 ──
window.manualBackup = async function() {
  const ok = await korConfirm('지금 수동 백업을 실행하시겠습니까?', '백업', '취소')
  if (!ok) return

  const dateStr = new Date().toISOString().slice(0, 10)
  showToast('백업 진행 중...', 'info')
  const result = await _saveBackup('daily', dateStr)
  if (result) {
    localStorage.setItem('lemango_last_backup_date', dateStr)
    showToast('수동 백업 완료', 'success')
    renderBackupPanel()
  }
}

// window 노출
window.renderBackupPanel = renderBackupPanel
window.runAutoBackup = runAutoBackup
window.scheduleBackupTimer = scheduleBackupTimer
