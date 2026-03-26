---
name: search-filter
description: 르망고 시스템의 검색·필터·정렬 로직 전문 에이전트. 다중 키워드 검색, 탭별 필터, 정렬 구현 작업 시 사용.
---

# Search & Filter Agent

## 역할
르망고 상품 관리 시스템의 검색·필터·정렬 로직을 담당한다.

## 다중 키워드 검색 (`parseKeywords`)
```js
// 쉼표(,) 또는 줄바꿈으로 구분, 최대 200개, 빈 항목 제거
function parseKeywords(raw) {
  return raw.split(/[,\n]/).map(k => k.trim()).filter(Boolean).slice(0, 200);
}
```

## 엑셀 붙여넣기 처리 (`handleSearchPaste`)
- 엑셀 세로 복사 붙여넣기 → 줄바꿈 구분 자동 인식
- 입력 필드 ID를 받아 값 설정 후 검색 트리거

## 탭별 검색 함수
| 함수 | 대상 | 검색 기준 |
|------|------|----------|
| `searchProduct()` | `State.product.filtered` | 전체 / 상품명 / 품번 / 백스타일 / 바코드 |
| `searchStock()` | `State.stock.filtered` | 품번, 상품명 |
| `searchSales()` | `State.sales.filtered` | 품번, 상품명 |

## 검색 기준 옵션 (상품조회)
```js
'all'       // 전체 (모든 텍스트 필드)
'nameKr'    // 상품명
'productCode' // 품번
'backStyle' // 백스타일
'barcode'   // 바코드
```

## 검색 로직 패턴 (OR 조건)
```js
// 키워드 배열 중 하나라도 매칭되면 포함
const keywords = parseKeywords(raw);
State.product.filtered = State.allProducts.filter(p =>
  keywords.some(kw => targetField(p).includes(kw))
);
```

## 필터 조건
- 브랜드 필터: `'all' | 'lemango' | 'noir'`
- 타입 필터: `'all' | 'onepiece' | 'bikini' | 'two piece'`
- 필터는 검색과 AND 조건으로 결합

## 정렬
- 기본: `no` 오름차순 (등록 순서)
- 검색 결과는 필터 후 정렬 유지

## 상태 흐름
```
입력 변경
  → parseKeywords()
  → State.*.filtered 갱신
  → render*Table() 호출
```
