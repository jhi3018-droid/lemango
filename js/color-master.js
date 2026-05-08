// =============================================
// ===== 색상 마스터 (Color Master System) =====
// =============================================
// 111개 표준 색상 + 카테고리 + HEX + 검색 가능 드롭다운
// 데이터 저장: localStorage('lemango_color_masters_v1') + Firestore('sharedData/colorMasters')
// 사용처: 상품조회/신규기획 등록·수정 모달의 색상 입력, 설정 탭 색상 관리

const COLOR_CATEGORIES = [
  '무채색', '베이지/브라운', '레드', '오렌지/옐로우', '그린',
  '블루', '퍼플/핑크', '네온/형광', '메탈릭/특수', '패턴/믹스'
]

// Default seed — 111 colors. id = code (uppercase, unique). hex omitted for patterns.
const DEFAULT_COLOR_MASTERS = [
  // 무채색 (8) — sortOrder 1~99
  { id:'WH', nameKr:'화이트', nameEn:'White', code:'WH', hex:'#FFFFFF', category:'무채색', isPattern:false, sortOrder:10, active:true },
  { id:'OW', nameKr:'오프화이트', nameEn:'Off White', code:'OW', hex:'#FAF9F6', category:'무채색', isPattern:false, sortOrder:20, active:true },
  { id:'IV', nameKr:'아이보리', nameEn:'Ivory', code:'IV', hex:'#FFFFF0', category:'무채색', isPattern:false, sortOrder:30, active:true },
  { id:'LG', nameKr:'라이트그레이', nameEn:'Light Gray', code:'LG', hex:'#D3D3D3', category:'무채색', isPattern:false, sortOrder:40, active:true },
  { id:'GY', nameKr:'그레이', nameEn:'Gray', code:'GY', hex:'#808080', category:'무채색', isPattern:false, sortOrder:50, active:true },
  { id:'CH', nameKr:'차콜', nameEn:'Charcoal', code:'CH', hex:'#36454F', category:'무채색', isPattern:false, sortOrder:60, active:true },
  { id:'DG', nameKr:'다크그레이', nameEn:'Dark Gray', code:'DG', hex:'#404040', category:'무채색', isPattern:false, sortOrder:70, active:true },
  { id:'BK', nameKr:'블랙', nameEn:'Black', code:'BK', hex:'#000000', category:'무채색', isPattern:false, sortOrder:80, active:true },
  // 베이지/브라운 (17) — sortOrder 100~199
  { id:'CR', nameKr:'크림', nameEn:'Cream', code:'CR', hex:'#FFFDD0', category:'베이지/브라운', isPattern:false, sortOrder:100, active:true },
  { id:'BE', nameKr:'베이지', nameEn:'Beige', code:'BE', hex:'#F5F5DC', category:'베이지/브라운', isPattern:false, sortOrder:110, active:true },
  { id:'OA', nameKr:'오트밀', nameEn:'Oatmeal', code:'OA', hex:'#DDD5C7', category:'베이지/브라운', isPattern:false, sortOrder:120, active:true },
  { id:'EC', nameKr:'에크루', nameEn:'Ecru', code:'EC', hex:'#C2B280', category:'베이지/브라운', isPattern:false, sortOrder:130, active:true },
  { id:'SD', nameKr:'샌드', nameEn:'Sand', code:'SD', hex:'#C2B280', category:'베이지/브라운', isPattern:false, sortOrder:140, active:true },
  { id:'CM', nameKr:'카멜', nameEn:'Camel', code:'CM', hex:'#C19A6B', category:'베이지/브라운', isPattern:false, sortOrder:150, active:true },
  { id:'KH', nameKr:'카키', nameEn:'Khaki', code:'KH', hex:'#8B7E5A', category:'베이지/브라운', isPattern:false, sortOrder:160, active:true },
  { id:'TN', nameKr:'탄', nameEn:'Tan', code:'TN', hex:'#D2B48C', category:'베이지/브라운', isPattern:false, sortOrder:170, active:true },
  { id:'TP', nameKr:'토프', nameEn:'Taupe', code:'TP', hex:'#8B7D6B', category:'베이지/브라운', isPattern:false, sortOrder:180, active:true },
  { id:'GZ', nameKr:'그레이지', nameEn:'Greige', code:'GZ', hex:'#B8AB99', category:'베이지/브라운', isPattern:false, sortOrder:185, active:true },
  { id:'TC', nameKr:'테라코타', nameEn:'Terracotta', code:'TC', hex:'#E2725B', category:'베이지/브라운', isPattern:false, sortOrder:190, active:true },
  { id:'RU', nameKr:'러스트', nameEn:'Rust', code:'RU', hex:'#B7410E', category:'베이지/브라운', isPattern:false, sortOrder:195, active:true },
  { id:'BR', nameKr:'브라운', nameEn:'Brown', code:'BR', hex:'#8B4513', category:'베이지/브라운', isPattern:false, sortOrder:196, active:true },
  { id:'DB', nameKr:'다크브라운', nameEn:'Dark Brown', code:'DB', hex:'#4A2C1A', category:'베이지/브라운', isPattern:false, sortOrder:197, active:true },
  { id:'MC', nameKr:'모카', nameEn:'Mocha', code:'MC', hex:'#6F4E37', category:'베이지/브라운', isPattern:false, sortOrder:198, active:true },
  { id:'CO', nameKr:'초콜릿', nameEn:'Chocolate', code:'CO', hex:'#3D2B1F', category:'베이지/브라운', isPattern:false, sortOrder:199, active:true },
  { id:'MR', nameKr:'마룬', nameEn:'Maroon', code:'MR', hex:'#800000', category:'베이지/브라운', isPattern:false, sortOrder:199.5, active:true },
  // 레드 (9) — 200~299
  { id:'HP', nameKr:'핫핑크', nameEn:'Hot Pink', code:'HP', hex:'#FF69B4', category:'레드', isPattern:false, sortOrder:200, active:true },
  { id:'PK', nameKr:'핑크', nameEn:'Pink', code:'PK', hex:'#FFC0CB', category:'레드', isPattern:false, sortOrder:210, active:true },
  { id:'LP', nameKr:'라이트핑크', nameEn:'Light Pink', code:'LP', hex:'#FFB6C1', category:'레드', isPattern:false, sortOrder:220, active:true },
  { id:'CL', nameKr:'코랄', nameEn:'Coral', code:'CL', hex:'#FF7F50', category:'레드', isPattern:false, sortOrder:230, active:true },
  { id:'SM', nameKr:'살몬', nameEn:'Salmon', code:'SM', hex:'#FA8072', category:'레드', isPattern:false, sortOrder:240, active:true },
  { id:'CY', nameKr:'체리', nameEn:'Cherry', code:'CY', hex:'#DE3163', category:'레드', isPattern:false, sortOrder:250, active:true },
  { id:'RD', nameKr:'레드', nameEn:'Red', code:'RD', hex:'#DC143C', category:'레드', isPattern:false, sortOrder:260, active:true },
  { id:'DR', nameKr:'다크레드', nameEn:'Dark Red', code:'DR', hex:'#8B0000', category:'레드', isPattern:false, sortOrder:270, active:true },
  { id:'WN', nameKr:'와인', nameEn:'Wine', code:'WN', hex:'#722F37', category:'레드', isPattern:false, sortOrder:280, active:true },
  // 오렌지/옐로우 (9) — 300~399
  { id:'LO', nameKr:'라이트오렌지', nameEn:'Light Orange', code:'LO', hex:'#FFB347', category:'오렌지/옐로우', isPattern:false, sortOrder:300, active:true },
  { id:'OR', nameKr:'오렌지', nameEn:'Orange', code:'OR', hex:'#FFA500', category:'오렌지/옐로우', isPattern:false, sortOrder:310, active:true },
  { id:'DO', nameKr:'다크오렌지', nameEn:'Dark Orange', code:'DO', hex:'#FF8C00', category:'오렌지/옐로우', isPattern:false, sortOrder:320, active:true },
  { id:'FM', nameKr:'플레임', nameEn:'Flame', code:'FM', hex:'#E25822', category:'오렌지/옐로우', isPattern:false, sortOrder:330, active:true },
  { id:'MD', nameKr:'머스타드', nameEn:'Mustard', code:'MD', hex:'#FFDB58', category:'오렌지/옐로우', isPattern:false, sortOrder:340, active:true },
  { id:'YL', nameKr:'옐로우', nameEn:'Yellow', code:'YL', hex:'#FFD700', category:'오렌지/옐로우', isPattern:false, sortOrder:350, active:true },
  { id:'LY', nameKr:'라이트옐로우', nameEn:'Light Yellow', code:'LY', hex:'#FFFFE0', category:'오렌지/옐로우', isPattern:false, sortOrder:360, active:true },
  { id:'LE', nameKr:'레몬', nameEn:'Lemon', code:'LE', hex:'#FFF44F', category:'오렌지/옐로우', isPattern:false, sortOrder:370, active:true },
  { id:'BT', nameKr:'버터', nameEn:'Butter', code:'BT', hex:'#FFFD8C', category:'오렌지/옐로우', isPattern:false, sortOrder:380, active:true },
  // 그린 (13) — 400~499 (Light Green code = LM to avoid LG conflict)
  { id:'LM', nameKr:'라이트그린', nameEn:'Light Green', code:'LM', hex:'#90EE90', category:'그린', isPattern:false, sortOrder:400, active:true },
  { id:'MT', nameKr:'민트', nameEn:'Mint', code:'MT', hex:'#98FF98', category:'그린', isPattern:false, sortOrder:410, active:true },
  { id:'PI', nameKr:'피스타치오', nameEn:'Pistachio', code:'PI', hex:'#93C572', category:'그린', isPattern:false, sortOrder:420, active:true },
  { id:'AL', nameKr:'애시드라임', nameEn:'Acid Lime', code:'AL', hex:'#C7E700', category:'그린', isPattern:false, sortOrder:430, active:true },
  { id:'NG', nameKr:'네온그린', nameEn:'Neon Green', code:'NG', hex:'#39FF14', category:'그린', isPattern:false, sortOrder:440, active:true },
  { id:'SG', nameKr:'세이지', nameEn:'Sage', code:'SG', hex:'#9CAF88', category:'그린', isPattern:false, sortOrder:450, active:true },
  { id:'OL', nameKr:'올리브', nameEn:'Olive', code:'OL', hex:'#808000', category:'그린', isPattern:false, sortOrder:460, active:true },
  { id:'GN', nameKr:'그린', nameEn:'Green', code:'GN', hex:'#228B22', category:'그린', isPattern:false, sortOrder:470, active:true },
  { id:'KG', nameKr:'카키그린', nameEn:'Khaki Green', code:'KG', hex:'#6B7956', category:'그린', isPattern:false, sortOrder:475, active:true },
  { id:'FR', nameKr:'포레스트', nameEn:'Forest', code:'FR', hex:'#0B6623', category:'그린', isPattern:false, sortOrder:480, active:true },
  { id:'DK', nameKr:'다크그린', nameEn:'Dark Green', code:'DK', hex:'#006400', category:'그린', isPattern:false, sortOrder:485, active:true },
  { id:'EM', nameKr:'에메랄드', nameEn:'Emerald', code:'EM', hex:'#50C878', category:'그린', isPattern:false, sortOrder:490, active:true },
  { id:'TL', nameKr:'틸', nameEn:'Teal', code:'TL', hex:'#008080', category:'그린', isPattern:false, sortOrder:495, active:true },
  // 블루 (15) — 500~599
  { id:'LB', nameKr:'라이트블루', nameEn:'Light Blue', code:'LB', hex:'#ADD8E6', category:'블루', isPattern:false, sortOrder:500, active:true },
  { id:'SB', nameKr:'스카이블루', nameEn:'Sky Blue', code:'SB', hex:'#87CEEB', category:'블루', isPattern:false, sortOrder:510, active:true },
  { id:'BB', nameKr:'베이비블루', nameEn:'Baby Blue', code:'BB', hex:'#89CFF0', category:'블루', isPattern:false, sortOrder:520, active:true },
  { id:'SF', nameKr:'시폼', nameEn:'Seafoam', code:'SF', hex:'#93E9BE', category:'블루', isPattern:false, sortOrder:530, active:true },
  { id:'AQ', nameKr:'아쿠아', nameEn:'Aqua', code:'AQ', hex:'#00FFFF', category:'블루', isPattern:false, sortOrder:540, active:true },
  { id:'BL', nameKr:'블루', nameEn:'Blue', code:'BL', hex:'#0000FF', category:'블루', isPattern:false, sortOrder:550, active:true },
  { id:'CB', nameKr:'코발트', nameEn:'Cobalt', code:'CB', hex:'#0047AB', category:'블루', isPattern:false, sortOrder:560, active:true },
  { id:'RB', nameKr:'로얄블루', nameEn:'Royal Blue', code:'RB', hex:'#4169E1', category:'블루', isPattern:false, sortOrder:570, active:true },
  { id:'NA', nameKr:'네이비', nameEn:'Navy', code:'NA', hex:'#000080', category:'블루', isPattern:false, sortOrder:580, active:true },
  { id:'NV', nameKr:'다크네이비', nameEn:'Dark Navy', code:'NV', hex:'#00004B', category:'블루', isPattern:false, sortOrder:585, active:true },
  { id:'DM', nameKr:'데님', nameEn:'Denim', code:'DM', hex:'#1560BD', category:'블루', isPattern:false, sortOrder:590, active:true },
  { id:'IN', nameKr:'인디고', nameEn:'Indigo', code:'IN', hex:'#4B0082', category:'블루', isPattern:false, sortOrder:592, active:true },
  { id:'TQ', nameKr:'터쿼이즈', nameEn:'Turquoise', code:'TQ', hex:'#40E0D0', category:'블루', isPattern:false, sortOrder:594, active:true },
  { id:'PC', nameKr:'퍼시픽', nameEn:'Pacific', code:'PC', hex:'#1CA9C9', category:'블루', isPattern:false, sortOrder:596, active:true },
  { id:'OC', nameKr:'오션', nameEn:'Ocean', code:'OC', hex:'#4F8BB3', category:'블루', isPattern:false, sortOrder:598, active:true },
  // 퍼플/핑크 (10) — 600~699 (DT2 to avoid Dot/DT conflict... wait, Dusty Pink=DT in source, Dot=DT2 in patterns)
  { id:'LV', nameKr:'라벤더', nameEn:'Lavender', code:'LV', hex:'#E6E6FA', category:'퍼플/핑크', isPattern:false, sortOrder:600, active:true },
  { id:'LI', nameKr:'라일락', nameEn:'Lilac', code:'LI', hex:'#C8A2C8', category:'퍼플/핑크', isPattern:false, sortOrder:610, active:true },
  { id:'DT', nameKr:'더스티핑크', nameEn:'Dusty Pink', code:'DT', hex:'#D5A6A6', category:'퍼플/핑크', isPattern:false, sortOrder:620, active:true },
  { id:'MV', nameKr:'모브', nameEn:'Mauve', code:'MV', hex:'#E0B0FF', category:'퍼플/핑크', isPattern:false, sortOrder:630, active:true },
  { id:'NP', nameKr:'네온핑크', nameEn:'Neon Pink', code:'NP', hex:'#FF6EC7', category:'퍼플/핑크', isPattern:false, sortOrder:640, active:true },
  { id:'PR', nameKr:'퍼플', nameEn:'Purple', code:'PR', hex:'#800080', category:'퍼플/핑크', isPattern:false, sortOrder:650, active:true },
  { id:'DP', nameKr:'다크퍼플', nameEn:'Dark Purple', code:'DP', hex:'#301934', category:'퍼플/핑크', isPattern:false, sortOrder:660, active:true },
  { id:'MG', nameKr:'마젠타', nameEn:'Magenta', code:'MG', hex:'#FF00FF', category:'퍼플/핑크', isPattern:false, sortOrder:670, active:true },
  { id:'BG', nameKr:'버건디', nameEn:'Burgundy', code:'BG', hex:'#800020', category:'퍼플/핑크', isPattern:false, sortOrder:680, active:true },
  { id:'PL', nameKr:'플럼', nameEn:'Plum', code:'PL', hex:'#8E4585', category:'퍼플/핑크', isPattern:false, sortOrder:690, active:true },
  // 네온/형광 (1) — 700~799
  { id:'NY', nameKr:'네온옐로우', nameEn:'Neon Yellow', code:'NY', hex:'#FFFF33', category:'네온/형광', isPattern:false, sortOrder:700, active:true },
  // 메탈릭/특수 (8) — 800~899
  { id:'SL', nameKr:'실버', nameEn:'Silver', code:'SL', hex:'#C0C0C0', category:'메탈릭/특수', isPattern:false, sortOrder:800, active:true },
  { id:'GD', nameKr:'골드', nameEn:'Gold', code:'GD', hex:'#D4AF37', category:'메탈릭/특수', isPattern:false, sortOrder:810, active:true },
  { id:'RG', nameKr:'로즈골드', nameEn:'Rose Gold', code:'RG', hex:'#B76E79', category:'메탈릭/특수', isPattern:false, sortOrder:820, active:true },
  { id:'BZ', nameKr:'브론즈', nameEn:'Bronze', code:'BZ', hex:'#CD7F32', category:'메탈릭/특수', isPattern:false, sortOrder:830, active:true },
  { id:'GM', nameKr:'건메탈', nameEn:'Gunmetal', code:'GM', hex:'#2A3439', category:'메탈릭/특수', isPattern:false, sortOrder:840, active:true },
  { id:'GT', nameKr:'글리터', nameEn:'Glitter', code:'GT', hex:'#E5E4E2', category:'메탈릭/특수', isPattern:false, sortOrder:850, active:true },
  { id:'PE', nameKr:'펄', nameEn:'Pearl', code:'PE', hex:'#EAE0C8', category:'메탈릭/특수', isPattern:false, sortOrder:860, active:true },
  { id:'SH', nameKr:'시어', nameEn:'Sheer', code:'SH', hex:'#F0F8FF', category:'메탈릭/특수', isPattern:false, sortOrder:870, active:true },
  // 패턴/믹스 (21) — 900~999
  { id:'MX', nameKr:'믹스', nameEn:'Mix', code:'MX', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:900, active:true },
  { id:'MU', nameKr:'멀티', nameEn:'Multi', code:'MU', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:910, active:true },
  { id:'GA', nameKr:'그라데이션', nameEn:'Gradient', code:'GA', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:920, active:true },
  { id:'CK', nameKr:'체크', nameEn:'Check', code:'CK', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:925, active:true },
  { id:'GG', nameKr:'깅엄체크', nameEn:'Gingham', code:'GG', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:930, active:true },
  { id:'WP', nameKr:'윈도우페인', nameEn:'Windowpane', code:'WP', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:935, active:true },
  { id:'HT', nameKr:'하운드투스', nameEn:'Houndstooth', code:'HT', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:940, active:true },
  { id:'HB', nameKr:'헤링본', nameEn:'Herringbone', code:'HB', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:945, active:true },
  { id:'ST', nameKr:'스트라이프', nameEn:'Stripe', code:'ST', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:950, active:true },
  { id:'PS', nameKr:'핀스트라이프', nameEn:'Pinstripe', code:'PS', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:955, active:true },
  { id:'DT2', nameKr:'도트', nameEn:'Dot', code:'DT2', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:960, active:true },
  { id:'FL', nameKr:'플로럴', nameEn:'Floral', code:'FL', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:965, active:true },
  { id:'PA', nameKr:'페이즐리', nameEn:'Paisley', code:'PA', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:970, active:true },
  { id:'AN', nameKr:'애니멀', nameEn:'Animal', code:'AN', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:975, active:true },
  { id:'CA', nameKr:'카모', nameEn:'Camo', code:'CA', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:980, active:true },
  { id:'TD', nameKr:'타이다이', nameEn:'Tie Dye', code:'TD', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:985, active:true },
  { id:'PT', nameKr:'프린트', nameEn:'Print', code:'PT', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:990, active:true },
  { id:'TR', nameKr:'트로피컬', nameEn:'Tropical', code:'TR', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:993, active:true },
  { id:'HO', nameKr:'홀로그램', nameEn:'Hologram', code:'HO', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:996, active:true },
  { id:'ME', nameKr:'메탈릭', nameEn:'Metallic', code:'ME', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:998, active:true },
  { id:'WF', nameKr:'와플', nameEn:'Waffle', code:'WF', hex:'', category:'패턴/믹스', isPattern:true, sortOrder:999, active:true }
]

