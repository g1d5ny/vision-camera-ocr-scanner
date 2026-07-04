import type { Frame } from 'react-native-vision-camera';
import type { HybridObject } from 'react-native-nitro-modules';

/**
 * Raw OCR output from the native engines (Apple Vision on iOS, ML Kit on Android).
 *
 * Mode-specific structuring (MRZ, card, business card, receipt) happens in the
 * TypeScript layer — the native side only recognizes text.
 */
export interface OcrResult {
  /** Full recognized text, lines joined by "\n". */
  text: string;
  /** Recognized text split into lines, ordered top-to-bottom. */
  lines: string[];
}

export interface VisionCameraOcrScanner extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  /** Run OCR on a single camera frame and return the recognized text. */
  scan(frame: Frame): OcrResult;
}
