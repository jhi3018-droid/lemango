// =============================================
// ===== 게시판 시스템 =====
// =============================================

// ===== 게시판 카테고리 =====
const BOARD_CATS = {
  notice: ['공지', '업데이트', '행사', '가이드'],
  free:   ['일반', '질문', '공유', '건의']
}

function getCategoryClass(cat) {
  const map = {
    '공지': 'bcat-notice', '업데이트': 'bcat-update', '행사': 'bcat-event', '가이드': 'bcat-guide',
    '일반': 'bcat-general', '질문': 'bcat-question', '공유': 'bcat-share', '건의': 'bcat-suggest'
  }
  return map[cat] || 'bcat-general'
}

// ===== 목록으로 돌아가기 (history 연동) =====
window.boardBackToList = function() {
  history.back()
}

// ===== 뷰 전환 =====
function showBoardView(view) {
  document.getElementById('boardListView').style.display = view === 'list' ? '' : 'none'
  document.getElementById('boardDetailView').style.display = view === 'detail' ? '' : 'none'
  document.getElementById('boardWriteView').style.display = view === 'write' ? '' : 'none'
}

// ===== 초기 렌더 (탭 열릴 때) =====
function renderBoard() {
  showBoardView('list')
  loadBoardPosts()
}

// ===== Inner tab 전환 =====
window.switchBoardType = function(type) {
  State.boardType = type
  State.boardPage = 1
  document.querySelectorAll('.board-itab').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type)
  })
  loadBoardPosts()
}

// ===== Firestore에서 게시글 로드 =====
async function loadBoardPosts() {
  showBoardView('list')
  if (!db) return

  try {
    const snapshot = await db.collection('posts')
      .where('boardType', '==', State.boardType)
      .get()

    State.boardPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    // pinned first, then createdAt desc
    State.boardPosts.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()
      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()
      return tb - ta
    })

    applyBoardSearch()
  } catch (e) {
    console.error('Board load error:', e)
    showToast('게시글 로드 실패: ' + e.message, 'danger')
  }
}

// ===== 검색 필터 =====
function applyBoardSearch() {
  const field = document.getElementById('boardSearchField')?.value || 'all'
  const keyword = (document.getElementById('boardSearchInput')?.value || '').trim().toLowerCase()
  const catFilter = document.getElementById('boardCatFilter')?.value || ''

  let data = [...State.boardPosts]

  if (catFilter) {
    data = data.filter(p => p.category === catFilter)
  }

  if (keyword) {
    data = data.filter(p => {
      if (field === 'title') return (p.title || '').toLowerCase().includes(keyword)
      if (field === 'content') return (p.content || '').toLowerCase().includes(keyword)
      if (field === 'author') return (p.authorName || '').toLowerCase().includes(keyword)
      return (p.title || '').toLowerCase().includes(keyword) ||
             (p.content || '').toLowerCase().includes(keyword) ||
             (p.authorName || '').toLowerCase().includes(keyword)
    })
  }

  State.boardFiltered = data
  State.boardPage = 1
  renderBoardList()
}

window.searchBoard = function() { applyBoardSearch() }
window.resetBoardSearch = function() {
  const input = document.getElementById('boardSearchInput')
  if (input) input.value = ''
  const field = document.getElementById('boardSearchField')
  if (field) field.value = 'all'
  const cat = document.getElementById('boardCatFilter')
  if (cat) cat.value = ''
  applyBoardSearch()
}

// ===== 목록 렌더 =====
function renderBoardList() {
  const data = State.boardFiltered || State.boardPosts
  const ps = State.boardPageSize
  const page = State.boardPage

  // 분류 필터 select 동적 채우기
  const catFilter = document.getElementById('boardCatFilter')
  if (catFilter) {
    const cats = BOARD_CATS[State.boardType] || []
    const cur = catFilter.value
    catFilter.innerHTML = '<option value="">전체 분류</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('')
    if (cats.includes(cur)) catFilter.value = cur
  }

  // 글쓰기 버튼 텍스트
  const writeBtn = document.getElementById('boardWriteBtn')
  if (writeBtn) writeBtn.textContent = State.boardType === 'notice' ? '공지 작성' : '글쓰기'

  const pinned = data.filter(p => p.pinned)
  const unpinned = data.filter(p => !p.pinned)

  const countEl = document.getElementById('boardCount')
  if (countEl) countEl.textContent = '총 ' + data.length + '건'

  const start = (page - 1) * ps
  const pageData = unpinned.slice(start, start + ps)

  const tbody = document.getElementById('boardTableBody')
  if (!tbody) return

  if (!pinned.length && !pageData.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="brd-empty">게시글이 없습니다.</td></tr>'
    renderBoardPagination(unpinned.length)
    return
  }

  let html = ''
  pinned.forEach(p => { html += buildBoardRow(p, true) })
  pageData.forEach((p, i) => {
    const no = unpinned.length - start - i
    html += buildBoardRow(p, false, no)
  })
  tbody.innerHTML = html
  renderBoardPagination(unpinned.length)
}