const COLOR_MASTERS_KEY = 'lemango_color_masters_v1'

let _colorMasters = (() => {
  try {
    const saved = localStorage.getItem(COLOR_MASTERS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length) return parsed
    }
  } catch {}
  return DEFAULT_COLOR_MASTERS.map(c => ({ ...c }))
})()

async function saveColorMasters() {
  try { localStorage.setItem(COLOR_MASTERS_KEY, JSON.stringify(_colorMasters)) } catch (e) { console.error(e) }
  if (typeof _fsSync !== 'function') return
  try {
    await _fsSync('colorMasters', _colorMasters)
    if (!window._lastSharedSaveTime) window._lastSharedSaveTime = {}
    window._lastSharedSaveTime['colorMasters'] = Date.now()
  } catch (e) {
    if (typeof _onSaveFailed === 'function') _onSaveFailed('saveColorMasters', e)
    else console.error('saveColorMasters failed:', e)
  }
}
window.saveColorMasters = saveColorMasters

// Idempotent seed — used by main.js init to ensure data exists; never overwrites
function seedColorMastersIfEmpty() {
  if (!Array.isArray(_colorMasters) || _colorMasters.length === 0) {
    _colorMasters = DEFAULT_COLOR_MASTERS.map(c => ({ ...c }))
    saveColorMasters().catch(e => console.error(e))
  }
}
window.seedColorMastersIfEmpty = seedColorMastersIfEmpty

