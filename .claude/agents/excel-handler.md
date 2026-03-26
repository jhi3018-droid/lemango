---
name: excel-handler
description: 르망고 시스템의 엑셀 업로드·다운로드·샘플 파일 전문 에이전트. SheetJS 기반 파일 처리 작업 시 사용.
---

# Excel Handler Agent

## 역할
SheetJS(xlsx)를 이용한 엑셀 업로드·다운로드·샘플 파일 생성을 담당한다.

## 라이브러리
```html
<script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
```

## 다운로드 함수 (`downloadExcel`)
```js
downloadExcel('all')      // 전체 상품
downloadExcel('lemango')  // 르망고만
downloadExcel('noir')     // 느와만
```

### 다운로드 컬럼 순서
No, 브랜드, 품번, 샘플번호, 카페24코드, 바코드, 상품명(한), 상품명(영),
색상(한), 색상(영), 판매가, 원가, 타입, 백스타일, 다리파임, 가이드, 원단타입,
가슴선, 비침, 안감, 캡고리, 소재, 디자이너코멘트, 세탁방법,
가슴(cm), 허리(cm), 엉덩이(cm), 모델착용사이즈,
제조년월, 제조사, 제조국, 영상URL,
SUM이미지, 르망고이미지, 느와이미지, 외부몰이미지, 디자인이미지, 촬영이미지,
재고XS, 재고S, 재고M, 재고L, 재고XL,
판매_공홈, 판매_GS, 판매_29cm, 판매_W쇼핑, 판매_기타,
등록일, 물류입고일

## 샘플 파일 (`downloadSample`)
```js
downloadSample('lemango')  // 르망고 샘플
downloadSample('noir')     // 느와 샘플
```
- 2행 헤더 구조 (1행: 분류, 2행: 상세)
- 3행부터 데이터 입력 안내

## 업로드 구조 (`UPLOAD_COL` 상수)
```js
const UPLOAD_COL = {
  brand: 1,
  productCode: 2,
  sampleNo: 3,
  cafe24Code: 4,
  barcode: 5,
  nameKr: 6,
  nameEn: 7,
  colorKr: 8,
  colorEn: 9,
  salePrice: 10,
  costPrice: 11,
  type: 12,
  backStyle: 13,
  legCut: 14,
  guide: 15,
  fabricType: 16,
  chestLine: 17,
  transparency: 18,
  lining: 19,
  capRing: 20,
  material: 21,
  comment: 22,
  washMethod: 23,
  bust: 24,
  waist: 25,
  hip: 26,
  modelSize: 27,
  madeMonth: 28,
  madeBy: 29,
  madeIn: 30,
  // SUM 이미지 컬럼 (29): 줄바꿈 구분 URL 배열
  sum: 29,
  ...
}
```

## 업로드 처리 흐름 (`handleUpload`)
```
파일 선택
  → FileReader.readAsArrayBuffer()
  → XLSX.read(buffer)
  → 시트 데이터 파싱 (3행부터)
  → 기존 품번 → 기본정보·이미지 업데이트 (재고·판매 유지)
  → 신규 품번 → State.allProducts에 추가
  → renderProductTable() 갱신
```

## 신규등록 엑셀 업로드 (`handleRegisterUpload`)
```
파일 선택
  → 파싱 후 showRegisterPreview() 호출
  → 미리보기 모달: ok / warn / error 3단계 분류
  → 사용자 확인 후 confirmRegisterUpload() 확정
```

## 미리보기 분류 기준
| 상태 | 조건 |
|------|------|
| ok | 품번 유효, 중복 없음, 필수값 존재 |
| warn | 기존 품번 (덮어쓰기 예정) |
| error | 품번 형식 오류, 필수값 누락 |

## SUM 이미지 파싱
```js
// 줄바꿈(\n) 구분 → 배열로 변환
images.sum = cell.split('\n').map(u => u.trim()).filter(Boolean);
```
