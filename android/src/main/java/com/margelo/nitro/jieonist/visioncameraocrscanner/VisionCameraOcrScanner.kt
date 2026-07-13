package com.margelo.nitro.jieonist.visioncameraocrscanner

import android.graphics.Rect
import android.media.Image
import androidx.camera.core.ExperimentalGetImage
import com.facebook.proguard.annotations.DoNotStrip
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.public.NativeFrame
import java.util.concurrent.TimeUnit

private class Row(
  val lines: MutableList<com.google.mlkit.vision.text.Text.Line>,
  var top: Int,
  var bottom: Int,
)

@DoNotStrip
class VisionCameraOcrScanner : HybridVisionCameraOcrScannerSpec() {
  // Reuse a single recognizer instead of allocating one per frame. scan() runs
  // on the single frame-processor thread, so unsynchronized reuse is safe as
  // long as one scanner instance is not shared across multiple camera outputs.
  private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  // Reuse one NV21 buffer across scans — a fresh multi-MB array per frame is
  // needless GC pressure. If a recognition timed out, ML Kit may still be
  // reading the buffer, so the next scan allocates a fresh one instead of
  // reusing it (a stale read of a plain array is at worst one misread frame,
  // never a crash).
  private var nv21Pool: ByteArray? = null
  private var poolMaybeInUse = false

