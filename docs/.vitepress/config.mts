import { defineConfig } from 'vitepress';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'vision-camera-ocr-scanner',
  description:
    'On-device OCR structured scanner (MRZ / card / …) for React Native — VisionCamera v5 + Nitro',
  // Project pages are served under /<repo>/
  base: '/vision-camera-ocr-scanner/',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'MRZ', link: '/guide/mrz' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'MRZ Scanning', link: '/guide/mrz' },
        ],
      },
    ],
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
});
