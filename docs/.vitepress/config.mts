import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'vision-camera-ocr-scanner',
  description:
    'On-device OCR structured scanner (MRZ / card / …) for React Native — VisionCamera v5 + Nitro',
  // Project pages are served under /<repo>/
  base: '/vision-camera-ocr-scanner/',

  themeConfig: {
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/g1d5ny/vision-camera-ocr-scanner',
      },
    ],
    footer: {
      message: 'MIT Licensed',
      copyright: '© jieonist',
    },
  },

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/getting-started' },
          { text: 'MRZ', link: '/guide/mrz' },
          { text: 'Card', link: '/guide/card' },
        ],
        sidebar: [
          {
            text: 'Guide',
            items: [
              { text: 'Getting Started', link: '/guide/getting-started' },
              { text: 'MRZ Scanning', link: '/guide/mrz' },
              { text: 'Credit Card Scanning', link: '/guide/card' },
            ],
          },
        ],
      },
    },
    ko: {
      label: '한국어',
      lang: 'ko',
      link: '/ko/',
      themeConfig: {
        nav: [
          { text: '가이드', link: '/ko/guide/getting-started' },
          { text: 'MRZ', link: '/ko/guide/mrz' },
          { text: '카드', link: '/ko/guide/card' },
        ],
        sidebar: [
          {
            text: '가이드',
            items: [
              { text: '시작하기', link: '/ko/guide/getting-started' },
              { text: 'MRZ 스캔', link: '/ko/guide/mrz' },
              { text: '신용카드 스캔', link: '/ko/guide/card' },
            ],
          },
        ],
        docFooter: { prev: '이전', next: '다음' },
        outline: { label: '이 페이지' },
        darkModeSwitchLabel: '다크 모드',
        returnToTopLabel: '맨 위로',
        langMenuLabel: '언어 변경',
      },
    },
  },
});
