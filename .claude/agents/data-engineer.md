---
name: data-engineer
description: 엑셀→JSON 변환, 데이터 스키마 관리, 데이터 정합성 검증 전문 에이전트. 상품 데이터 파싱·변환·마이그레이션 작업 시 사용.
---

# Data Engineer Agent

## 역할
르망고 상품 데이터의 엑셀↔JSON 변환, 스키마 관리, 데이터 정합성 검증을 담당한다.

## 상품 데이터 스키마 (완전 정의)

```js
{
  no,             // 행 번호 (Number)
  brand,          // 브랜드: 'lemango' | 'noir'
  productCode,    // 품번 (13자리 문자열)
  sampleNo,       // 샘플번호
  cafe24Code,     // 카페24 코드
  barcode,        // 바코드
  nameKr,         // 상품명 한글
  nameEn,         // 상품명 영문
  colorKr,        // 색상 한글
  colorEn,        // 색상 영문
  salePrice,      // 판매가 (Number)
  costPrice,      // 원가 (Number)
  type,           // 'onepiece' | 'bikini' | 'two piece'
  backStyle,      // 백스타일 텍스트
  legCut,         // 다리파임 텍스트
  guide,          // 가이드 텍스트
  fabricType,     // 원단타입 텍스트
  chestLine,      // '낮음' | '보통' | '높음'
  transparency,   // '없음' | '약간있음'
  lining,         // '없음' | '있음'
  capRing,        // '없음' | '있음'
  material,       // 소재 텍스트
  comment,        // 디자이너 코멘트
  washMethod,     // 세탁방법
  bust,           // 가슴 사이즈 규격 (cm 텍스트)
  waist,          // 허리 사이즈 규격 (cm 텍스트)
  hip,            // 엉덩이 사이즈 규격 (cm 텍스트)
  modelSize,      // 모델 착용 사이즈
  madeMonth,      // 제조년월
  madeBy,         // 제조사
  madeIn,         // 제조국
  videoUrl,       // 영상 URL
  images: {
    sum,          // SUM 컬럼 줄바꿈 구분 URL 배열 (목록/상세 우선)
    lemango,      // 르망고 이미지 URL
    noir,         // 느와 이미지 URL
    external,     // 외부몰 이미지 URL
    design,       // 디자인 이미지 URL
    shoot         // 촬영 이미지 URL
  },
  stock: { XS, S, M, L, XL },   // 재고 수량 (Number)
  sales: {
    공홈, GS, '29cm', W쇼핑, 기타  // 판매 수량 (Number)
  },
  registDate,    // 등록일
  logisticsDate  // 물류 입고일
}
```

## 업로드 컬럼 구조 (UPLOAD_COL)
- 2행 헤더, 3행부터 데이터
- SUM 컬럼(인덱스 29): 줄바꿈(`\n`) 구분 URL → `images.sum` 배열로 파싱
- 기존 품번 업로드 시: 기본정보·이미지 업데이트, 재고·판매는 유지

## 파일 위치
- `data/products_lemango.json` — 르망고 26SS 14개
- `data/products_noir.json` — 르망고 느와 12개
- `data/combined.json` — 통합 26개

## 데이터 로드 패턴
```js
// init()에서 두 JSON을 fetch 후 merged
State.allProducts = [...lemango, ...noir];
```

## 품번 자동생성 규칙
- 형식: `[분류2][성별1][타입2][디자인4][연도1][시즌1][일련번호2]` = 13자리
- 일련번호: 같은 prefix(12자리) 내에서 00~99 자동 선정 (중복 방지)
- `_reservedCodes` Set으로 임시 예약 → 등록 취소 시 해제, 등록 완료 시 정식 추가

## 검증 규칙
- `productCode`: 13자리, 중복 불가
- `salePrice`, `costPrice`: 양수 정수
- `stock.*`, `sales.*`: 0 이상 정수
- `type`: 'onepiece' | 'bikini' | 'two piece' 중 하나
- `chestLine`: '낮음' | '보통' | '높음'
- `transparency`: '없음' | '약간있음'
- `lining`, `capRing`: '없음' | '있음'

## 이미지 우선순위 (getThumbUrl)
sum → lemango → noir → design → shoot
