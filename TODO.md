# TODO — @jieonist/vision-camera-ocr-scanner

> 표기: `- [ ]` 할 일 · `- [~]` 진행 중 · `- [x]` 완료
> 스캔 모드 4종: **MRZ(여권) · 신용카드 · 명함 · 영수증**

## Setup
- [x] Nitro 모듈 스캐폴딩 (create-react-native-library)
- [x] Node 20 해결 (`n`으로 user-local, `N_PREFIX=$HOME/.n`)
- [x] CLAUDE.md, `nitro-reviewer` 에이전트, `build-and-test-module` 스킬 추가
- [x] package.json keywords 검색용 보강
- [x] `track-progress` 스킬 추가
- [x] Claude 관련 md (CLAUDE.md, .claude/, TODO.md) gitignore + 한국어화
- [x] git 원격 연결 (g1d5ny) + 초기 푸시
- [x] `yarn` 설치 + `yarn prepare`로 골격 빌드 검증 (nitrogen/build/typecheck/lint 모두 통과)
- [x] 예제 앱 실행 확인 — iOS·Android 모두 USB 연결 실기기에서 빌드·설치·실행 확인 (크래시 없음)

## Foundations
- [ ] `react-native-vision-camera` (v5/Nitro) peer dependency 추가
- [ ] OCR 결과 Nitro 스펙 형태 결정 (raw 텍스트 블록 + 모드별 구조화 필드)
- [ ] Apple Vision (iOS) + ML Kit Text Recognition (Android) 연결
- [ ] Expo 지원: config plugin 추가 + dev-build 소비 검증 (New Arch 전용, Expo Go 불가)
- [ ] 지원 플랫폼 문서화: Expo dev build + bare RN CLI, New Architecture 전용

## 스캔 모드 (4종, 우선순위 순)

### 1) MRZ — 여권/신분증 (첫 구현, 체크섬 자체검증) ← 지금 여기
> 파싱은 TS 레이어, 네이티브는 OCR+ROI+throttle까지 (결정됨)
- [x] VisionCamera v5 + Nitro 프레임 처리 API 문서 검증 (Nitro HybridObject + useFrameOutput 확정)
- [x] `react-native-vision-camera`(v5) + worklets + nitro-image + `mrz` 의존성 추가 (peerDeps 선언, 골격 빌드 재확인)
- [x] Nitro 스펙 정의 (`scan(frame): OcrResult` + `getOcrScanner()`) + nitrogen 재생성
- [x] `mrz` 파서 + 체크섬 검증 통합 (TS `parseMrz`/`extractMrzLines`)
- [x] MRZ 파싱 테스트 (jest 6/6 통과)
- [x] 네이티브 OCR (iOS): Swift Apple Vision `VNRecognizeTextRequest` + 프레임 throttle 구현
- [x] 예제: 카메라 MRZ 스캔 화면 (useFrameOutput + scheduleOnRN + parseMrz)
- [x] 예제 앱 deps(vision-camera/worklets/cli) + 카메라 권한(Info.plist) + pod install(79 pods, New Arch)
- [x] 시뮬레이터 컴파일 검증 통과 (Swift/Nitro/vision-camera 컴파일 OK, exit 0)
- [x] 실기기에 빌드/설치/실행 성공 (podspec에 VisionCamera 의존성 추가 + sampleBuffer 언래핑 수정)
- [x] 실제 여권으로 스캔 검증 — 이름/여권번호/국적/생년월일/만료일/성별 정상 인식 (실기기)
- [x] formatDate century 버그 수정 (만료일 33→2033), 길이 정규화로 OCR 오차 흡수
- [x] nitro-reviewer + Codex 코드 리뷰
- [x] **커밋 완료 (7f81614, 팀ID 제거)**

#### MRZ 리뷰 follow-up (커밋 5b51f00)
- [x] parseMrz: 인접 윈도우 순회 + valid/named 우선, 스냅은 fallback (잘못된 쌍/이름누락 방지) + jest 8/8
- [x] Swift: Vision observations를 boundingBox.origin.y로 정렬 (읽기 순서 보장)
- [x] Swift: `VNRecognizeTextRequest` 프로퍼티로 재사용 (성능)
- [~] Swift: orientation — `.right` 유지(세로 back-camera 동작 확인). 동적 orientation은 API 불명확+회전테스트 필요 → 주석 문서화, 나중에
- [x] 실기기 Release 빌드로 follow-up 회귀 검증 완료 — 스캔 정상 동작 ✅
- [x] Kotlin ML Kit OCR 구현 — NV21 직접 크롭 + 행 클러스터링, 실기기(폴더블) 여권/카드 스캔 검증 완료

> ✅ **MRZ 모드 마일스톤 완료**: 기획→구현→기기검증→CI 전체통과→리뷰 follow-up→회귀검증 풀사이클.