function buildBoardRow(post, isPinned, no) {
  const ts = post.createdAt?.toDate ? post.createdAt.toDate() : new Date(post.createdAt)
  const dateStr = ts.toISOString().slice(0, 10)
  const isNew = (Date.now() - ts.getTime()) < 24 * 60 * 60 * 1000
  const catClass = getCategoryClass(post.category)
  const hasAttach = post.attachments && post.attachments.length > 0
  const rowClass = isPinned ? ' brd-row-pinned' : ''

  return `<tr class="brd-row${rowClass}" onclick="openBoardPost('${post.id}')">
    <td class="brd-td-no">${isPinned ? '<span class="brd-pin-star">&#9733;</span>' : (no || '')}</td>
    <td class="brd-td-cat"><span class="brd-cat ${catClass}">${esc(post.category)}</span></td>
    <td class="brd-td-title">
      <span class="brd-title-text">${esc(post.title)}</span>${isNew ? '<span class="brd-new">N</span>' : ''}${post.commentCount > 0 ? '<span class="brd-cmt-count">[' + post.commentCount + ']</span>' : ''}
    </td>
    <td class="brd-td-center">${esc(post.authorName)}</td>
    <td class="brd-td-center brd-td-date">${dateStr}</td>
    <td class="brd-td-center brd-td-muted">${post.views || 0}</td>
    <td class="brd-td-center brd-td-muted">${hasAttach ? '<span class="brd-file-badge">' + post.attachments.length + '</span>' : ''}</td>
  </tr>`
}

// ===== 페이지네이션 =====
function renderBoardPagination(total) {
  const container = document.getElementById('boardPagination')
  if (!container) return
  const ps = State.boardPageSize
  if (ps <= 0 || total <= ps) { container.innerHTML = ''; return }
  const totalPages = Math.ceil(total / ps)
  const page = State.boardPage
  let startP = Math.max(1, page - 4)
  let endP = Math.min(totalPages, startP + 9)
  if (endP - startP < 9) startP = Math.max(1, endP - 9)

  let html = '<div class="pagination">'
  html += `<button class="page-btn" onclick="goBoardPage(1)" ${page === 1 ? 'disabled' : ''}>&laquo;</button>`
  html += `<button class="page-btn" onclick="goBoardPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>&lsaquo;</button>`
  for (let p = startP; p <= endP; p++) {
    html += `<button class="page-btn ${p === page ? 'active' : ''}" onclick="goBoardPage(${p})">${p}</button>`
  }
  html += `<button class="page-btn" onclick="goBoardPage(${page + 1})" ${page === totalPages ? 'disabled' : ''}>&rsaquo;</button>`
  html += `<button class="page-btn" onclick="goBoardPage(${totalPages})" ${page === totalPages ? 'disabled' : ''}>&raquo;</button>`
  html += '</div>'
  container.innerHTML = html
}

window.goBoardPage = function(p) {
  const unpinned = (State.boardFiltered || State.boardPosts).filter(x => !x.pinned)
  const totalPages = Math.ceil(unpinned.length / State.boardPageSize)
  if (p < 1 || p > totalPages) return
  State.boardPage = p
  renderBoardList()
}

window.changeBoardPageSize = function() {
  State.boardPageSize = Number(document.getElementById('boardPageSize')?.value || 20)
  State.boardPage = 1
  renderBoardList()
}

// ===== 상세 보기 =====
window.openBoardPost = async function(postId) {
  if (!db) return
  try {
    const doc = await db.collection('posts').doc(postId).get()
    if (!doc.exists) { showToast('게시글을 찾을 수 없습니다.', 'warning'); return }

    const post = { id: doc.id, ...doc.data() }

    // 조회수 증가
    db.collection('posts').doc(postId).update({
      views: (post.views || 0) + 1
    }).catch(() => {})
    post.views = (post.views || 0) + 1

    State.currentPost = post
    renderBoardDetail(post)
    showBoardView('detail')
    history.pushState({ boardDetail: postId }, '', '#board/post/' + postId)
    loadComments('board', postId)
  } catch (e) {
    showToast('게시글 로드 실패: ' + e.message, 'danger')
  }
}

