# 스캔 동작 흐름

모든 스캔 모드는 하나의 파이프라인을 공유하고, 파싱 레이어만 다릅니다. 이 페이지는 전체 흐름을 먼저 보고, **여권(MRZ) → 신용카드 → 명함** 순서로 각 모드를 설명합니다.

## 공통 파이프라인

```
카메라 (vision-camera)
  → onFrame worklet            … 앱 코드, 직접 스로틀 (예: 5프레임마다 1회)
  → scan(frame)                … 네이티브 OCR: Apple Vision / ML Kit
      · 중앙 밴드 크롭 (기본 roi: 'centralBand')
      · 텍스트 줄 반환 — 위→아래, 같은 행은 왼→오른쪽
  → scheduleOnRN(lines)        … JS 스레드로 전달
  → parseXxx(lines)            … 모드별 파서 (TS) → 구조화 필드
  → session.push(parsed)       … 멀티프레임 확정
  → 최종 결과                   … 렌더링 / 자동입력
```

핵심 성질:

- **네이티브는 OCR만 합니다.** `scan()`은 호출마다 실제 OCR(수백 ms)을 수행하고 숨은 스로틀이 없습니다 — 호출 주기는 worklet에서 앱이 정합니다. 구조화는 전부 TypeScript에서.
- **한 프레임은 절대 신뢰하지 않습니다.** 모든 모드에 스캔 세션이 있어 프레임들이 **일치할 때만** 확정합니다 — 한 번의 오인식("HONG"→"HONO")이 결과로 새어나가지 않습니다.
- **`frame.dispose()`는 `finally`에서.** 프레임이 누수되면 카메라 파이프라인이 멈춥니다.

```tsx
const scanner = useMemo(() => getOcrScanner(), []);
const session = useMemo(() => createMrzScanSession(), []); // 모드별

const frameOutput = useFrameOutput({
  pixelFormat: 'yuv',
  onFrame: (frame) => {
    'worklet';
    try {
      const g = globalThis as unknown as { __ocrFrameCount?: number };
      g.__ocrFrameCount = (g.__ocrFrameCount ?? 0) + 1;
      if (g.__ocrFrameCount % 5 !== 0) return;
      const ocr = scanner.scan(frame);
      if (ocr.lines.length > 0) scheduleOnRN(onLines, ocr.lines, ocr.lineItems);
    } finally {
      frame.dispose();
    }
  },
});
```

## 1. 여권 (MRZ)

```
lines → parseMrz() → MrzResult → createMrzScanSession()
```

- `parseMrz`는 `<<<`로 채워진 MRZ 2~3줄을 찾아 ICAO 9303 규격으로 파싱하고 **체크 디지트**를 검증합니다 — 여권번호·생년월일·만료일에 각각 체크 디지트가 있어 읽은 값이 스스로 옳음을 증명할 수 있습니다.
- `MrzResult.valid` = 종합 체크섬 통과, `fieldsValid` = 보고되는 필드들의 개별 디지트 통과 (미사용 filler의 OCR 노이즈는 종합 체크섬만 깨는 경우가 많습니다).
- 세션은 필드 체크섬이 통과한 읽기만 받아들이고, `minReads`(기본 3)회 일치하면 확정하며, 체크 디지트가 없는 **이름은 다수결**로 정합니다.

MRZ가 1순위인 이유: 체크섬 덕분에 무료 온디바이스 OCR로도 결과가 *증명 가능하게* 정확한 유일한 모드입니다. → [MRZ 스캔](/ko/guide/mrz)

## 2. 신용카드

```
lines → parseCard() → CardResult → createCardScanSession()
```

- `parseCard`는 **카드번호**를 anchor로 잡습니다: 그룹 경계를 따라 숫자 런을 윈도잉하고 브랜드(BIN 대역) 또는 **Luhn 체크섬**을 통과해야 후보가 됩니다. 만료일은 라벨("VALID THRU") 인접을 우선하고, 소유자명은 best-effort.
- `CardResult.valid` = Luhn 통과. 세션은 같은 Luhn-valid 번호의 반복을 요구하고 만료일·이름은 투표.
- 이 모드는 네이티브 변경이 없었습니다 — 같은 `scan()` 출력을 재사용합니다. → [신용카드 스캔](/ko/guide/card)

## 3. 명함

```
lines → parseBusinessCard() → BusinessCardResult → createBusinessCardScanSession()
```

- 명함에는 **검증할 체크섬이 없어서** anchor가 연락처로 바뀝니다: 이메일·전화·웹사이트가 없으면 `parseBusinessCard`는 `null`. `valid` 플래그도 없습니다.
- 강한 패턴 필드(이메일, 보수적 타입 라벨의 전화, 웹사이트, 이어지는 줄을 병합하는 주소)를 먼저 뽑고, **이름·회사·직함**은 휴리스틱입니다: 이름 모양 + 성씨 부스트, 법인 접미사/도메인 라벨/로고 텍스트 회사, 키워드 직함 + **소거법 fallback**(다른 무엇으로도 설명 안 되는 이름 옆 짧은 줄), 부서는 분리.
- 세션은 연락처 identity(이메일, 없으면 전화 숫자)의 반복을 anchor로 — 기본 `minReads: 2` — 나머지 필드는 투표.

→ [명함 스캔](/ko/guide/business-card)

## 자동 감지

`detectDocument(lines)`는 신뢰도 순서로 파서를 돌립니다:

1. **체크섬 통과 MRZ** → `{ type: 'mrz', valid: true }`
2. **Luhn 통과 카드** → `{ type: 'card', valid: true }`
3. 구조만 파싱된 MRZ, 그다음 카드 — `valid: false`
4. **이메일이 있을 때만 명함** → `{ type: 'bizcard' }` — 전화번호만으로 감지하면 영수증·포스터까지 명함이 됩니다.

화면이 이미 문서 종류를 알고 있다면 해당 파서를 직접 부르세요 — 오탐이 적고 모드별 가이드 박스를 쓸 수 있습니다.
