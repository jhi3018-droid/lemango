// =============================================
// ===== 모달 댓글 시스템 =====
// =============================================

// ===== 이모티콘 선택기 =====
const EMOJI_CATS = [
  { key: 'recent', label: '최근', emojis: [] },
  { key: 'face',   label: '표정', emojis: ['😊','😂','🤣','😍','🥰','😘','😎','🤩','🥳','😇','🤗','🤔','😏','😴','🤤','😱','🤯','🫣','🫡','🫠'] },
  { key: 'hand',   label: '손/동작', emojis: ['👍','👏','🙌','💪','🤝','👋','✌️','🤞','🫶','🙏','🎉','🎊','💃','🕺','🏃‍♂️','🧎'] },
  { key: 'heart',  label: '하트', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💝','💖','💗','💓','💕','💘','✨','⭐','🔥','💯'] },
  { key: 'nature', label: '자연', emojis: ['🐶','🐱','🐰','🦊','🐻','🐼','🐨','🦁','🐸','🐙','🦋','🌸','🌺','🌻','🌈','☀️','🌊','🍀'] },
  { key: 'food',   label: '음식', emojis: ['🍕','🍔','🍟','🍰','🧁','🍩','🍪','🧋','☕','🎂','🎁','📦','👗','👙','🩱','🏊‍♀️','🏖️'] },
  { key: 'work',   label: '업무', emojis: ['✅','❌','⚠️','📌','📝','💼','📊','📈','📉','🔔','🔕','⏰','📅','🗂️','💡','🔧','🚀','📢'] }
]

const _EMOJI_RECENT_KEY = 'lemango_emoji_recent'
const _EMOJI_RECENT_MAX = 12

function _loadRecentEmojis() {
  try { return JSON.parse(localStorage.getItem(_EMOJI_RECENT_KEY)) || [] }
  catch { return [] }
}
function _saveRecentEmoji(emoji) {
  let arr = _loadRecentEmojis().filter(e => e !== emoji)
  arr.unshift(emoji)
  if (arr.length > _EMOJI_RECENT_MAX) arr = arr.slice(0, _EMOJI_RECENT_MAX)
  localStorage.setItem(_EMOJI_RECENT_KEY, JSON.stringify(arr))
}

let _emojiPickerTarget = null  // textarea element

window.toggleEmojiPicker = function(btn, inputId) {
  const existing = document.querySelector('.emoji-picker')
  if (existing) { existing.remove(); _emojiPickerTarget = null; return }

  const textarea = document.getElementById(inputId)
  if (!textarea) return
  _emojiPickerTarget = textarea

  const picker = document.createElement('div')
  picker.className = 'emoji-picker'

  // 탭 + 그리드
  const recent = _loadRecentEmojis()
  EMOJI_CATS[0].emojis = recent

  let tabsHtml = EMOJI_CATS.map((cat, i) => {
    if (cat.key === 'recent' && !cat.emojis.length) return ''
    return `<button class="emoji-tab${i === (recent.length ? 0 : 1) ? ' active' : ''}" data-idx="${i}">${cat.key === 'recent' ? '🕐' : cat.emojis[0]}</button>`
  }).join('')

  const activeIdx = recent.length ? 0 : 1
  const activeEmojis = EMOJI_CATS[activeIdx].emojis

  picker.innerHTML = `
    <div class="emoji-tabs">${tabsHtml}</div>
    <div class="emoji-grid" id="_emojiGrid">${activeEmojis.map(e => `<button class="emoji-btn" type="button">${e}</button>`).join('')}</div>`

  // 위치 계산 — 버튼 기준
  const rect = btn.getBoundingClientRect()
  const inputArea = btn.closest('.comment-input-area')
  if (inputArea) {
    inputArea.style.position = 'relative'
    picker.style.bottom = '44px'
    picker.style.right = '0'
    inputArea.appendChild(picker)
  } else {
    document.body.appendChild(picker)
    picker.style.left = rect.left + 'px'
    picker.style.top = (rect.top - 220) + 'px'
  }

  // 탭 전환
  picker.addEventListener('click', e => {
    const tab = e.target.closest('.emoji-tab')
    if (tab) {
      const idx = Number(tab.dataset.idx)
      picker.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const grid = picker.querySelector('.emoji-grid')
      const emojis = idx === 0 ? _loadRecentEmojis() : EMOJI_CATS[idx].emojis
      grid.innerHTML = emojis.length
        ? emojis.map(em => `<button class="emoji-btn" type="button">${em}</button>`).join('')
        : '<span class="emoji-empty">최근 사용 없음</span>'
      return
    }
    const btn2 = e.target.closest('.emoji-btn')
    if (btn2 && _emojiPickerTarget) {
      const emoji = btn2.textContent
      const ta = _emojiPickerTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      ta.value = ta.value.slice(0, start) + emoji + ta.value.slice(end)
      ta.selectionStart = ta.selectionEnd = start + emoji.length
      ta.focus()
      _saveRecentEmoji(emoji)
    }
  })

  // 바깥 클릭 닫기
  setTimeout(() => {
    function closePicker(ev) {
      if (!picker.contains(ev.target) && ev.target !== btn) {
        picker.remove()
        _emojiPickerTarget = null
        document.removeEventListener('mousedown', closePicker, true)
      }
    }
    document.addEventListener('mousedown', closePicker, true)
  }, 0)
}

// 인라인 에러 표시 (dialog 내부에서 toast가 보이지 않으므로)
function _showCommentError(key, msg) {
  const el = document.getElementById(`commentError-${key}`)
  if (el) { el.textContent = msg; el.style.display = 'block' }
  console.error('[Comments]', msg)
}
function _clearCommentError(key) {
  const el = document.getElementById(`commentError-${key}`)
  if (el) { el.textContent = ''; el.style.display = 'none' }
}

// 등급명 변환
function commentGradeName(grade) {
  return { 4: '시스템 관리자', 3: '관리자', 2: '부서장', 1: '담당자' }[grade] || ''
}

// 댓글 섹션 HTML 생성
function buildCommentSection(modalType, targetId) {
  const key = `${modalType}-${targetId}`
  return `
    <div class="comment-section" data-modal-type="${modalType}" data-target-id="${esc(String(targetId))}">
      <div class="comment-header">
        <span class="comment-title">댓글</span>
        <span class="comment-count" id="commentCount-${key}">0</span>
      </div>
      <div class="comment-list" id="commentList-${key}"></div>
      <div class="comment-error" id="commentError-${key}" style="display:none"></div>
      <div class="comment-input-area">
        <textarea class="comment-input" id="commentInput-${key}" placeholder="댓글을 입력하세요..." rows="2"></textarea>
        <button type="button" class="emoji-trigger-btn" onclick="toggleEmojiPicker(this,'commentInput-${key}')">😊</button>
        <button type="button" class="comment-submit-btn" onclick="submitComment('${modalType}','${esc(String(targetId))}')">등록</button>
      </div>
    </div>`
}

// Firestore에서 댓글 로드 + 렌더
async function loadComments(modalType, targetId) {
  const key = `${modalType}-${targetId}`
  const listEl = document.getElementById(`commentList-${key}`)
  const countEl = document.getElementById(`commentCount-${key}`)
  if (!listEl || !db) return
  _clearCommentError(key)

  try {
    // 복합 인덱스 불필요 — where 2개만 사용, 정렬은 클라이언트에서
    const snapshot = await db.collection('comments')
      .where('modalType', '==', modalType)
      .where('targetId', '==', String(targetId))
      .get()

    const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    // 클라이언트 정렬 (createdAt ASC) — 복합 인덱스 불필요
    comments.sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()
      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()
      return ta - tb
    })
    if (countEl) countEl.textContent = comments.length

    const currentUid = auth && auth.currentUser ? auth.currentUser.uid : ''
    const currentGrade = State.currentUser ? State.currentUser.grade : 0

    if (!comments.length) {
      listEl.innerHTML = '<div class="comment-empty">댓글이 없습니다.</div>'
      return
    }

    listEl.innerHTML = comments.map(c => {
      const ts = c.createdAt?.toDate ? c.createdAt.toDate() : new Date(c.createdAt)
      const y   = ts.getFullYear()
      const mo  = String(ts.getMonth() + 1).padStart(2, '0')
      const day = String(ts.getDate()).padStart(2, '0')
      const h   = String(ts.getHours()).padStart(2, '0')
      const mi  = String(ts.getMinutes()).padStart(2, '0')
      const dateStr = `${y}-${mo}-${day} ${h}:${mi}`
      const isEdited = c.updatedAt && c.createdAt &&
        (c.updatedAt.toDate ? c.updatedAt.toDate().getTime() : 0) !== (c.createdAt.toDate ? c.createdAt.toDate().getTime() : 0)
      const canEdit = (currentUid === c.uid) || (currentGrade >= 3)

      return `<div class="comment-item" data-comment-id="${c.id}">
        <div class="comment-meta">
          <span class="comment-author clickable-author" onclick="event.stopPropagation();showUserProfile('${c.uid}',this)">${esc(formatUserName(c.userName, c.authorPosition))}</span>
          <span class="comment-grade-badge comment-grade-${c.userGrade}">${commentGradeName(c.userGrade)}</span>
          <span class="comment-date">${dateStr}${isEdited ? ' (수정됨)' : ''}</span>
          ${canEdit ? `<span class="comment-actions">
            <button class="comment-edit-btn" onclick="editComment('${c.id}','${modalType}','${esc(String(targetId))}')">수정</button>
            <button class="comment-delete-btn" onclick="deleteComment('${c.id}','${modalType}','${esc(String(targetId))}')">삭제</button>
          </span>` : ''}
        </div>
        <div class="comment-content" id="commentContent-${c.id}">${esc(c.content)}</div>
      </div>`
    }).join('')
  } catch (e) {
    console.error('Comments load error:', e)
    _showCommentError(key, '댓글 로드 실패: ' + e.message)
    listEl.innerHTML = ''
  }
}