  @OptIn(ExperimentalGetImage::class)
  override fun scan(frame: HybridFrameSpec, options: ScanOptions?): OcrResult {
    val nativeFrame = frame as? NativeFrame ?: return OcrResult("", arrayOf(), arrayOf())
    val imageProxy = nativeFrame.image
    val mediaImage = try {
      imageProxy.image
    } catch (_: Throwable) {
      null
    } ?: return OcrResult("", arrayOf(), arrayOf())

    val rotation = imageProxy.imageInfo.rotationDegrees
    // Default ROI is the central band (display-vertical middle half) — the
    // region under a centered on-screen guide box. ML Kit downscales large
    // inputs internally, so cropping preserves glyph detail a full frame would
    // lose, and drops background text entirely. The band is symmetric around
    // the center, so 90/270 and 0/180 collapse to the same two cases.
    val crop = when {
      options?.roi == ScanRoi.FULL -> Rect(0, 0, mediaImage.width, mediaImage.height)
      rotation == 90 || rotation == 270 ->
        Rect(mediaImage.width / 4, 0, mediaImage.width * 3 / 4, mediaImage.height)
      else -> Rect(0, mediaImage.height / 4, mediaImage.width, mediaImage.height * 3 / 4)
    }
    // Hand ML Kit a copy (the cropped NV21 bytes), never the live camera
    // buffer: if the await below times out, the recognizer may still be
    // reading its input after the caller disposes the frame — harmless with a
    // copy, a native crash with the zero-copy media Image.
    val nv21 = try {
      cropToNv21(mediaImage, crop)
    } catch (_: Throwable) {
      return OcrResult("", arrayOf(), arrayOf())
    }
    val input = try {
      InputImage.fromByteArray(
        nv21.bytes, nv21.width, nv21.height, rotation, InputImage.IMAGE_FORMAT_NV21
      )
    } catch (_: Throwable) {
      return OcrResult("", arrayOf(), arrayOf())
    }
    // ML Kit returns bounding boxes in the upright (display) coordinate
    // system of the input, so the normalization dims swap for 90/270.
    val uprightWidth = if (rotation == 90 || rotation == 270) nv21.height else nv21.width
    val uprightHeight = if (rotation == 90 || rotation == 270) nv21.width else nv21.height
    val text = try {
      // scan() runs on the frame-processor thread (never the main thread), so
      // blocking on the recognizer here is safe — and required, since the frame
      // is disposed by the caller as soon as scan() returns.
      // Timeout so a hung recognizer can never block the frame-processor
      // thread (and thus the camera pipeline) forever.
      Tasks.await(recognizer.process(input), 2, TimeUnit.SECONDS)
    } catch (_: Throwable) {
      // The recognizer may still be reading the pooled buffer — retire it.
      poolMaybeInUse = true
      return OcrResult("", arrayOf(), arrayOf())
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
    val ordered = rows
      .flatMap { row -> row.lines.sortedBy { it.boundingBox?.left ?: Int.MAX_VALUE } }
    val lines = ordered.map { it.text }
    // Normalized 0..1 against the scanned region (the crop), upright, with a
    // top-left origin — the same space the iOS implementation reports.
    val lineItems = ordered.map { line ->
      val box = line.boundingBox
      if (box == null) {
        OcrLine(line.text, 0.0, 0.0, 0.0, 0.0)
      } else {
        OcrLine(
          line.text,
          box.left.toDouble() / uprightWidth,
          box.top.toDouble() / uprightHeight,
          box.width().toDouble() / uprightWidth,
          box.height().toDouble() / uprightHeight
        )
      }
    }
    return OcrResult(lines.joinToString("\n"), lines.toTypedArray(), lineItems.toTypedArray())
  }

  private class Nv21Crop(val bytes: ByteArray, val width: Int, val height: Int)

  /**
   * Copy a crop of a YUV_420_888 image into a fresh NV21 buffer, honoring
   * row/pixel strides. No JPEG or Bitmap round-trip — this is the only copy
   * on the hot path, and it copies just the crop region.
   */
  private fun cropToNv21(image: Image, crop: Rect): Nv21Crop {
    // Snap to even offsets/sizes so the 2x2-subsampled chroma stays aligned.
    val left = (crop.left.coerceAtLeast(0)) and 1.inv()
    val top = (crop.top.coerceAtLeast(0)) and 1.inv()
    val width = (crop.right.coerceAtMost(image.width) - left) and 1.inv()
    val height = (crop.bottom.coerceAtMost(image.height) - top) and 1.inv()
    require(width > 0 && height > 0) { "empty crop" }
    val size = width * height * 3 / 2
    val pooled = nv21Pool
    val nv21 = if (!poolMaybeInUse && pooled != null && pooled.size == size) {
      pooled
    } else {
      ByteArray(size).also {
        nv21Pool = it
        poolMaybeInUse = false
      }
    }

    val yPlane = image.planes[0]
    // duplicate() so the live camera buffer's position/limit are never mutated.
    val yBuffer = yPlane.buffer.duplicate()
    var out = 0
    if (yPlane.pixelStride == 1) {
      for (row in 0 until height) {
        yBuffer.position((top + row) * yPlane.rowStride + left)
        yBuffer.get(nv21, out, width)
        out += width
      }
    } else {
      for (row in 0 until height) {
        val base = (top + row) * yPlane.rowStride + left * yPlane.pixelStride
        for (col in 0 until width) {
          nv21[out++] = yBuffer.get(base + col * yPlane.pixelStride)
        }
      }
    }

    // NV21 wants interleaved VU at quarter resolution.
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]
    val uBuffer = uPlane.buffer.duplicate()
    val vBuffer = vPlane.buffer.duplicate()
    val chromaTop = top / 2
    val chromaLeft = left / 2
    for (row in 0 until height / 2) {
      val vBase = (chromaTop + row) * vPlane.rowStride
      val uBase = (chromaTop + row) * uPlane.rowStride
      for (col in 0 until width / 2) {
        nv21[out++] = vBuffer.get(vBase + (chromaLeft + col) * vPlane.pixelStride)
        nv21[out++] = uBuffer.get(uBase + (chromaLeft + col) * uPlane.pixelStride)
      }
    }
    return Nv21Crop(nv21, width, height)
  }

  override fun dispose() {
    // dispose() must not throw.
    try {
      recognizer.close()
    } catch (_: Throwable) {}
    super.dispose()
  }
}
