---
layout: home

hero:
  name: vision-camera-ocr-scanner
  text: React Native용 온디바이스 OCR 스캐너
  tagline: 여권(MRZ)을 비롯한 문서 스캔 — 무료, 온디바이스, New Architecture. VisionCamera v5 + Nitro 기반.
  actions:
    - theme: brand
      text: 시작하기
      link: /ko/guide/getting-started
    - theme: alt
      text: GitHub에서 보기
      link: https://github.com/g1d5ny/vision-camera-ocr-scanner

features:
  - title: 🔒 온디바이스 & 무료
    details: API 키·서버·건당 요금이 없습니다. 데이터가 기기 밖으로 나가지 않아 프라이버시가 중요한 앱에 적합합니다.
  - title: 🏗️ New Architecture 네이티브
    details: react-native-vision-camera v5 프레임 프로세서 위의 Nitro + Fabric. 프레임 단위로 빠른 OCR(Apple Vision / ML Kit).
  - title: 🧩 구조화된 결과
    details: 원본 텍스트가 아니라 파싱된 필드(여권번호, 이름, 날짜, 체크섬 유효성)를 돌려줍니다.
---

::: warning 초기 개발 단계
아직 개발 중인 라이브러리입니다. **MRZ(여권)·신용카드 스캔은 iOS와 Android에서 오늘 동작**하며, 명함·영수증 모드는 [로드맵](/ko/guide/getting-started#로드맵)에 있습니다.
:::