// 댓글 등록
window.submitComment = async function(modalType, targetId) {
  const key = `${modalType}-${targetId}`
  _clearCommentError(key)
  const input = document.getElementById(`commentInput-${key}`)
  const content = input ? input.value.trim() : ''
  if (!content) { _showCommentError(key, '댓글 내용을 입력하세요.'); return }
  if (!auth || !auth.currentUser || !State.currentUser) { _showCommentError(key, '로그인이 필요합니다.'); return }
  if (!db) { _showCommentError(key, 'Firestore가 초기화되지 않았습니다.'); return }

  try {
    const commentData = {
      modalType,
      targetId: String(targetId),
      uid: auth.currentUser.uid,
      userName: State.currentUser.name,
      userGrade: State.currentUser.grade,
      authorPosition: _currentUserPosition || '',
      content
    }
    stampCreated(commentData)
    await db.collection('comments').add(commentData)
    input.value = ''
    loadComments(modalType, targetId)
    logActivity('create', '댓글', `댓글 등록 — ${modalType}/${targetId}`)
    try { checkCommentMentions(content, modalType, targetId) } catch(e) {}
    // 게시판 댓글수 동기화
    if (modalType === 'board') {
      db.collection('posts').doc(String(targetId)).update({
        commentCount: firebase.firestore.FieldValue.increment(1)
      }).catch(() => {})
    }
  } catch (e) {
    _showCommentError(key, '댓글 등록 실패: ' + e.message)
  }
}