// Lookup helpers
function getColorByCode(code) {
  if (!code) return null
  const c = String(code).trim().toUpperCase()
  return _colorMasters.find(x => String(x.code).toUpperCase() === c) || null
}
function getColorByNameKr(nameKr) {
  if (!nameKr) return null
  const n = String(nameKr).trim()
  return _colorMasters.find(x => x.nameKr === n) || null
}
function getColorByNameEn(nameEn) {
  if (!nameEn) return null
  const n = String(nameEn).trim().toLowerCase()
  return _colorMasters.find(x => x.nameEn.toLowerCase() === n) || null
}
function resolveColorMaster({ code, nameKr, nameEn }) {
  return getColorByCode(code) || getColorByNameKr(nameKr) || getColorByNameEn(nameEn) || null
}
window.getColorByCode = getColorByCode
window.getColorByNameKr = getColorByNameKr
window.resolveColorMaster = resolveColorMaster

// =============================================
// ===== Color Picker Component =====
// =============================================
// Markup pattern (per anchor):
// <div class="color-picker" data-anchor="<id>">
//   <div class="color-picker-display" tabindex="0" onclick="_cpOpen('<id>')">
//     <span class="color-picker-swatch" style="background:#XXX"></span>
//     <span class="color-picker-text">한글 - English (CODE)</span>
//     <span class="color-picker-caret">▾</span>
//   </div>
//   <div class="color-picker-dd" hidden>
//     <input class="color-picker-search" placeholder="한글/영문/코드 검색...">
//     <div class="color-picker-list">...grouped colors...</div>
//   </div>
//   <input type="hidden" class="color-picker-code" name="<id>_code">
//   <input type="hidden" class="color-picker-kr" name="<id>_kr">
//   <input type="hidden" class="color-picker-en" name="<id>_en">
// </div>

