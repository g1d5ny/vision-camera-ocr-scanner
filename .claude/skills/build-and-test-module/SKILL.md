---
name: build-and-test-module
description: 이 Nitro RN 라이브러리를 빌드하고 예제 앱을 실행해 변경이 동작하는지 검증한다. 빌드/테스트/예제 실행, 또는 네이티브(Swift/Kotlin)·Nitro 스펙 코드 수정 후 모듈 검증을 요청할 때 사용.
---

# @jieonist/vision-camera-ocr-scanner 빌드 & 테스트

이 repo의 모든 명령은 Node 20으로 실행한다 (글로벌 node는 18):

```bash
export PATH="$HOME/.n/bin:$PATH"
```

## 1. 설치 (최초 / 의존성 변경 후)

```bash
yarn
```

## 2. Nitro 네이티브 글루 재생성 (`src/*.nitro.ts` 수정 후)

```bash
yarn nitrogen
```

Nitro 스펙이 바뀌었으면 빌드 전에 반드시 실행한다 — 오래된 생성 글루는 혼란스러운 네이티브 빌드 에러를 일으킨다.

## 3. 라이브러리 빌드

```bash
yarn typecheck
yarn lint
yarn prepare   # nitrogen + bob build 실행
```

## 4. 예제 앱 실행

- iOS: `yarn example ios` (최초 1회: `cd example/ios && pod install`)
- Android: `yarn example android`

## 5. 동작 검증

- 앱이 실행되고 해당 스캔 화면이 동작하는지 확인.
- 네이티브 로그 확인: iOS는 Xcode/Console; Android는 `adb logcat | grep -iE "ocr|nitro|visioncamera"`.
- 프레임당 코드는 프레임 드롭/FPS 저하와 메모리 증가를 관찰.

## 보고

무엇을 빌드했고, 무엇을 실행했고, 에러가 있으면 **실제 출력**과 함께 명시한다. 시뮬레이터/기기가 없어 건너뛴 단계가 있으면 그대로 말한다 — 실행하지 않은 단계를 성공했다고 하지 않는다.
