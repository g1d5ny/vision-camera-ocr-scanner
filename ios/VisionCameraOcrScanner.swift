import CoreMedia
import NitroModules
import Vision
import VisionCamera

class VisionCameraOcrScanner: HybridVisionCameraOcrScannerSpec {
    // Throttle: only run OCR every Nth frame (~3 fps at a 30 fps camera).
    private var frameCount = 0
    private let frameSkip = 10

    // Reuse a single request instead of allocating one per frame.
    private lazy var request: VNRecognizeTextRequest = {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        // MRZ / card numbers are not natural language — disable correction.
        request.usesLanguageCorrection = false
        return request
    }()

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

        // NOTE: assumes a portrait back-camera buffer (landscape-right). This works
        // for the passport-scan use case; deriving orientation from the frame for
        // all device rotations is a TODO.
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

        // Vision does not guarantee reading order. Sort top-to-bottom so the MRZ
        // lines are in the right order for the parser (boundingBox origin is
        // bottom-left and y increases upward, so higher y = higher on the page).
        let observations = (request.results ?? [])
            .sorted { $0.boundingBox.origin.y > $1.boundingBox.origin.y }
        let lines = observations.compactMap { $0.topCandidates(1).first?.string }
        return OcrResult(text: lines.joined(separator: "\n"), lines: lines)
    }
}