function renderBoardDetail(post) {
  const el = document.getElementById('boardDetailView')
  if (!el) return

  const ts = post.createdAt?.toDate ? post.createdAt.toDate() : new Date(post.createdAt)
  const dateStr = ts.toISOString().slice(0, 16).replace('T', ' ')
  const catClass = getCategoryClass(post.category)
  const canEdit = (auth?.currentUser?.uid === post.authorUid) || (State.currentUser && State.currentUser.grade >= 3)

  // 수정일
  let editedStr = ''
  if (post.updatedAt) {
    const ut = post.updatedAt?.toDate ? post.updatedAt.toDate() : new Date(post.updatedAt)
    const ct = ts.getTime()
    if (ut.getTime() - ct > 60000) {
      editedStr = `<span class="brd-detail-meta-item">수정일 ${ut.toISOString().slice(0, 16).replace('T', ' ')}</span>`
    }
  }

  // 첨부파일
  let attachHtml = ''
  if (post.attachments && post.attachments.length) {
    attachHtml = `<div class="brd-detail-attach">
      <div class="brd-detail-attach-title">첨부파일 (${post.attachments.length})</div>
      ${post.attachments.map((a, i) => {
        const sizeKB = Math.round((a.size || 0) / 1024)
        return `<div class="brd-detail-attach-item" onclick="downloadAttachment(${i})">
          <span class="brd-detail-attach-name">${esc(a.name)}</span>
          <span class="brd-detail-attach-size">${sizeKB}KB</span>
        </div>`
      }).join('')}
    </div>`
  }

  // 이전/다음 글
  const allPosts = State.boardFiltered || State.boardPosts
  const idx = allPosts.findIndex(p => p.id === post.id)
  const prev = idx < allPosts.length - 1 ? allPosts[idx + 1] : null
  const next = idx > 0 ? allPosts[idx - 1] : null

  let navHtml = '<div class="brd-nav">'
  navHtml += `<div class="brd-nav-item${next ? '' : ' brd-nav-empty'}" ${next ? `onclick="openBoardPost('${next.id}')"` : ''}>
    <span class="brd-nav-label">&#9650; 다음글</span>
    <span class="brd-nav-title">${next ? esc(next.title) : '다음글이 없습니다.'}</span>
  </div>`
  navHtml += `<div class="brd-nav-item${prev ? '' : ' brd-nav-empty'}" ${prev ? `onclick="openBoardPost('${prev.id}')"` : ''}>
    <span class="brd-nav-label">&#9660; 이전글</span>
    <span class="brd-nav-title">${prev ? esc(prev.title) : '이전글이 없습니다.'}</span>
  </div>`
  navHtml += '</div>'

  el.innerHTML = `
    <div class="brd-detail-card">
      <div class="brd-detail-head">
        <div class="brd-detail-head-top">
          <span class="brd-cat ${catClass}">${esc(post.category)}</span>
          ${post.pinned ? '<span class="brd-detail-pin">&#9733; 고정</span>' : ''}
          ${post.important ? '<span class="brd-detail-imp">&#9888; 중요</span>' : ''}
        </div>
        <div class="brd-detail-title">${esc(post.title)}</div>
        <div class="brd-detail-meta">
          <span class="brd-detail-meta-item">${esc(post.authorName)}</span>
          <span class="brd-detail-meta-item">${dateStr}</span>
          <span class="brd-detail-meta-item">조회 ${post.views || 0}</span>
          ${editedStr}
        </div>
      </div>
      <div class="brd-detail-body">${esc(post.content)}</div>
      ${attachHtml}
      <div class="brd-detail-actions">
        <div class="brd-detail-actions-left">
          ${canEdit ? `
            <button class="brd-btn brd-btn-outline" onclick="openBoardWrite('${post.id}')">수정</button>
            <button class="brd-btn brd-btn-danger" onclick="deleteBoardPost('${post.id}')">삭제</button>
          ` : ''}
        </div>
        <button class="brd-btn brd-btn-list" onclick="boardBackToList()">목록으로</button>
      </div>
    </div>
    ${navHtml}
    <div style="margin-top:16px">
      ${buildCommentSection('board', post.id)}
    </div>`
}