### 2) 신용카드 — 번호 + 유효기간 ✅
> 네이티브 변경 없음: 기존 `scan(frame)` OCR 재사용, 파싱만 TS 추가
- [x] `parseCard`/`detectBrand`/`CardResult` (TS) — 번호(Luhn)+브랜드+만료일+소유자
- [x] 그룹 경계 기반 카드번호 추출 (digit-soup 오탐 방지), 만료일 라벨 인접 우선
- [x] 브랜드: visa/mastercard(2-series)/amex/discover(+622126-622925)/jcb(3528-3589)/diners
- [x] jest 20/20 (브랜드 경계값·노이즈 null·라벨 만료일 엣지케이스 포함)
- [x] 예제: MRZ ⇄ 카드 모드 토글 + 카드 비율 가이드박스
- [x] Codex 리뷰 반영 (오탐 우선순위, JCB/Discover 범위, 만료일 경계)
- [x] 문서화 (en/ko card 가이드) + README 실제 API로 재작성
- [x] **커밋 완료 (9c7236f)**
- [x] `detectDocument(lines)` 자동 인식 helper (MRZ+카드 둘 다 돌려 검증되는 쪽, MRZ 우선) + 예제 "자동" 탭 + jest 5개 (Codex 상의: 버튼 기본 + auto는 opt-in)
- [x] 멀티프레임 스캔 세션 (`createCardScanSession`/`createMrzScanSession`) + 파서 강화 + jest 44/44 (커밋 f9b34bc, 9c26dc6)
- [x] 기기에서 실제 카드/자동 스캔 검증 (iOS·Android 실기기, 자동 모드 포함)

#### 전체 검증 + nitro-reviewer 리뷰 follow-up (2026-07-10) ✅
- [x] CI급 로컬 검증: typecheck·lint·jest 44/44·`yarn prepare`(nitrogen+bob) 전부 통과, nitrogen 재생성 후 diff 없음(스펙↔글루 일치)
- [x] **[Blocker] Android 핫패스 프레임당 ~18MB 복사 제거** — JPEG/Bitmap 왕복 삭제, 크롭 영역만 NV21 직접 조립(`cropToNv21`) + `InputImage.fromByteArray` + NV21 버퍼 풀링(GC 압력 제거)
- [x] **[Blocker] 숨은 네이티브 스로틀·크롭 스펙 불일치 해소** — Codex 상의(B안): 양 플랫폼 스로틀 제거, `scan(frame, options?: { roi: 'centralBand'|'full' })` 스펙 노출(기본 centralBand), 스로틀은 worklet 카운터 패턴으로 예제/README/docs 통일
- [x] [Warning] Android 타임아웃 use-after-close — 라이브 버퍼를 ML Kit에 절대 전달하지 않음(항상 복사본), 타임아웃 시 풀 버퍼 재사용 중지
- [x] [Warning] iOS 행 클러스터링 + 행 내 left 정렬 (Android와 동치 로직) + `regionOfInterest` 중앙 밴드 — ROI 좌표계(orientation 적용 후·lower-left)를 macOS Vision 실험으로 실증, 리뷰어가 독립 재검증
- [x] [Warning] 예제/문서 worklet `frame.dispose()`를 try/finally로 (스로틀 early-return 누수도 해결)
- [x] [Nit] 싱글턴 스레드 가정 문서화, parseMrz·scanSession 주석 수정, `ScanOptions`/`ScanRoi` 타입 export
- [x] 재검증: typecheck·lint·jest 44/44, iOS 기기 빌드·설치·실행 ✅, Android Kotlin 컴파일 ✅, nitro-reviewer 재리뷰 Blocker 0
- [~] iOS orientation `.right` 하드코딩 유지 (기존 결정: 세로 back-camera 검증됨, 동적 orientation은 나중에)
- [ ] [Nit] Android 크로마 복사 pixelStride=2 케이스 bulk get 최적화 (행당 1회 복사, 수 ms 절약 — 선택)
- [x] 기기에서 실제 여권/카드 스캔 회귀 검증 — iOS·Android 실기기 모두 이상 없음 (사용자 확인, 2026-07-10)

### 3) 명함 → 연락처 ← 지금 여기
- [ ] Nitro 스펙에 명함 결과 타입 정의
- [ ] 이름·회사·전화·이메일·주소 추출 휴리스틱 (TS)
- [ ] 예제 화면 + 테스트

### 4) 영수증 — 상호/날짜/합계
- [ ] Nitro 스펙에 영수증 결과 타입 정의
- [ ] 상호·날짜·합계·통화 추출 (TS)
- [ ] 예제 화면 + 테스트

## Release
- [x] README: 사용법 + 지원 플랫폼 + New Arch 요구사항 (실제 parseMrz/parseCard API로 재작성)
- [ ] npm에 0.1.0 배포
- [x] 문서 사이트: **VitePress → GitHub Pages** 자동배포 (docs.yml), 한/영 i18n (`g1d5ny.github.io/vision-camera-ocr-scanner`)
- [ ] (사용자 수동) repo Settings → Pages → Source: GitHub Actions 활성화 확인

## CI (GitHub Actions) — ✅ 전체 통과 (run 28700804186)
- [x] yarn.lock 추적, android gradle+CMake vision-camera, Gemfile 번들러+base64/drb, pod repo update 제거
- [x] android/CMakeLists: VisionCamera C++ prefab 연결 (find_package + link ::VisionCamera)
- [x] build-android ✅ / build-ios ✅ / lint ✅ / build-library ✅
