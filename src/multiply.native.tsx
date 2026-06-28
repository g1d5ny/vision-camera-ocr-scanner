import { NitroModules } from 'react-native-nitro-modules';
import type { VisionCameraOcrScanner } from './VisionCameraOcrScanner.nitro';

const VisionCameraOcrScannerHybridObject =
  NitroModules.createHybridObject<VisionCameraOcrScanner>('VisionCameraOcrScanner');

export function multiply(a: number, b: number): number {
  return VisionCameraOcrScannerHybridObject.multiply(a, b);
}
