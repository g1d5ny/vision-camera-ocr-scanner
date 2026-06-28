# TODO — @jieonist/vision-camera-ocr-scanner

> 표기: `- [ ]` 할 일 · `- [~]` 진행 중 · `- [x]` 완료

## Setup
- [x] Nitro 모듈 스캐폴딩 (create-react-native-library)
- [x] Node 20 해결 (`n`으로 user-local, `N_PREFIX=$HOME/.n`)
- [x] CLAUDE.md, `rn-native-reviewer` 에이전트, `build-and-test-module` 스킬 추가
- [x] package.json keywords 검색용 보강
- [x] `track-progress` 스킬 + 이 TODO.md 추가
- [x] Claude 관련 md gitignore (CLAUDE.md, .claude/)
- [x] Claude 관련 md 한국어화
- [ ] `yarn` 설치 + `yarn prepare`로 골격 빌드 검증
- [ ] 예제 앱 실행 확인 (iOS / Android)

## Foundations
- [ ] `react-native-vision-camera` (v5/Nitro) peer dependency 추가
- [ ] OCR 결과 Nitro 스펙 형태 결정 (raw 텍스트 블록 + 구조화 필드)
- [ ] Apple Vision (iOS) + ML Kit Text Recognition (Android) 연결
- [ ] Expo 지원: config plugin 추가 + dev-build 소비 검증 (New Arch 전용, Expo Go 불가)
- [ ] 지원 플랫폼 문서화: Expo dev build + bare RN CLI, New Architecture 전용

## MRZ mode (첫 번째 — 체크섬으로 자체검증)
- [ ] Nitro 스펙에 MRZ 결과 타입 정의
- [ ] `mrz` 파서 + 체크섬 검증 통합 (TS 레이어)
- [ ] 네이티브: MRZ 밴드 감지 + OCR
- [ ] 예제 화면: 여권 MRZ 스캔
- [ ] MRZ 파싱 테스트

## Later modes
- [ ] 신용카드 (번호 + 유효기간, Luhn 검증)
- [ ] 명함 → 구조화 연락처
- [ ] 영수증 (상호 / 날짜 / 합계)

## Release
- [x] README: 사용법 + 지원 플랫폼 + New Arch 요구사항 (API 확정되면 업데이트)
- [ ] npm에 0.1.0 배포