// Build color picker HTML for a given anchor id.
// initialValue: { nameKr, nameEn, code } (any subset; tries to resolve to master)
// opts: { krId, enId, codeId, dataPkey: {...}, dataKey: {...} }
//   - krId/enId/codeId: override default `<anchorId>_kr/_en/_code` for hidden input IDs (backward compat)
//   - dataPkey: adds data-pkey="..." attributes (plan modals use [data-pkey] save loop)
//   - dataKey:  adds data-key="..."  attributes (product detail modal uses [data-key] save loop)
function buildColorPickerHtml(anchorId, initialValue, opts) {
  initialValue = initialValue || {}
  opts = opts || {}
  const krId = opts.krId || (anchorId + '_kr')
  const enId = opts.enId || (anchorId + '_en')
  const codeId = opts.codeId || (anchorId + '_code')
  const dp = opts.dataPkey || {}
  const dk = opts.dataKey || {}
  const krAttrs = (dp.kr ? ` data-pkey="${dp.kr}"` : '') + (dk.kr ? ` data-key="${dk.kr}"` : '')
  const enAttrs = (dp.en ? ` data-pkey="${dp.en}"` : '') + (dk.en ? ` data-key="${dk.en}"` : '')
  const codeAttrs = (dp.code ? ` data-pkey="${dp.code}"` : '') + (dk.code ? ` data-key="${dk.code}"` : '')
  const m = resolveColorMaster(initialValue)
  let dispText = ''
  let dispSwatch = ''
  let isUnknown = false
  if (m) {
    dispText = `${m.nameKr} - ${m.nameEn} (${m.code})`
    dispSwatch = m.isPattern
      ? '<span class="cp-swatch cp-swatch-pattern">🎨</span>'
      : `<span class="cp-swatch" style="background:${m.hex || '#ccc'}"></span>`
  } else if (initialValue.nameKr || initialValue.nameEn) {
    dispText = initialValue.nameKr ? (initialValue.nameKr + (initialValue.nameEn ? ' - ' + initialValue.nameEn : '')) : initialValue.nameEn
    dispSwatch = '<span class="cp-swatch cp-swatch-unknown" title="마스터에 없는 색상">?</span>'
    isUnknown = true
  } else {
    dispText = '<span class="cp-placeholder">색상을 선택하세요</span>'
    dispSwatch = '<span class="cp-swatch cp-swatch-empty"></span>'
  }
  const wrapCls = isUnknown ? 'color-picker color-picker-unknown' : 'color-picker'
  return `<div class="${wrapCls}" data-anchor="${anchorId}">
    <div class="color-picker-display" tabindex="0" onclick="_cpToggle('${anchorId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();_cpToggle('${anchorId}')}">
      ${dispSwatch}
      <span class="color-picker-text">${dispText}</span>
      <span class="color-picker-caret">▾</span>
    </div>
    <div class="color-picker-dd" hidden>
      <input type="text" class="color-picker-search" placeholder="한글/영문/코드 검색..." oninput="_cpFilter('${anchorId}', this.value)" onkeydown="_cpKeyNav('${anchorId}', event)" />
      <div class="color-picker-list" id="cpList_${anchorId}"></div>
    </div>
    <input type="hidden" class="color-picker-code" id="${codeId}"${codeAttrs} value="${(m && m.code) || (initialValue.code || '')}" />
    <input type="hidden" class="color-picker-kr"   id="${krId}"${krAttrs}     value="${(m && m.nameKr) || (initialValue.nameKr || '')}" />
    <input type="hidden" class="color-picker-en"   id="${enId}"${enAttrs}     value="${(m && m.nameEn) || (initialValue.nameEn || '')}" />
  </div>`
}
window.buildColorPickerHtml = buildColorPickerHtml

