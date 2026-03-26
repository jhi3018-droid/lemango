---
name: table-renderer
description: 르망고 시스템의 테이블 컬럼 정의 및 렌더링 패턴 전문 에이전트. 테이블 컬럼 추가/수정, 셀 렌더링 로직 작업 시 사용.
---

# Table Renderer Agent

## 역할
르망고 상품 관리 시스템의 테이블 컬럼 구조와 렌더링 패턴을 담당한다.

## 상품조회 테이블 컬럼 (`renderProductTable`)
| 컬럼 | 필드 | 비고 |
|------|------|------|
| No | `no` | |
| 브랜드 | `brand` | 배지 표시 |
| 품번 | `productCode` | `.code-link` 클릭 → `openDetailModal()` |
| 바코드 | `barcode` | |
| 상품명 | `nameKr` | |
| 색상 | `colorKr` | |
| 타입 | `type` | |
| 판매가 | `salePrice` | 원화 포맷 |
| 재고 합계 | `stock` | XS+S+M+L+XL 합산 |
| 이미지 | `images` | 썸네일 (getThumbUrl 우선순위) |

## 재고 관리 테이블 컬럼 (`renderStockTable`)
| 컬럼 | 필드 | 비고 |
|------|------|------|
| 품번 | `productCode` | `.code-link` 클릭 → `openDetailModal()` |
| 상품명 | `nameKr` | |
| XS | `stock.XS` | |
| S | `stock.S` | |
| M | `stock.M` | |
| L | `stock.L` | |
| XL | `stock.XL` | |
| 합계 | 계산값 | XS~XL 합산 |

## 판매조회 테이블 컬럼 (`renderSalesTable`)
| 컬럼 | 필드 | 비고 |
|------|------|------|
| 품번 | `productCode` | |
| 상품명 | `nameKr` | |
| 공홈 | `sales.공홈` | |
| GS | `sales.GS` | |
| 29cm | `sales['29cm']` | |
| W쇼핑 | `sales.W쇼핑` | |
| 기타 | `sales.기타` | |
| 합계 | 계산값 | 전 플랫폼 합산 |

## 썸네일 렌더링 (`getThumbUrl`)
```js
// 우선순위: sum → lemango → noir → design → shoot
function getThumbUrl(images) {
  if (images.sum?.length) return images.sum[0];
  return images.lemango || images.noir || images.design || images.shoot || '';
}
```

## 품번 링크 패턴
```html
<span class="code-link" onclick="openDetailModal('${p.productCode}')">
  ${p.productCode}
</span>
```

## 재고 배지 색상 기준
```js
stock === 0   → badge-danger   (빨강)
stock <= 3    → badge-warning  (노랑)
stock > 3     → badge-success  (초록)
```

## 테이블 렌더링 흐름
```
State.*.filtered
  → 각 행 HTML 문자열 생성
  → tbody.innerHTML = rows.join('')
  → 이벤트 리스너 재바인딩 (code-link 등)
```

## 빈 결과 처리
```html
<tr><td colspan="N" class="empty-row">검색 결과가 없습니다.</td></tr>
```
