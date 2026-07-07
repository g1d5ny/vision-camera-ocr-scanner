package com.margelo.nitro.jieonist.visioncameraocrscanner

import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import androidx.camera.core.ExperimentalGetImage
import com.facebook.proguard.annotations.DoNotStrip
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.public.NativeFrame
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

private class Row(
  val lines: MutableList<com.google.mlkit.vision.text.Text.Line>,
  var top: Int,
  var bottom: Int,
)

@DoNotStrip
class VisionCameraOcrScanner : HybridVisionCameraOcrScannerSpec() {
  // Throttle: only run OCR every Nth frame (~6 fps at a 30 fps camera).
  // Multi-frame consensus (scan sessions) needs several agreeing reads, so
  // the read rate directly sets how fast a scan confirms.
  private var frameCount = 0
  private val frameSkip = 5

  // Reuse a single recognizer instead of allocating one per frame.
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  @OptIn(ExperimentalGetImage::class)
  override fun scan(frame: HybridFrameSpec): OcrResult {
    frameCount++
    if (frameCount % frameSkip != 0) {
      return OcrResult("", arrayOf())
    }

    val nativeFrame = frame as? NativeFrame ?: return OcrResult("", arrayOf())
    val imageProxy = nativeFrame.image
    // ML Kit reads the YUV_420_888 media image directly — no RGB conversion needed.
    val mediaImage = try {
      imageProxy.image
    } catch (_: Throwable) {
      null
    } ?: return OcrResult("", arrayOf())

    val rotation = imageProxy.imageInfo.rotationDegrees
    // Crop to the central band (display-vertical middle half) before
    // recognition. ML Kit downscales large inputs internally, so feeding it
    // the region under the on-screen guide box preserves glyph detail that
    // a full frame would lose — and drops background text entirely.
    // The band is symmetric around the center, so 90/270 and 0/180 collapse
    // to the same two cases. Falls back to the full frame if cropping fails.
    val input = cropCentralBand(mediaImage, rotation)
      ?: InputImage.fromMediaImage(mediaImage, rotation)
    val text = try {
      // scan() runs on the frame-processor thread (never the main thread), so
      // blocking on the recognizer here is safe — and required, since the frame
      // is disposed by the caller as soon as scan() returns.
      // Timeout so a hung recognizer can never block the frame-processor
      // thread (and thus the camera pipeline) forever.
      Tasks.await(recognizer.process(input), 2, TimeUnit.SECONDS)
    } catch (_: Throwable) {
      return OcrResult("", arrayOf())
    }

    // ML Kit does not guarantee reading order. Sorting by top alone is not
    // enough: fragments on the same visual row (e.g. the four groups of a
    // card number, each returned as its own line) land in arbitrary order.
    // Cluster lines into rows by vertical overlap — growing the row bounds
    // as fragments join, so grouping doesn't hinge on the first fragment —
    // then read each row left-to-right. Lines without a bounding box can't
    // be clustered and stay as their own row.
    val sorted = text.textBlocks
      .flatMap { it.lines }
      .sortedBy { it.boundingBox?.top ?: Int.MAX_VALUE }
    val rows = mutableListOf<Row>()
    for (line in sorted) {
      val box = line.boundingBox
      val row = rows.lastOrNull()
      if (box != null && row != null && row.bottom > row.top &&
        box.top < row.bottom - (row.bottom - row.top) / 2
      ) {
        row.lines.add(line)
        row.top = minOf(row.top, box.top)
        row.bottom = maxOf(row.bottom, box.bottom)
      } else {
        rows.add(Row(mutableListOf(line), box?.top ?: 0, box?.bottom ?: 0))
      }
    }
    val lines = rows
      .flatMap { row -> row.lines.sortedBy { it.boundingBox?.left ?: Int.MAX_VALUE } }
      .map { it.text }
    return OcrResult(lines.joinToString("\n"), lines.toTypedArray())
  }

  private fun cropCentralBand(image: Image, rotation: Int): InputImage? {
    return try {
      val width = image.width
      val height = image.height
      // Display-vertical = sensor-horizontal when the frame is rotated ±90°.
      val crop = if (rotation == 90 || rotation == 270) {
        Rect(width / 4, 0, width * 3 / 4, height)
      } else {
        Rect(0, height / 4, width, height * 3 / 4)
      }
      val yuv = YuvImage(yuv420ToNv21(image), ImageFormat.NV21, width, height, null)
      val jpeg = ByteArrayOutputStream()
      if (!yuv.compressToJpeg(crop, 90, jpeg)) return null
      val bytes = jpeg.toByteArray()
      val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
      InputImage.fromBitmap(bitmap, rotation)
    } catch (_: Throwable) {
      null
    }
  }

  /** YUV_420_888 → NV21, honoring row/pixel strides. */
  private fun yuv420ToNv21(image: Image): ByteArray {
    val width = image.width
    val height = image.height
    val nv21 = ByteArray(width * height * 3 / 2)

    val yPlane = image.planes[0]
    val yBuffer = yPlane.buffer
    var out = 0
    for (row in 0 until height) {
      yBuffer.position(row * yPlane.rowStride)
      if (yPlane.pixelStride == 1) {
        yBuffer.get(nv21, out, width)
        out += width
      } else {
        for (col in 0 until width) {
          nv21[out++] = yBuffer.get(row * yPlane.rowStride + col * yPlane.pixelStride)
        }
      }
    }

    // NV21 wants interleaved VU at quarter resolution.
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]
    val uBuffer = uPlane.buffer
    val vBuffer = vPlane.buffer
    for (row in 0 until height / 2) {
      for (col in 0 until width / 2) {
        nv21[out++] = vBuffer.get(row * vPlane.rowStride + col * vPlane.pixelStride)
        nv21[out++] = uBuffer.get(row * uPlane.rowStride + col * uPlane.pixelStride)
      }
    }
    return nv21
  }

  override fun dispose() {
    // dispose() must not throw.
    try {
      recognizer.close()
    } catch (_: Throwable) {}
    super.dispose()
  }
}