window.downloadAttachment = function(idx) {
  const post = State.currentPost
  if (!post || !post.attachments || !post.attachments[idx]) return
  const a = post.attachments[idx]
  const link = document.createElement('a')
  link.href = a.data
  link.download = a.name
  link.click()
}

// ===== 글쓰기/수정 =====
window.openBoardWrite = function(editPostId) {
  State.editingPostId = editPostId || null
  showBoardView('write')

  const cats = BOARD_CATS[State.boardType] || []
  const isEdit = editPostId && State.currentPost
  const p = isEdit ? State.currentPost : null
  const showPin = State.boardType === 'notice' && State.currentUser && State.currentUser.grade >= 3

  const el = document.getElementById('boardWriteView')
  el.innerHTML = `
    <div class="brd-write-card">
      <div class="brd-write-header">
        <h3 class="brd-write-heading">${isEdit ? '게시글 수정' : '게시글 작성'}</h3>
        <div class="brd-write-options" ${showPin ? '' : 'style="display:none"'} id="boardPinWrap">
          <label class="brd-write-check"><input type="checkbox" id="boardWritePin" ${p && p.pinned ? 'checked' : ''}> 상단 고정</label>
          <label class="brd-write-check"><input type="checkbox" id="boardWriteImportant" ${p && p.important ? 'checked' : ''}> 중요 표시</label>
        </div>
      </div>
      <div class="brd-write-grid">
        <select id="boardWriteCat" class="brd-write-cat">
          ${cats.map(c => `<option value="${c}" ${p && p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <input type="text" id="boardWriteTitle" class="brd-write-title" placeholder="제목을 입력하세요" value="${p ? esc(p.title) : ''}">
      </div>
      <div class="brd-write-toolbar">
        <button type="button" class="brd-tb-btn" onclick="boardFmt('bold')" title="굵게"><b>B</b></button>
        <button type="button" class="brd-tb-btn" onclick="boardFmt('italic')" title="기울임"><i>I</i></button>
        <button type="button" class="brd-tb-btn" onclick="boardFmt('underline')" title="밑줄"><u>U</u></button>
        <span class="brd-tb-sep"></span>
        <button type="button" class="brd-tb-btn" onclick="boardFmt('list')" title="목록">&#8226; 목록</button>
      </div>
      <textarea id="boardWriteContent" class="brd-write-content" placeholder="내용을 입력하세요">${p ? esc(p.content) : ''}</textarea>
      <div class="brd-write-attach-zone" id="boardDropZone" onclick="document.getElementById('boardFileInput').click()">
        <input type="file" id="boardFileInput" multiple onchange="handleBoardFileSelect(this)" style="display:none">
        <div class="brd-write-attach-text">클릭하여 파일 선택 또는 드래그 앤 드롭</div>
        <div class="brd-write-attach-hint">최대 5개, 10MB/개</div>
      </div>
      <div id="boardAttachList" class="brd-attach-list"></div>
      <div class="brd-write-footer">
        <button class="brd-btn brd-btn-outline" onclick="cancelBoardWrite()">취소</button>
        <button class="brd-btn brd-btn-gold" onclick="submitBoardPost()">등록</button>
      </div>
    </div>`

  // 드래그앤드롭
  const zone = document.getElementById('boardDropZone')
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('brd-drop-hover') })
  zone.addEventListener('dragleave', () => zone.classList.remove('brd-drop-hover'))
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('brd-drop-hover')
    if (e.dataTransfer.files.length) {
      const inp = document.getElementById('boardFileInput')
      inp.files = e.dataTransfer.files
      handleBoardFileSelect(inp)
    }
  })

  if (isEdit) {
    State.boardAttachments = p.attachments ? [...p.attachments] : []
  } else {
    State.boardAttachments = []
  }
  renderBoardAttachments()
}

// 간단 서식 삽입
window.boardFmt = function(type) {
  const ta = document.getElementById('boardWriteContent')
  if (!ta) return
  const start = ta.selectionStart, end = ta.selectionEnd
  const sel = ta.value.slice(start, end)
  let insert = ''
  if (type === 'bold') insert = `**${sel || '텍스트'}**`
  else if (type === 'italic') insert = `_${sel || '텍스트'}_`
  else if (type === 'underline') insert = `__${sel || '텍스트'}__`
  else if (type === 'list') insert = `\n- ${sel || '항목'}`
  ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end)
  ta.focus()
  ta.selectionStart = ta.selectionEnd = start + insert.length
}

window.cancelBoardWrite = function() {
  if (State.editingPostId && State.currentPost) {
    renderBoardDetail(State.currentPost)
    showBoardView('detail')
  } else {
    showBoardView('list')
  }
}

window.submitBoardPost = async function() {
  const title = document.getElementById('boardWriteTitle').value.trim()
  const content = document.getElementById('boardWriteContent').value.trim()
  const category = document.getElementById('boardWriteCat').value
  const pinned = document.getElementById('boardWritePin')?.checked || false
  const important = document.getElementById('boardWriteImportant')?.checked || false

  if (!title) { showToast('제목을 입력해주세요.', 'warning'); return }
  if (!content) { showToast('내용을 입력해주세요.', 'warning'); return }
  if (!auth?.currentUser || !State.currentUser) { showToast('로그인이 필요합니다.', 'warning'); return }

  const postData = {
    boardType: State.boardType,
    category,
    title,
    content,
    pinned,
    important,
    attachments: State.boardAttachments || [],
    updatedAt: new Date()
  }

  try {
    if (State.editingPostId) {
      await db.collection('posts').doc(State.editingPostId).update(postData)
      showToast('게시글이 수정되었습니다.', 'success')
      logActivity('update', '게시판', `게시글 수정: ${title}`)
    } else {
      postData.authorUid = auth.currentUser.uid
      postData.authorName = State.currentUser.name
      postData.authorGrade = State.currentUser.grade
      postData.views = 0
      postData.commentCount = 0
      postData.createdAt = new Date()
      await db.collection('posts').add(postData)
      showToast('게시글이 등록되었습니다.', 'success')
      logActivity('create', '게시판', `게시글 등록: ${title}`)
      if (State.boardType === 'notice') {
        addNotification('board_notice', `새 공지: ${title}`, `${State.currentUser?.name || ''} 님이 공지사항을 등록했습니다.`, '#board')
      }
    }
    loadBoardPosts()
  } catch (e) {
    showToast('저장 실패: ' + e.message, 'danger')
  }
}

// ===== 삭제 =====
window.deleteBoardPost = async function(postId) {
  const ok = await korConfirm('게시글을 삭제하시겠습니까?\n관련 댓글도 함께 삭제됩니다.')
  if (!ok) return

  try {
    const post = State.currentPost
    await db.collection('posts').doc(postId).delete()

    // 관련 댓글 삭제
    try {
      const commentSnap = await db.collection('comments')
        .where('modalType', '==', 'board')
        .where('targetId', '==', postId)
        .get()
      const batch = db.batch()
      commentSnap.docs.forEach(doc => batch.delete(doc.ref))
      await batch.commit()
    } catch (ce) { console.warn('댓글 삭제 실패:', ce) }

    showToast('게시글이 삭제되었습니다.', 'success')
    logActivity('delete', '게시판', `게시글 삭제: ${post ? post.title : postId}`)
    loadBoardPosts()
  } catch (e) {
    showToast('삭제 실패: ' + e.message, 'danger')
  }
}

// ===== 첨부파일 =====

window.handleBoardFileSelect = function(input) {
  const files = Array.from(input.files)
  if (State.boardAttachments.length + files.length > 5) {
    showToast('첨부파일은 최대 5개까지 가능합니다.', 'warning')
    return
  }
  files.forEach(file => {
    if (file.size > 10 * 1024 * 1024) {
      showToast(file.name + ' — 10MB 초과', 'warning')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      State.boardAttachments.push({ name: file.name, size: file.size, data: reader.result })
      renderBoardAttachments()
    }
    reader.readAsDataURL(file)
  })
  input.value = ''
}

window.removeBoardAttachment = function(idx) {
  State.boardAttachments.splice(idx, 1)
  renderBoardAttachments()
}

function renderBoardAttachments() {
  const el = document.getElementById('boardAttachList')
  if (!el) return
  if (!State.boardAttachments.length) { el.innerHTML = ''; return }
  el.innerHTML = State.boardAttachments.map((a, i) => {
    const sizeKB = Math.round(a.size / 1024)
    return `<div class="brd-attach-file">
      <span class="brd-attach-name">${esc(a.name)}</span>
      <span class="brd-attach-size">${sizeKB}KB</span>
      <button type="button" class="brd-attach-remove" onclick="removeBoardAttachment(${i})">&times;</button>
    </div>`
  }).join('')
}
