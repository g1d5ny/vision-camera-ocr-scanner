---
layout: home

hero:
  name: vision-camera-ocr-scanner
  text: On-device OCR scanner for React Native
  tagline: Scan passports (MRZ) and more — free, on-device, New Architecture. Built on VisionCamera v5 + Nitro.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/g1d5ny/vision-camera-ocr-scanner

features:
  - title: 🔒 On-device & free
    details: No API keys, no servers, no per-scan fees. Nothing leaves the device — great for privacy-sensitive apps.
  - title: 🏗️ New Architecture native
    details: Nitro + Fabric via a react-native-vision-camera v5 frame processor. Fast per-frame OCR (Apple Vision / ML Kit).
  - title: 🧩 Structured output
    details: Returns parsed fields (passport number, name, dates, checksum validity) — not just raw text.
---

::: warning EARLY DEVELOPMENT
This library is a work in progress. **MRZ (passport), credit card, and business card scanning work on iOS and Android today**; the receipt mode is on the [roadmap](/guide/getting-started#roadmap).
:::