// 댓글 수정 (인라인)
window.editComment = function(commentId, modalType, targetId) {
  const contentEl = document.getElementById(`commentContent-${commentId}`)
  if (!contentEl) return
  const currentText = contentEl.textContent

  contentEl.innerHTML = `
    <textarea class="comment-edit-input" id="editInput-${commentId}">${esc(currentText)}</textarea>
    <div class="comment-edit-actions">
      <button onclick="saveCommentEdit('${commentId}','${modalType}','${esc(String(targetId))}')">저장</button>
      <button onclick="loadComments('${modalType}','${esc(String(targetId))}')">취소</button>
    </div>`
  const textarea = document.getElementById(`editInput-${commentId}`)
  if (textarea) textarea.focus()
}

window.saveCommentEdit = async function(commentId, modalType, targetId) {
  const key = `${modalType}-${targetId}`
  const input = document.getElementById(`editInput-${commentId}`)
  const content = input ? input.value.trim() : ''
  if (!content) return

  try {
    const updateData = { content }
    stampModified(updateData)
    await db.collection('comments').doc(commentId).update(updateData)
    loadComments(modalType, targetId)
    logActivity('update', '댓글', `댓글 수정 — ${modalType}/${targetId}`)
  } catch (e) {
    _showCommentError(key, '댓글 수정 실패: ' + e.message)
  }
}

// 댓글 삭제
window.deleteComment = async function(commentId, modalType, targetId) {
  const ok = await korConfirm('댓글을 삭제하시겠습니까?')
  if (!ok) return

  try {
    await db.collection('comments').doc(commentId).delete()
    loadComments(modalType, targetId)
    logActivity('delete', '댓글', `댓글 삭제 — ${modalType}/${targetId}`)
    // 게시판 댓글수 동기화
    if (modalType === 'board') {
      db.collection('posts').doc(String(targetId)).update({
        commentCount: firebase.firestore.FieldValue.increment(-1)
      }).catch(() => {})
    }
  } catch (e) {
    _showCommentError(`${modalType}-${targetId}`, '댓글 삭제 실패: ' + e.message)
  }
}

/* ===== Feature 4: Comment @mention ===== */
function checkCommentMentions(content, targetType, targetId) {
  if (!content) return
  const users = Array.isArray(window._allUsers) ? window._allUsers : []
  if (!users.length) return
  const myUid = (typeof _myUid === 'function') ? _myUid() : ''
  const matches = content.match(/@([\p{L}\p{N}_]+)/gu) || []
  if (!matches.length) return
  const notifiedUids = new Set()
  matches.forEach(raw => {
    const name = raw.slice(1)
    users.forEach(u => {
      if (!u || !u.name || !u.uid) return
      if (u.uid === myUid) return
      if (notifiedUids.has(u.uid)) return
      if (u.name === name || u.name.startsWith(name) || name.startsWith(u.name)) {
        notifiedUids.add(u.uid)
        try {
          const curName = (typeof _currentUserName !== 'undefined' && _currentUserName) ? _currentUserName : '누군가'
          if (typeof addNotification === 'function') {
            addNotification('comment_mention', '댓글 멘션', `${curName}님이 댓글에서 회원님을 멘션했습니다`, `#${targetType}:${targetId}`)
          }
        } catch(e) {}
      }
    })
  })
}
window.checkCommentMentions = checkCommentMentions
