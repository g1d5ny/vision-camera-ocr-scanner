import CoreMedia
import NitroModules
import Vision
import VisionCamera

class VisionCameraOcrScanner: HybridVisionCameraOcrScannerSpec {
    // Reuse a single request instead of allocating one per frame. scan() runs
    // on the single frame-processor thread, so unsynchronized reuse is safe as
    // long as one scanner instance is not shared across multiple camera outputs.
    private lazy var request: VNRecognizeTextRequest = {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        // MRZ / card numbers are not natural language — disable correction.
        request.usesLanguageCorrection = false
        return request
    }()

    func scan(frame: (any HybridFrameSpec), options: ScanOptions?) throws -> OcrResult {
        guard let nativeFrame = frame as? any NativeFrame,
              let sampleBuffer = nativeFrame.sampleBuffer,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer)
        else {
            return OcrResult(text: "", lines: [], lineItems: [])
        }

        // regionOfInterest is zero-copy and applies in the oriented (upright)
        // coordinate space with a lower-left origin — verified empirically, the
        // header doesn't say — so the central band is simply the middle half of
        // the display height regardless of the buffer's rotation.
        let roi = options?.roi ?? .centralband
        request.regionOfInterest = roi == .full
            ? CGRect(x: 0, y: 0, width: 1, height: 1)
            : CGRect(x: 0, y: 0.25, width: 1, height: 0.5)

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
            return OcrResult(text: "", lines: [], lineItems: [])
        }

        // Vision does not guarantee reading order, and fragments on the same
        // visual row (e.g. the four groups of a card number) can come back as
        // separate observations in arbitrary order. Cluster observations into
        // rows by vertical overlap — growing the row bounds as fragments join,
        // so grouping doesn't hinge on the first fragment — then read each row
        // left-to-right. Mirrors the Android implementation. boundingBox has a
        // lower-left origin with y up and is normalized to the ROI (verified
        // empirically); flip to y-down so lineItems use the same
        // top-left-origin, ROI-normalized space as Android.
        let entries = (request.results ?? [])
            .compactMap { observation -> (top: CGFloat, bottom: CGFloat, left: CGFloat, width: CGFloat, text: String)? in
                guard let text = observation.topCandidates(1).first?.string else { return nil }
                let box = observation.boundingBox
                return (top: 1 - box.maxY, bottom: 1 - box.minY, left: box.minX, width: box.width, text: text)
            }
            .sorted { $0.top < $1.top }
        var rows: [(entries: [(top: CGFloat, bottom: CGFloat, left: CGFloat, width: CGFloat, text: String)], top: CGFloat, bottom: CGFloat)] = []
        for entry in entries {
            if let i = rows.indices.last, rows[i].bottom > rows[i].top,
               entry.top < rows[i].bottom - (rows[i].bottom - rows[i].top) / 2 {
                rows[i].entries.append(entry)
                rows[i].top = min(rows[i].top, entry.top)
                rows[i].bottom = max(rows[i].bottom, entry.bottom)
            } else {
                rows.append((entries: [entry], top: entry.top, bottom: entry.bottom))
            }
        }
        let ordered = rows.flatMap { row in
            row.entries.sorted { $0.left < $1.left }
        }
        let lines = ordered.map { $0.text }
        let lineItems = ordered.map { entry in
            OcrLine(
                text: entry.text,
                x: entry.left,
                y: entry.top,
                width: entry.width,
                height: entry.bottom - entry.top
            )
        }
        return OcrResult(
            text: lines.joined(separator: "\n"),
            lines: lines,
            lineItems: lineItems
        )
    }
}