// Replace an existing #colorKr / #colorEn pair with a single color picker
// inputKrId: 'rColorKr' or 'plColorKr', inputEnId: 'rColorEn' or 'plColorEn'
// Returns: anchor id (for later read via getColorPickerValue)
// (Uses the Kr input id as the anchor since labels reference 색상)
function replaceColorInputsWithPicker(inputKrId, inputEnId, initialValue) {
  const krEl = document.getElementById(inputKrId)
  const enEl = document.getElementById(inputEnId)
  if (!krEl) return null
  const wrap = document.createElement('div')
  wrap.innerHTML = buildColorPickerHtml(inputKrId, initialValue)
  // Replace Kr input with picker, hide En input (not needed — picker handles both)
  krEl.replaceWith(wrap.firstElementChild)
  if (enEl) {
    // Hide the En field's label and input row
    const enField = enEl.closest('.rform-field') || enEl.parentElement
    if (enField) enField.classList.add('cp-hidden-field')
  }
  return inputKrId
}
window.replaceColorInputsWithPicker = replaceColorInputsWithPicker

function getColorPickerValue(anchorId) {
  const wrap = document.querySelector(`.color-picker[data-anchor="${anchorId}"]`)
  if (!wrap) return { code: '', nameKr: '', nameEn: '' }
  return {
    code: wrap.querySelector('.color-picker-code')?.value || '',
    nameKr: wrap.querySelector('.color-picker-kr')?.value || '',
    nameEn: wrap.querySelector('.color-picker-en')?.value || ''
  }
}
window.getColorPickerValue = getColorPickerValue

// Open/close + filter + selection handlers
let _cpOpenAnchor = null
const CP_DD_MAX_HEIGHT = 480
const CP_DD_GUTTER = 16

// Fix 4: smart positioning — fixed-position dropdown that opens up or down based on viewport space
function _cpPosition(anchorId) {
  const wrap = document.querySelector(`.color-picker[data-anchor="${anchorId}"]`)
  if (!wrap) return
  const display = wrap.querySelector('.color-picker-display')
  const dd = wrap.querySelector('.color-picker-dd')
  if (!display || !dd) return
  const rect = display.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top
  const desired = CP_DD_MAX_HEIGHT
  let top, maxH
  if (spaceBelow < desired && spaceAbove > spaceBelow) {
    // Open upward
    maxH = Math.max(160, Math.min(desired, spaceAbove - CP_DD_GUTTER))
    top = rect.top - maxH - 4
  } else {
    // Open downward (default)
    maxH = Math.max(160, Math.min(desired, spaceBelow - CP_DD_GUTTER))
    top = rect.bottom + 4
  }
  // Horizontal: clamp within viewport
  const ddWidth = Math.max(rect.width, 240)
  let left = rect.left
  if (left + ddWidth > window.innerWidth - 8) left = window.innerWidth - ddWidth - 8
  if (left < 8) left = 8
  dd.style.top = top + 'px'
  dd.style.left = left + 'px'
  dd.style.width = ddWidth + 'px'
  dd.style.maxHeight = maxH + 'px'
}

// Fix 1: open with fixed-position calculation; close on viewport changes (don't fight scroll)
function _cpToggle(anchorId) {
  const wrap = document.querySelector(`.color-picker[data-anchor="${anchorId}"]`)
  if (!wrap) return
  const dd = wrap.querySelector('.color-picker-dd')
  if (!dd) return
  if (_cpOpenAnchor && _cpOpenAnchor !== anchorId) _cpClose()
  if (dd.hasAttribute('hidden')) {
    dd.removeAttribute('hidden')
    _cpOpenAnchor = anchorId
    _cpRender(anchorId, '')
    _cpPosition(anchorId)
    // Fix 2: auto-focus search input on open
    setTimeout(() => wrap.querySelector('.color-picker-search')?.focus(), 50)
    document.addEventListener('click', _cpOutsideClickHandler, true)
    // Close on scroll/resize (re-opening picks up new position)
    window.addEventListener('scroll', _cpScrollCloseHandler, true)
    window.addEventListener('resize', _cpScrollCloseHandler, true)
  } else {
    _cpClose()
  }
}
window._cpToggle = _cpToggle

function _cpClose() {
  if (!_cpOpenAnchor) return
  const wrap = document.querySelector(`.color-picker[data-anchor="${_cpOpenAnchor}"]`)
  if (wrap) {
    const dd = wrap.querySelector('.color-picker-dd')
    if (dd) dd.setAttribute('hidden', '')
    const search = wrap.querySelector('.color-picker-search')
    if (search) search.value = ''
  }
  _cpOpenAnchor = null
  document.removeEventListener('click', _cpOutsideClickHandler, true)
  window.removeEventListener('scroll', _cpScrollCloseHandler, true)
  window.removeEventListener('resize', _cpScrollCloseHandler, true)
}

