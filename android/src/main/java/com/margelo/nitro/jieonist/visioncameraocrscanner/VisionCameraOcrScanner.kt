package com.margelo.nitro.jieonist.visioncameraocrscanner

import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.camera.HybridFrameSpec

@DoNotStrip
class VisionCameraOcrScanner : HybridVisionCameraOcrScannerSpec() {
  override fun scan(frame: HybridFrameSpec): OcrResult {
    // TODO: run ML Kit Text Recognition on the frame's ImageProxy (frame.image)
    // and return the recognized lines. Requires pixelFormat = "rgb".
    return OcrResult("", arrayOf())
  }
}
