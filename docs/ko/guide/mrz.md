# MRZ 스캔

MRZ는 **Machine Readable Zone**(기계 판독 영역) — 여권(및 일부 신분증) 하단의 `<<<`로 채워진 두 줄입니다. ICAO 9303 표준을 따르며 **체크 디지트**를 포함하고 있어, 읽어들인 값을 스스로 검증할 수 있습니다.

## 동작 원리

```
카메라 프레임 → 네이티브 OCR (Apple Vision) → 텍스트 줄 → parseMrz() (mrz + 체크섬)
```

- 네이티브 `scan(frame)`은 인식된 텍스트 줄을 반환합니다(약 3fps로 스로틀, 위→아래 정렬).
- `parseMrz(lines)`는 MRZ 줄을 찾아 [`mrz`](https://www.npmjs.com/package/mrz) 라이브러리로 파싱하고 체크 디지트를 검증합니다.

## 파싱 API

```ts
import { parseMrz, extractMrzLines, type MrzResult } from '@jieonist/vision-camera-ocr-scanner';

const result = parseMrz(ocrTextLines); // MrzResult | null
```

### `MrzResult`

```ts
interface MrzResult {
  valid: boolean;          // MRZ 체크 디지트가 검증되면 true
  format: string;          // 'TD1' | 'TD2' | 'TD3'
  documentNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  nationality: string | null;
  issuingState: string | null;
  birthDate: string | null;      // 원본 YYMMDD
  expirationDate: string | null; // 원본 YYMMDD
  sex: string | null;
  lines: string[];               // 파싱된 MRZ 줄
}
```

`parseMrz`는 연속된 후보 줄 윈도우를 훑으며 가장 좋은 파싱 결과(체크섬 유효 + 이름 있음 우선)를 반환합니다. 따라서 OCR이 여분의 줄을 하나 더 읽어도 잘못된 쌍을 고르지 않습니다. MRZ를 못 찾으면 `null`을 반환하고, 체크 디지트가 실패하면(잡음 섞인 읽기나 샘플 문서 등) `valid: false`인 결과가 나올 수 있습니다.

## 참고 & 한계

- **날짜는 원본 `YYMMDD`** — 세기(century)는 앱에서 해석하세요(만료일은 항상 미래/20xx, 생년월일은 미래일 수 없음).
- 현재 iOS OCR은 **세로(portrait) 후면 카메라** 방향을 가정합니다.
- 정확도는 "자동 입력에 충분한" 수준입니다 — 항상 사용자가 확인/수정하게 하세요. 인증된 KYC/라이브니스에는 상용 SDK를 사용하세요.
