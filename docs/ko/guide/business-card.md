# 명함 스캔

카메라로 명함을 비추면 **이름**, **회사**, **직함**, **전화번호**, **이메일**, **웹사이트**, **주소**를 추출합니다. 한국어/영어 명함을 지원합니다.

## 동작 원리

```
카메라 프레임 → 네이티브 OCR (Apple Vision / ML Kit) → 텍스트 줄 → parseBusinessCard() (휴리스틱)
```

MRZ·카드와 동일하게 네이티브 쪽은 OCR만 수행해 텍스트 줄을 반환하고, `parseBusinessCard`는 JS 스레드에서 실행됩니다. **추가 네이티브 의존성이 없습니다** — 같은 `scan(frame)`을 재사용합니다.

## 파싱 API

```ts
import { parseBusinessCard, type BusinessCardResult } from '@jieonist/vision-camera-ocr-scanner';

const result = parseBusinessCard(ocrTextLines); // BusinessCardResult | null
```

### `BusinessCardResult`

```ts
interface BusinessCardResult {
  name: string | null;
  company: string | null;
  jobTitle: string | null;
  department: string | null;   // 조직 단위 ("Technical R&D", "기술개발팀")
  phones: BusinessCardPhone[]; // { type: 'mobile' | 'tel' | 'fax' | 'unknown', number: string }
  email: string | null;
  website: string | null;
  address: string | null;
  lines: string[];             // 스캔된 OCR 줄
}
```

**연락처가 anchor입니다** — 이메일·전화·웹사이트가 하나도 없으면 `parseBusinessCard`는 `null`을 반환합니다. 전화의 `type`은 강한 신호(명시적 라벨 `M.` / `Tel:` / `Fax` / `휴대폰`, 또는 한국 `010` 프리픽스)가 있을 때만 지정하고, 아니면 추측하는 대신 `'unknown'`으로 둡니다.

**직함은 사전에 갇히지 않습니다.** 알려진 키워드(CEO, 팀장, Engineer…)는 바로 매칭되고, 그 외에는 **소거법**으로 잡습니다: 강한 패턴 필드(연락처·주소·회사·이름)가 아닌 짧은 줄이 이름 옆에 있으면 역할로 읽습니다. 조직 단위 표식(R&D, Team, 본부, 팀…)이 있는 줄은 `department`로 들어가고, 슬로건·문장형 줄은 걸러냅니다.

**`lineItems`를 넘기면 레이아웃 신호가 켜집니다.** `parseBusinessCard(lines, ocr.lineItems)`로 글자 크기가 증거가 됩니다 — 가장 큰 줄이 이름(최상단의 큰 글씨는 브랜드로 감점), 이름보다 큰 미설명 줄은 회사 로고, 이름보다 크게 인쇄된 줄은 직함이 될 수 없습니다.

::: info `valid` 필드가 없는 이유
MRZ(체크 디지트)나 결제 카드(Luhn)와 달리 명함에는 **검증할 체크섬이 없습니다**. 그래서 `valid` 플래그가 없고 모든 필드가 best-effort입니다. 필요한 필드(예: `email`이나 전화) 기준으로 판단하고, 아래 스캔 세션으로 한 프레임 오인식을 걸러내세요.
:::

## 멀티프레임 세션

```ts
import { createBusinessCardScanSession } from '@jieonist/vision-camera-ocr-scanner';

const session = createBusinessCardScanSession(); // minReads 기본값 2

// onLines 핸들러에서:
const final = session.push(parseBusinessCard(lines));
if (final != null) {
  // 확정 — 같은 연락처 identity가 여러 프레임에서 반복됨
}
```

세션은 **연락처 identity**(이메일, 없으면 전화번호 집합)가 프레임 간 반복되는 것을 anchor로 삼습니다. 이메일·전화가 없는 프레임은 버려집니다. 검증 불가 필드(이름·회사·직함·주소)는 다수결로 정하고, 이름은 반복 등장해야 신뢰합니다.

## 참고 & 한계

- 휴리스틱은 **한국어·영어** 명함 레이아웃에 맞춰져 있습니다. 다른 언어는 대부분 연락처 필드만 잡힙니다.
- 로고는 OCR이 잘 안 되는 경우가 많아 `company`는 법인 접미사 줄(주식회사 / Co., Ltd)이나 이메일 도메인과 일치하는 줄에서 나옵니다.
- 장식 폰트·세로 레이아웃은 정확도를 떨어뜨립니다. 결과는 **자동입력 힌트**로 쓰고 사용자가 수정할 수 있게 하세요.
- `detectDocument()`에서 명함은 **가드가 걸린 최후순위**입니다: MRZ·카드가 아니고 **이메일이 있을 때만** 명함으로 감지합니다 — 전화번호 하나만으로 감지하면 영수증·포스터까지 명함이 돼 버리기 때문입니다.
