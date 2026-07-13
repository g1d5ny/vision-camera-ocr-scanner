import type { Frame } from 'react-native-vision-camera';
import type { HybridObject } from 'react-native-nitro-modules';

/**
 * One recognized line with its layout box.
 *
 * Coordinates are normalized 0..1 against the scanned region (the ROI — the
 * central band by default), in upright display orientation with a top-left
 * origin, identical on both platforms. Relative comparisons (which line is
 * taller / higher on the card) are the intended use.
 *
 * An all-zero box is the "no bounding box" sentinel (ML Kit occasionally
 * returns lines without one) — treat a zero height as unknown, not tiny.
 */
export interface OcrLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  /**
   * Layout boxes for each line, same order and length as `lines`. Lets
   * parsers use size/position signals (a business card's tallest text is the
   * name or logo).
   */
  lineItems: OcrLine[];
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
