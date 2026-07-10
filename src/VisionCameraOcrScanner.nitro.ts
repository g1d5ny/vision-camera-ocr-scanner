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

/** Region of the frame to recognize, in display (upright) coordinates. */
export type ScanRoi =
  /**
   * The middle half of the frame along the display-vertical axis — the area
   * under a centered on-screen guide box. ML Kit downscales large inputs, so
   * cropping preserves glyph detail a full frame would lose, and background
   * text is dropped entirely. This is the default.
   */
  | 'centralBand'
  /** Recognize the whole frame. */
  | 'full';

export interface ScanOptions {
  /** Region to recognize. Defaults to `'centralBand'`. */
  roi?: ScanRoi;
}

export interface VisionCameraOcrScanner extends HybridObject<{
  ios: 'swift';
  android: 'kotlin';
}> {
  /**
   * Run OCR on a camera frame and return the recognized text.
   *
   * Every call performs real OCR — there is no internal throttling. OCR takes
   * hundreds of milliseconds, so throttle calls yourself in the frame worklet
   * (e.g. run every Nth frame; see the example app).
   */
  scan(frame: Frame, options?: ScanOptions): OcrResult;
}
