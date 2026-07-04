import { NitroModules } from 'react-native-nitro-modules';
import type {
  VisionCameraOcrScanner,
  OcrResult,
} from './VisionCameraOcrScanner.nitro';

export { parseMrz, extractMrzLines } from './parseMrz';
export type { MrzResult } from './parseMrz';
export { parseCard, detectBrand } from './parseCard';
export type { CardResult } from './parseCard';
export type { OcrResult, VisionCameraOcrScanner };

let scanner: VisionCameraOcrScanner | null = null;

/**
 * The native OCR scanner (Nitro HybridObject), created lazily on first use.
 *
 * Call `getOcrScanner().scan(frame)` inside a VisionCamera frame processor
 * worklet to get the raw recognized text, then parse it on the JS thread with
 * `parseMrz` (the `mrz` parser is not worklet-safe).
 */
export function getOcrScanner(): VisionCameraOcrScanner {
  if (scanner == null) {
    scanner = NitroModules.createHybridObject<VisionCameraOcrScanner>(
      'VisionCameraOcrScanner'
    );
  }
  return scanner;
}
