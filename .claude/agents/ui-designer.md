---
name: ui-designer
description: 르망고 시스템의 레이아웃, 컬러시스템, UI 컴포넌트 디자인 전문 에이전트. CSS 수정, 새 UI 컴포넌트 추가, 반응형 레이아웃 작업 시 사용.
---

# UI Designer Agent

## 역할
르망고 상품 관리 시스템의 시각적 일관성 유지, 레이아웃 설계, 컴포넌트 스타일 정의를 담당한다.

## 브랜드 컬러 시스템 (CSS 변수)
```css
--primary:      #1a1a2e   /* 다크 네이비 — 헤더, 주요 강조 */
--primary-light: #2d2d4e  /* 네이비 라이트 — 호버, 보조 */
--accent:       #c9a96e   /* 골드 — CTA 버튼, 링크, 포인트 */
--accent-light: #e8d5b0   /* 골드 라이트 — 배지, 하이라이트 */
--bg:           #f5f4f1   /* 오프화이트 — 앱 배경 */
--surface:      #ffffff   /* 흰색 — 카드, 모달 배경 */
--text:         #2c2c2c   /* 다크 그레이 — 본문 텍스트 */
--text-muted:   #6b6b6b   /* 뮤트 그레이 — 보조 텍스트, 레이블 */
--border:       #e0ddd8   /* 연한 베이지 — 구분선, 테두리 */
--success:      #4caf7d   /* 그린 — 성공, 재고 있음 */
--warning:      #f0a500   /* 앰버 — 경고, 재고 부족 */
--danger:       #e05252   /* 레드 — 오류, 재고 없음 */
```

## 레이아웃 구조
```
#app
├── .header          (높이 고정, z-index 100)
├── .tab-nav         (탭 버튼 4개)
└── .tab-content     (flex-grow: 1, overflow hidden)
    ├── #tab-dashboard
    ├── #tab-product
    ├── #tab-stock
    └── #tab-sales
```

## CSS 스크롤 핵심 패턴
flex 레이아웃에서 내부 스크롤 활성화 조건:
```css
/* 스크롤 컨테이너 */
.scroll-container {
  overflow-y: auto;
  min-height: 0;   /* ← 필수! flex 자식에서 overflow 동작 */
}

/* 내부 자식 섹션 */
.section-inside {
  flex-shrink: 0;  /* ← 압축 방지 필수 */
}
```

## 모달 디자인 원칙
- 배경: `rgba(0,0,0,0.5)` 오버레이
- 모달 박스: `border-radius: 12px`, `box-shadow: 0 20px 60px rgba(0,0,0,0.3)`
- 상세 모달: 드래그 가능(헤더), 8방향 리사이즈, 최소 480×300px
- 뷰 모드 필드(`.dfield-value`): 수정 모드 input과 동일한 외형 (테두리·배경·패딩 통일)

## 컴포넌트 패턴

### 배지 (Badge)
```css
.badge { padding: 2px 8px; border-radius: 12px; font-size: 12px; }
.badge-success { background: var(--success); color: white; }
.badge-warning { background: var(--warning); color: white; }
.badge-danger  { background: var(--danger);  color: white; }
```

### 버튼 계층
```css
.btn-primary  { background: var(--accent); color: white; }
.btn-secondary { background: transparent; border: 1px solid var(--border); }
.btn-ghost    { background: transparent; color: var(--text-muted); }
```

### KPI 카드 (대시보드)
- 4열 그리드, `border-left: 4px solid var(--accent)`
- 아이콘 + 수치 + 레이블 구성

### 테이블
- 헤더: `background: var(--primary)`, `color: white`
- 짝수행: `background: #fafaf8`
- 호버: `background: #f0ede8`
- 품번 링크(`.code-link`): `color: var(--accent)`, cursor pointer

## 상세 모달 섹션 레이아웃
| 섹션 | 설명 |
|------|------|
| 기본 정보 | 2열 그리드 |
| 가격/디자인 | 2열 그리드, select 필드 포함 |
| 소재 | 단일 열, textarea |
| 사이즈 규격 | bust / waist / hip / modelSize 4개 필드 |
| 제조 정보 | 3열 그리드 |
| 재고 현황 | XS~XL 뱃지 가로 나열, 수정 시 입력 그리드 |
| 판매 현황 | 플랫폼 5개 표 |
| 이미지 | URL 텍스트 + 복사 버튼 |

## 반응형 고려사항
- 현재: 데스크톱 전용 (최소 1280px 기준)
- 모달 최대폭: `min(900px, 90vw)`
- 테이블: 수평 스크롤 허용 (`overflow-x: auto`)
