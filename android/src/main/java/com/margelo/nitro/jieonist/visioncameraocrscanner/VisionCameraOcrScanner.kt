package com.margelo.nitro.jieonist.visioncameraocrscanner
  
import com.facebook.proguard.annotations.DoNotStrip

@DoNotStrip
class VisionCameraOcrScanner : HybridVisionCameraOcrScannerSpec() {
  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }
}
