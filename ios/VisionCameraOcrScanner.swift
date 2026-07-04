import CoreMedia
import NitroModules
import Vision
import VisionCamera

class VisionCameraOcrScanner: HybridVisionCameraOcrScannerSpec {
    // Throttle: only run OCR every Nth frame (~3 fps at a 30 fps camera).
    private var frameCount = 0
    private let frameSkip = 10

    func scan(frame: (any HybridFrameSpec)) throws -> OcrResult {
        frameCount += 1
        if frameCount % frameSkip != 0 {
            return OcrResult(text: "", lines: [])
        }

        guard let nativeFrame = frame as? any NativeFrame,
              let sampleBuffer = nativeFrame.sampleBuffer,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
        else {
            return OcrResult(text: "", lines: [])
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        // MRZ / card numbers are not natural language — disable correction.
        request.usesLanguageCorrection = false

        // Back-camera buffers are landscape-right in portrait; adjust if text is rotated.
        let handler = VNImageRequestHandler(
            cvPixelBuffer: pixelBuffer,
            orientation: .right,
            options: [:]
        )

        do {
            try handler.perform([request])
        } catch {
            return OcrResult(text: "", lines: [])
        }

        let observations = request.results ?? []
        let lines = observations.compactMap { $0.topCandidates(1).first?.string }
        return OcrResult(text: lines.joined(separator: "\n"), lines: lines)
    }
}
