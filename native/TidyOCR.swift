import AppKit
import Foundation
import ImageIO
import PDFKit
import Vision

private let maxDimension = 1800

private func imageForRecognition(_ url: URL) -> CGImage? {
    if url.pathExtension.lowercased() == "pdf" {
        guard let document = PDFDocument(url: url), let page = document.page(at: 0) else { return nil }
        let bounds = page.bounds(for: .cropBox)
        let longestSide = max(bounds.width, bounds.height)
        guard longestSide.isFinite && longestSide > 0 else { return nil }
        let scale = CGFloat(maxDimension) / longestSide
        let size = NSSize(width: max(1, bounds.width * scale), height: max(1, bounds.height * scale))
        return withExtendedLifetime(document) {
            page.thumbnail(of: size, for: .cropBox).cgImage(forProposedRect: nil, context: nil, hints: nil)
        }
    }
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: maxDimension,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
    // Transparent screenshots and scans often store black text over clear
    // pixels. Give Vision a white page so those glyphs stay visible.
    switch image.alphaInfo {
    case .none, .noneSkipFirst, .noneSkipLast: return image
    default:
        let width = image.width
        let height = image.height
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
            bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return image }
        let bounds = CGRect(x: 0, y: 0, width: width, height: height)
        context.setFillColor(gray: 1, alpha: 1)
        context.fill(bounds)
        context.draw(image, in: bounds)
        return context.makeImage() ?? image
    }
}

private func recognizedLines(_ image: CGImage) throws -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    try VNImageRequestHandler(cgImage: image).perform([request])
    let lines = (request.results ?? []).sorted {
        let firstRow = Int($0.boundingBox.midY * 100)
        let secondRow = Int($1.boundingBox.midY * 100)
        if firstRow == secondRow {
            return $0.boundingBox.minX < $1.boundingBox.minX
        }
        return firstRow > secondRow
    }
    return Array(lines.compactMap { observation -> String? in
        guard let candidate = observation.topCandidates(1).first, candidate.confidence >= 0.45 else { return nil }
        return String(candidate.string.prefix(160))
    }.prefix(30))
}

for filename in CommandLine.arguments.dropFirst().prefix(50) {
    autoreleasepool {
        let image = imageForRecognition(URL(fileURLWithPath: filename))
        let lines = (try? image.map(recognizedLines)) ?? []
        let data = (try? JSONEncoder().encode(lines)) ?? Data("[]".utf8)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0a]))
    }
}
