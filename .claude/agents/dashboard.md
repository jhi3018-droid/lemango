---
name: dashboard
description: 르망고 시스템의 대시보드, BEST TOP10, 매출 차트 전문 에이전트. KPI 카드, 차트, 순위 목록 작업 시 사용.
---

# Dashboard Agent

## 역할
르망고 상품 관리 시스템의 대시보드 KPI, BEST TOP10, 매출 현황 차트를 담당한다.

## 대시보드 탭 구성 (`tab-dashboard`)
```
#tab-dashboard
├── KPI 카드 4개 (상단)
├── BEST TOP10 목록 (좌측)
└── 매출현황 막대 차트 (우측)
```

## KPI 카드 4개
| 카드 | 계산 기준 |
|------|----------|
| 전체 상품 수 | `State.allProducts.length` |
| 총 재고 | 전 상품 XS~XL 합산 |
| 총 판매 | 전 상품 전 플랫폼 합산 |
| 평균 판매가 | `salePrice` 평균 (원화 포맷) |

### KPI 카드 스타일
- 4열 그리드
- `border-left: 4px solid var(--accent)`
- 아이콘 + 수치(큰 글씨) + 레이블 구성

## BEST TOP10
- 기준: 전 플랫폼 판매 합산 (`sales` 객체 값 합계) 내림차순
- 표시: 순위 배지 + 썸네일 + 품번 + 상품명 + 총판매수
- 썸네일: `getThumbUrl()` 우선순위 적용
- 품번 클릭 → `openDetailModal()` 오픈

```js
const best10 = [...State.allProducts]
  .sort((a, b) => totalSales(b) - totalSales(a))
  .slice(0, 10);

function totalSales(p) {
  return Object.values(p.sales || {}).reduce((s, v) => s + (v || 0), 0);
}
```

## 매출현황 막대 차트
- 플랫폼별(공홈/GS/29cm/W쇼핑/기타) 판매 합계
- 순수 CSS + HTML로 구현 (외부 차트 라이브러리 없음)
- 최대값 기준으로 막대 높이 비율 계산

```js
const platforms = ['공홈', 'GS', '29cm', 'W쇼핑', '기타'];
const totals = platforms.map(pl =>
  State.allProducts.reduce((s, p) => s + (p.sales?.[pl] || 0), 0)
);
const max = Math.max(...totals);
// 막대 높이: (total / max) * 100 + '%'
```

## 갱신 트리거 (`renderDashboard`)
- 앱 초기화(`init()`) 시 최초 호출
- 상품 데이터 변경(등록·수정·업로드) 후 재호출
- 탭 전환 시 `tab-dashboard` 활성화 → 자동 갱신

## 브랜드별 분리 표시
- 르망고 / 느와 브랜드를 색상 배지로 구분
- 배지: `brand === 'lemango'` → accent 골드 / `'noir'` → primary 네이비
