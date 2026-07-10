import { NitroModules } from 'react-native-nitro-modules';
import type {
  VisionCameraOcrScanner,
  OcrResult,
  ScanOptions,
  ScanRoi,
} from './VisionCameraOcrScanner.nitro';

export { parseMrz, extractMrzLines } from './parseMrz';
export type { MrzResult } from './parseMrz';
export { parseCard, detectBrand } from './parseCard';
export type { CardResult } from './parseCard';
export { detectDocument } from './detectDocument';
export type { DetectedDocument } from './detectDocument';
export { createCardScanSession, createMrzScanSession } from './scanSession';
export type { ScanSession, ScanSessionOptions } from './scanSession';
export type { OcrResult, ScanOptions, ScanRoi, VisionCameraOcrScanner };

let scanner: VisionCameraOcrScanner | null = null;

/**
 * The native OCR scanner (Nitro HybridObject), created lazily on first use.
 *
 * Call `getOcrScanner().scan(frame)` inside a VisionCamera frame processor
 * worklet to get the raw recognized text, then parse it on the JS thread with
 * `parseMrz` (the `mrz` parser is not worklet-safe).
 *
 * `scan()` runs real OCR on every call (hundreds of ms) — throttle calls in
 * your worklet, e.g. run every Nth frame.
 *
 * This is a shared singleton that assumes a single frame-processor thread: do
 * not call it from two camera outputs at once. Create separate instances with
 * `NitroModules.createHybridObject` if you need more than one camera.
 */
export function getOcrScanner(): VisionCameraOcrScanner {
  if (scanner == null) {
    scanner = NitroModules.createHybridObject<VisionCameraOcrScanner>(
      'VisionCameraOcrScanner'
    );
  }
  return scanner;
}
