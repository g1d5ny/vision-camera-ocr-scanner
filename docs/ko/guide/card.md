# 신용카드 스캔

카메라를 결제 카드에 비추면 **카드번호**, **브랜드**, **만료일**, 그리고 (best-effort) **소유자 이름**을 추출합니다. 카드번호는 **Luhn 체크섬**으로 검증되므로, 깨끗하게 읽히면 자체 검증이 됩니다.

## 동작 원리

```
카메라 프레임 → 네이티브 OCR (Apple Vision / ML Kit) → 텍스트 줄 → parseCard() (Luhn + BIN)
```

MRZ와 동일하게 네이티브 쪽은 OCR만 수행해 텍스트 줄을 반환하고, `parseCard`는 JS 스레드에서 실행됩니다. **추가 네이티브 의존성이 없습니다** — 같은 `scan(frame)`을 재사용합니다.

## 파싱 API

```ts
import { parseCard, detectBrand, type CardResult } from '@jieonist/vision-camera-ocr-scanner';

const result = parseCard(ocrTextLines); // CardResult | null
```

### `CardResult`

```ts
interface CardResult {
  valid: boolean;              // 번호가 Luhn 체크섬을 통과하면 true
  number: string | null;       // 숫자만, 예: '4111111111111111'
  numberFormatted: string | null; // 그룹핑, 예: '4111 1111 1111 1111' (Amex는 4-6-5)
  brand: string | null;        // 'visa' | 'mastercard' | 'amex' | 'discover' | 'jcb' | 'diners' | 'unknown'
  expiryMonth: string | null;  // 'MM'
  expiryYear: string | null;   // 'YY'
  holderName: string | null;   // best-effort, null일 수 있음
  lines: string[];             // 스캔된 OCR 줄
}
```

**카드번호가 기준점**입니다 — 그럴듯한 번호를 못 찾으면 `parseCard`는 `null`을 반환합니다. 브랜드가 확인되고 Luhn이 유효한 번호를 우선하므로, 우연히 Luhn을 통과한 부분 문자열이 실제 번호를 이기지 않습니다. 만료일이 여러 개 나오면(예: Amex "member since" + "valid thru") **가장 늦은** 날짜를 선택합니다.

이미 알고 있는 번호에서 브랜드만 필요하면 `detectBrand(number)`를 따로 쓸 수 있습니다.

::: warning 결과 객체를 로깅하지 마세요
`CardResult.lines`에는 전체 카드번호(PAN)가 포함된 원본 OCR 줄이 그대로 담겨 있습니다. 결과를 통째로 로깅하면(예: `console.log(result)`) 기기 로그와 크래시/분석 파이프라인에 카드번호가 남습니다. 필요한 필드만 로깅하고(예: `result.valid`, `result.brand`), 플로우가 끝나면 결과를 상태에서 바로 비우세요.
:::

## 참고 & 한계

- **소유자 이름은 best-effort**입니다. 카드 서체·엠보싱은 잘 안 읽혀서 힌트 정도로만 쓰고 사용자가 수정하게 하세요.
- **엠보싱(돋을새김) 번호**는 평면 인쇄보다 인식률이 낮습니다 — 밝은 조명과 평평한 각도가 큰 도움이 됩니다.
- `valid`는 Luhn 체크섬만 반영합니다 — 카드가 실제/활성/승인되었다는 뜻이 **아닙니다**. 결제 승인에는 절대 쓰지 말고, 자동 입력/데이터 입력 용도로만 쓰세요.
- 현재 iOS OCR은 **세로(portrait) 후면 카메라** 방향을 가정합니다.