function _cpOutsideClickHandler(e) {
  if (!_cpOpenAnchor) return
  const wrap = document.querySelector(`.color-picker[data-anchor="${_cpOpenAnchor}"]`)
  if (wrap && !wrap.contains(e.target)) _cpClose()
}

function _cpScrollCloseHandler(e) {
  // Ignore scroll inside the dropdown's own list (allow internal scroll)
  if (!_cpOpenAnchor) return
  const wrap = document.querySelector(`.color-picker[data-anchor="${_cpOpenAnchor}"]`)
  if (wrap && wrap.contains(e.target)) return
  _cpClose()
}

function _cpFilter(anchorId, query) {
  _cpRender(anchorId, query)
}
window._cpFilter = _cpFilter

function _cpRender(anchorId, query) {
  const list = document.getElementById('cpList_' + anchorId)
  if (!list) return
  const qRaw = String(query || '').trim()
  const q = qRaw.toLowerCase()
  const active = _colorMasters.filter(c => c.active !== false)
  const filtered = q ? active.filter(c =>
    String(c.nameKr).toLowerCase().includes(q) ||
    String(c.nameEn).toLowerCase().includes(q) ||
    String(c.code).toLowerCase().includes(q)
  ) : active
  filtered.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  if (!filtered.length) {
    // Fix 5: empty state — Grade 3+ gets "Add new" quick action; others get fallback hint
    const grade = (State.currentUser && State.currentUser.grade) || 1
    const canAdd = grade >= 3 && qRaw.length > 0
    const escQ = qRaw.replace(/'/g, "\\'").replace(/"/g, '&quot;')
    let html = '<div class="cp-empty">검색 결과 없음.</div>'
    if (canAdd) {
      html += `<button type="button" class="cp-empty-add" onclick="_cpAddFromSearch('${anchorId}','${escQ}')">➕ "${qRaw.replace(/</g, '&lt;')}"를 새 색상으로 추가</button>`
      html += '<div class="cp-empty-hint">자유 입력하려면 ESC를 누르고 직접 입력하세요.</div>'
    } else {
      html += '<div class="cp-empty-hint">자유 입력으로 사용하거나 관리자에게 색상 추가를 요청하세요.</div>'
    }
    list.innerHTML = html
    return
  }
  // Group by category
  const groups = {}
  filtered.forEach(c => { (groups[c.category] = groups[c.category] || []).push(c) })
  const ordered = COLOR_CATEGORIES.filter(cat => groups[cat])
  // Add any custom categories that aren't in the canonical list
  Object.keys(groups).forEach(cat => { if (!ordered.includes(cat)) ordered.push(cat) })
  const html = ordered.map(cat => {
    const items = groups[cat].map(c => {
      const swatch = c.isPattern
        ? `<span class="cp-swatch cp-swatch-pattern" title="${c.nameKr}">🎨</span>`
        : `<span class="cp-swatch" style="background:${c.hex || '#ccc'}"></span>`
      return `<div class="cp-item" onclick="_cpSelect('${anchorId}','${c.code.replace(/'/g, "\\'")}')">${swatch}<span class="cp-item-text">${c.nameKr} - ${c.nameEn} <span class="cp-item-code">(${c.code})</span></span></div>`
    }).join('')
    return `<div class="cp-group"><div class="cp-group-title">${cat}</div>${items}</div>`
  }).join('')
  list.innerHTML = html
}

function _cpSelect(anchorId, code) {
  const c = getColorByCode(code)
  if (!c) return
  const wrap = document.querySelector(`.color-picker[data-anchor="${anchorId}"]`)
  if (!wrap) return
  // Update hidden inputs (by class, so any custom IDs work)
  const codeEl = wrap.querySelector('.color-picker-code')
  const krEl = wrap.querySelector('.color-picker-kr')
  const enEl = wrap.querySelector('.color-picker-en')
  if (codeEl) codeEl.value = c.code
  if (krEl) krEl.value = c.nameKr
  if (enEl) enEl.value = c.nameEn
  // Update display
  wrap.classList.remove('color-picker-unknown')
  const display = wrap.querySelector('.color-picker-display')
  if (display) {
    const swatch = c.isPattern
      ? '<span class="cp-swatch cp-swatch-pattern">🎨</span>'
      : `<span class="cp-swatch" style="background:${c.hex || '#ccc'}"></span>`
    display.innerHTML = `${swatch}<span class="color-picker-text">${c.nameKr} - ${c.nameEn} (${c.code})</span><span class="color-picker-caret">▾</span>`
  }
  _cpClose()
}
window._cpSelect = _cpSelect

function _cpKeyNav(anchorId, ev) {
  // Fix 3: ESC closes; Tab closes (and lets default Tab behavior continue) — no preventDefault on Tab
  if (ev.key === 'Escape') { ev.preventDefault(); _cpClose(); return }
  if (ev.key === 'Tab') { _cpClose(); return }
  // Future: arrow up/down navigation could be added; deferred for now
}
window._cpKeyNav = _cpKeyNav

// Fix 5: quick-add new color from search query — opens prompt-based add flow,
// pre-filling nameKr from current search; on success, auto-selects the new color in the picker
async function _cpAddFromSearch(anchorId, prefilledKr) {
  // Permission re-check (defense against UI bypass)
  const grade = (State.currentUser && State.currentUser.grade) || 1
  if (grade < 3) { showToast('색상 추가 권한이 없습니다.', 'warning'); return }

  // Close picker first so prompt is unobstructed
  _cpClose()

  const kr = (prefilledKr || '').trim() || (await _cpPromptOrNull('한글명', '') || '')
  if (!kr) return
  // Duplicate name check
  if (_colorMasters.some(c => c.nameKr === kr)) {
    showToast(`"${kr}"은(는) 이미 등록된 색상입니다.`, 'error')
    return
  }
  const en = (await _cpPromptOrNull('영문명', '')) || ''
  if (!en) return
  const codeRaw = await _cpPromptOrNull('약어 코드 (대문자/숫자 1-4자, 예: NA)', '')
  if (codeRaw == null) return
  const code = String(codeRaw).trim().toUpperCase()
  if (!/^[A-Z0-9]{1,4}$/.test(code)) { showToast('코드는 영문대문자/숫자 1-4자만 가능합니다.', 'warning'); return }
  if (_colorMasters.some(c => String(c.code).toUpperCase() === code)) {
    showToast(`코드 "${code}"는 이미 사용 중입니다.`, 'error'); return
  }
  const cat = await _cpPromptOrNull(
    '카테고리 (' + COLOR_CATEGORIES.join(' / ') + ')',
    '메탈릭/특수'
  )
  if (cat == null) return
  const isPattern = /패턴|믹스/.test(cat)
  let hex = ''
  if (!isPattern) {
    const h = await _cpPromptOrNull('HEX 색상 (예: #1a1a2e)', '#888888')
    if (h == null) return
    hex = String(h).trim()
  }
  const maxSort = _colorMasters.reduce((m, c) => Math.max(m, c.sortOrder || 0), 0)
  _colorMasters.push({
    id: code, nameKr: kr, nameEn: en, code, hex,
    category: cat, isPattern, sortOrder: maxSort + 10, active: true
  })
  await saveColorMasters()
  if (typeof logActivity === 'function') logActivity('setting', '설정', `색상 추가(피커): ${kr} (${code})`)
  if (typeof renderSettings === 'function' && document.getElementById('settingsPage')) {
    try { renderSettings() } catch(e) {}
  }
  showToast(`"${kr}" 추가됨. 적용 중...`, 'success')

  // Re-open picker and auto-select new color
  setTimeout(() => {
    _cpToggle(anchorId)
    setTimeout(() => _cpSelect(anchorId, code), 80)
  }, 100)
}
window._cpAddFromSearch = _cpAddFromSearch

// Lightweight wrapper around prompt() — returns null on cancel, string on accept
function _cpPromptOrNull(message, def) {
  const v = prompt(message, def)
  return v == null ? null : v
}

// =============================================
// ===== Settings Tab — Color Management Card =====
// =============================================
// Renders the 색상 관리 card. Returns HTML string for insertion into renderSettings().
function renderColorMasterCard() {
  const grade = (State.currentUser && State.currentUser.grade) || 1
  const canEdit = grade >= 3
  const _esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const sorted = [..._colorMasters].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  const itemsHtml = sorted.map((c, idx) => {
    const swatch = c.isPattern
      ? '<span class="cm-swatch cm-swatch-pattern">🎨</span>'
      : `<span class="cm-swatch" style="background:${c.hex || '#ccc'}"></span>`
    const dim = c.active === false ? ' cm-item-inactive' : ''
    const actions = canEdit ? `
      <button class="set-item-action set-item-edit" onclick="editColorMaster(${idx})" title="수정">&#9998;</button>
      <button class="set-item-action set-item-del" onclick="toggleColorMasterActive(${idx})" title="${c.active === false ? '활성화' : '비활성화'}">${c.active === false ? '↻' : '&#10005;'}</button>
    ` : ''
    return `<div class="set-item cm-item${dim}" id="cmItem_${idx}">
      <div class="set-item-view">
        ${swatch}
        <span class="cm-cat">${_esc(c.category)}</span>
        <span class="cm-kr">${_esc(c.nameKr)}</span>
        <span class="cm-en">${_esc(c.nameEn)}</span>
        <span class="cm-code">${_esc(c.code)}</span>
        ${actions}
      </div>
    </div>`
  }).join('') || '<div class="set-empty">항목 없음</div>'

  const addRow = canEdit ? `
    <div class="set-add-row cm-add-row">
      <select id="cmNewCat" class="set-add-input" style="width:120px">
        ${COLOR_CATEGORIES.map(cat => `<option value="${_esc(cat)}">${_esc(cat)}</option>`).join('')}
      </select>
      <input type="text" id="cmNewKr" placeholder="한글명" class="set-add-input" style="flex:1" />
      <input type="text" id="cmNewEn" placeholder="영문명" class="set-add-input" style="flex:1" />
      <input type="text" id="cmNewCode" placeholder="코드(2~3자)" class="set-add-input" maxlength="3" style="width:90px" oninput="this.value = this.value.toUpperCase()" />
      <input type="color" id="cmNewHex" value="#888888" class="cm-color-input" />
      <label class="cm-pattern-label"><input type="checkbox" id="cmNewPattern" /> 패턴</label>
      <button class="btn btn-new set-add-btn" onclick="addColorMaster()">+ 추가</button>
    </div>
  ` : ''

  return `<div class="set-card set-card-wide">
    <div class="set-card-header">
      <span class="set-card-title">🎨 색상 관리</span>
      <span class="set-card-count">${_colorMasters.length}</span>
      <span style="flex:1"></span>
      ${canEdit ? `<button class="set-excel-btn" onclick="runColorMigration()" title="기존 색상 데이터 마스터 매칭">🔍 마스터 매칭</button>` : ''}
    </div>
    <div class="set-search-row">
      <input type="text" id="cmSearchInput" placeholder="한글/영문/코드 검색..." class="set-search-input" oninput="filterColorMasterList()" />
      <select id="cmCatFilter" class="set-search-input" style="max-width:180px" onchange="filterColorMasterList()">
        <option value="">전체 카테고리</option>
        ${COLOR_CATEGORIES.map(cat => `<option value="${_esc(cat)}">${_esc(cat)}</option>`).join('')}
      </select>
    </div>
    <div class="set-list set-list-scroll" id="cmList">${itemsHtml}</div>
    ${addRow}
  </div>`
}
window.renderColorMasterCard = renderColorMasterCard

function filterColorMasterList() {
  const q = (document.getElementById('cmSearchInput')?.value || '').trim().toLowerCase()
  const cat = document.getElementById('cmCatFilter')?.value || ''
  document.querySelectorAll('#cmList .cm-item').forEach((el, idx) => {
    const sorted = [..._colorMasters].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    const c = sorted[idx]
    if (!c) return
    const matchQ = !q || String(c.nameKr).toLowerCase().includes(q) || String(c.nameEn).toLowerCase().includes(q) || String(c.code).toLowerCase().includes(q)
    const matchCat = !cat || c.category === cat
    el.classList.toggle('cm-item-hidden', !(matchQ && matchCat))
  })
}
window.filterColorMasterList = filterColorMasterList

async function addColorMaster() {
  const cat = (document.getElementById('cmNewCat')?.value || '').trim()
  const kr = (document.getElementById('cmNewKr')?.value || '').trim()
  const en = (document.getElementById('cmNewEn')?.value || '').trim()
  const code = (document.getElementById('cmNewCode')?.value || '').trim().toUpperCase()
  const hex = (document.getElementById('cmNewHex')?.value || '').trim()
  const isPattern = !!document.getElementById('cmNewPattern')?.checked
  if (!kr || !en || !code) { showToast('한글명, 영문명, 코드는 필수입니다.', 'warning'); return }
  if (!/^[A-Z0-9]{1,4}$/.test(code)) { showToast('코드는 영문대문자/숫자 1-4자만 가능합니다.', 'warning'); return }
  if (_colorMasters.some(c => String(c.code).toUpperCase() === code)) { showToast(`코드 "${code}"는 이미 사용 중입니다.`, 'error'); return }
  if (_colorMasters.some(c => c.nameKr === kr)) { showToast(`한글명 "${kr}"은 이미 사용 중입니다.`, 'error'); return }
  const maxSort = _colorMasters.reduce((m, c) => Math.max(m, c.sortOrder || 0), 0)
  _colorMasters.push({
    id: code, nameKr: kr, nameEn: en, code, hex: isPattern ? '' : hex,
    category: cat || '메탈릭/특수', isPattern, sortOrder: maxSort + 10, active: true
  })
  await saveColorMasters()
  if (typeof logActivity === 'function') logActivity('setting', '설정', `색상 추가: ${kr} (${code})`)
  if (typeof renderSettings === 'function') renderSettings()
  showToast(`"${kr}" 추가됨`, 'success')
}
window.addColorMaster = addColorMaster

async function editColorMaster(idx) {
  const sorted = [..._colorMasters].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  const c = sorted[idx]
  if (!c) return
  // Simple prompt-based edit (avoids extra modal). For richer UX, can be replaced with srm-modal.
  const newKr = prompt('한글명', c.nameKr); if (newKr == null) return
  const newEn = prompt('영문명', c.nameEn); if (newEn == null) return
  const newCode = prompt('코드 (대문자/숫자 1-4자)', c.code); if (newCode == null) return
  const codeUp = String(newCode).trim().toUpperCase()
  if (!/^[A-Z0-9]{1,4}$/.test(codeUp)) { showToast('코드는 영문대문자/숫자 1-4자만 가능합니다.', 'warning'); return }
  if (codeUp !== c.code && _colorMasters.some(x => String(x.code).toUpperCase() === codeUp)) {
    showToast(`코드 "${codeUp}"는 이미 사용 중입니다.`, 'error'); return
  }
  let newHex = c.hex
  if (!c.isPattern) {
    const h = prompt('HEX 색상 (예: #1a1a2e)', c.hex || '#888888')
    if (h == null) return
    newHex = h.trim()
  }
  // Mutate the actual master entry (not sorted copy)
  const target = _colorMasters.find(x => x.id === c.id)
  if (!target) return
  target.nameKr = newKr.trim() || target.nameKr
  target.nameEn = newEn.trim() || target.nameEn
  target.code = codeUp
  target.id = codeUp
  target.hex = newHex
  await saveColorMasters()
  if (typeof logActivity === 'function') logActivity('setting', '설정', `색상 수정: ${target.nameKr} (${target.code})`)
  if (typeof renderSettings === 'function') renderSettings()
  showToast('수정됨', 'success')
}
window.editColorMaster = editColorMaster

async function toggleColorMasterActive(idx) {
  const sorted = [..._colorMasters].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  const c = sorted[idx]
  if (!c) return
  const target = _colorMasters.find(x => x.id === c.id)
  if (!target) return
  const willDeactivate = target.active !== false
  if (willDeactivate) {
    const ok = await (typeof korConfirm === 'function' ? korConfirm(`"${target.nameKr}"을(를) 비활성화하시겠습니까?\n드롭다운에서 숨겨지지만 기존 데이터는 유지됩니다.`, '비활성화', '취소') : Promise.resolve(confirm('비활성화하시겠습니까?')))
    if (!ok) return
  }
  target.active = !willDeactivate
  await saveColorMasters()
  if (typeof logActivity === 'function') logActivity('setting', '설정', `색상 ${target.active ? '활성화' : '비활성화'}: ${target.nameKr}`)
  if (typeof renderSettings === 'function') renderSettings()
  showToast(target.active ? '활성화됨' : '비활성화됨', 'success')
}
window.toggleColorMasterActive = toggleColorMasterActive

// =============================================
// ===== Migration Helper (Task 4) =====
// =============================================
async function runColorMigration() {
  const products = State.allProducts || []
  const plans = State.planItems || []
  const allItems = [
    ...products.map(p => ({ kind: 'product', code: p.productCode, item: p })),
    ...plans.map(p => ({ kind: 'plan', no: p.no, item: p }))
  ]
  let matched = 0, alreadyHas = 0, unmatched = 0
  const unmatchedSamples = new Set()
  allItems.forEach(({ item }) => {
    if (!item.colorKr) return
    if (item.colorCode) { alreadyHas++; return }
    const m = resolveColorMaster({ nameKr: item.colorKr, nameEn: item.colorEn })
    if (m) matched++
    else { unmatched++; unmatchedSamples.add(item.colorKr) }
  })
  const sampleList = Array.from(unmatchedSamples).slice(0, 10).join(', ')
  const moreSamples = unmatchedSamples.size > 10 ? ` 외 ${unmatchedSamples.size - 10}건` : ''
  const msg = `색상 마스터 매칭 결과:

이미 코드 있음: ${alreadyHas}건
매칭 가능: ${matched}건
매칭 불가: ${unmatched}건${unmatchedSamples.size ? '\n매칭 불가 색상 예시: ' + sampleList + moreSamples : ''}

매칭 가능한 ${matched}건에 색상 코드를 적용하시겠습니까?`
  const ok = await (typeof korConfirm === 'function' ? korConfirm(msg, '적용', '취소') : Promise.resolve(confirm(msg)))
  if (!ok) return
  let applied = 0
  products.forEach(p => {
    if (p.colorCode || !p.colorKr) return
    const m = resolveColorMaster({ nameKr: p.colorKr, nameEn: p.colorEn })
    if (m) {
      p.colorCode = m.code
      p.colorKr = m.nameKr
      p.colorEn = m.nameEn
      applied++
    }
  })
  plans.forEach(p => {
    if (p.colorCode || !p.colorKr) return
    const m = resolveColorMaster({ nameKr: p.colorKr, nameEn: p.colorEn })
    if (m) {
      p.colorCode = m.code
      p.colorKr = m.nameKr
      p.colorEn = m.nameEn
      applied++
    }
  })
  // Persist
  try { if (typeof saveProducts === 'function') await saveProducts() } catch(e) { console.error(e) }
  try { if (typeof savePlanItems === 'function') await savePlanItems() } catch(e) { console.error(e) }
  if (typeof logActivity === 'function') logActivity('setting', '설정', `색상 마스터 매칭 적용: ${applied}건`)
  if (typeof renderProductTable === 'function') renderProductTable()
  if (typeof renderPlanTable === 'function') renderPlanTable()
  showToast(`${applied}건 매칭 완료`, 'success')
}
window.runColorMigration = runColorMigration
