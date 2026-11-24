// Run on demand via the macOS Swift toolchain.
import AppKit
import ApplicationServices
import CoreImage
import ScreenCaptureKit

func attribute(_ element: AXUIElement, _ key: String) -> CFTypeRef? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, key as CFString, &result) == .success else { return nil }
    return result
}

func axFrame(_ element: AXUIElement) -> CGRect? {
    guard let p = attribute(element, "AXPosition"), let s = attribute(element, "AXSize"),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero, size = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &point),
          AXValueGetValue(s as! AXValue, .cgSize, &size) else { return nil }
    return CGRect(origin: point, size: size)
}

struct Targets {
    var panes: [CGRect] = []
    var excerpts: [CGRect] = []
}

func targets(_ pid: pid_t, window: CGRect) -> Targets {
    var result = Targets()
    let app = AXUIElementCreateApplication(pid)
    AXUIElementSetMessagingTimeout(app, 0.25)
    AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    guard let windows = attribute(app, "AXWindows") as? [AXUIElement],
          let root = windows.first(where: { element in
              guard let frame = axFrame(element) else { return false }
              return abs(frame.minX-window.minX) < 4 && abs(frame.minY-window.minY) < 4 &&
                  abs(frame.width-window.width) < 4 && abs(frame.height-window.height) < 4
          }) else { return result }
    var remaining = 3000
    func visit(_ element: AXUIElement, depth: Int) {
        guard depth < 75, remaining > 0 else { return }
        remaining -= 1
        let classes = attribute(element, "AXDOMClassList") as? [String] ?? []
        let role = attribute(element, "AXRole") as? String
        if let frame = axFrame(element) {
            let clipped = frame.intersection(window)
            if !clipped.isNull && clipped.width > 8 && clipped.height > 5 {
                let rect = CGRect(x: clipped.minX-window.minX, y: window.maxY-clipped.maxY,
                                  width: clipped.width, height: clipped.height)
                if classes.contains("monaco-editor") || classes.contains("monaco-diff-editor") || classes.contains("native-chat-pane-shell") {
                    result.panes.append(rect)
                }
                if role == "AXStaticText" || role == "AXTextArea" || classes.contains("monaco-editor") {
                    result.excerpts.append(rect)
                }
            }
        }
        for child in attribute(element, "AXChildren") as? [AXUIElement] ?? [] {
            visit(child, depth: depth+1)
        }
    }
    visit(root, depth: 0)
    return result
}

func blurRegions(_ image: CGImage, masks: [CGRect], points: CGSize) -> CGImage? {
    let base = CIImage(cgImage: image)
    let blur = base.clampedToExtent().applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 30])
    var output = base
    for rect in masks {
        let pixels = rect.applying(CGAffineTransform(scaleX: base.extent.width/points.width,
                                                     y: base.extent.height/points.height)).integral
        output = blur.cropped(to: pixels).composited(over: output)
    }
    return CIContext().createCGImage(output, from: base.extent)
}

func snippet(_ image: CGImage, rect: CGRect, points: CGSize) -> CGImage? {
    let sx = CGFloat(image.width)/points.width, sy = CGFloat(image.height)/points.height
    let pixelRect = CGRect(x: rect.minX*sx, y: (points.height-rect.maxY)*sy,
                           width: rect.width*sx, height: rect.height*sy).integral
    guard let crop = image.cropping(to: pixelRect) else { return nil }
    let padding = Int(24*sx)
    let w = crop.width+2*padding, h = crop.height+2*padding
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    let colors = [CGColor(red: 0.20, green: 0.28, blue: 0.47, alpha: 1),
                  CGColor(red: 0.34, green: 0.23, blue: 0.43, alpha: 1)]
    if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors as CFArray, locations: nil) {
        ctx.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: w, y: h), options: [])
    }
    let content = CGRect(x: padding, y: padding, width: crop.width, height: crop.height)
    ctx.draw(crop, in: content)
    return ctx.makeImage()
}

final class OverlayWindow: NSPanel {
    override var canBecomeKey: Bool { true }
}

final class Overlay: NSView {
    let original: CGImage
    let whole: Bool
    let detected: Targets
    var masks: [CGRect]
    var preview: CGImage
    var selection: CGRect?
    var start: CGPoint?
    var drag: CGRect?
    var pinned = false
    let hint = NSTextField(labelWithString: "")
    let copyButton = NSButton(title: "Copy screenshot", target: nil, action: nil)
    init(image: CGImage, size: CGSize, whole: Bool, detected: Targets) {
        original = image
        self.whole = whole
        self.detected = detected
        masks = detected.panes
        preview = image
        super.init(frame: CGRect(origin: .zero, size: size))
        hint.textColor = .white
        hint.backgroundColor = .black
        hint.drawsBackground = true
        hint.font = .systemFont(ofSize: 13, weight: .medium)
        addSubview(hint)
        copyButton.target = self
        copyButton.action = #selector(copyScreenshot)
        copyButton.sizeToFit()
        addSubview(copyButton)
        refresh()
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.activeAlways,.inVisibleRect,.mouseMoved], owner: self, userInfo: nil))
    }
    required init?(coder: NSCoder) { fatalError() }
    override var acceptsFirstResponder: Bool { true }
    func refresh() {
        if whole {
            guard let rendered = blurRegions(original, masks: masks, points: bounds.size) else { NSApp.terminate(nil); return }
            preview = rendered
        }
        let regionHint = masks.isEmpty ? "No blur applied" : "\(masks.count) blur regions"
        hint.stringValue = whole
            ? "  \(regionHint) · Drag to add · Z undo · Return copy · S save · Esc cancel  "
            : "  Hover and click an excerpt or drag to frame it · Return copy · S save · Esc cancel  "
        hint.sizeToFit()
        hint.setFrameOrigin(NSPoint(x: 10, y: 8))
        copyButton.setFrameOrigin(NSPoint(x: bounds.width-copyButton.frame.width-12, y: 8))
        copyButton.isEnabled = whole || selection != nil
        needsDisplay = true
    }
    override func draw(_ dirtyRect: NSRect) {
        NSGraphicsContext.current?.cgContext.draw(preview, in: bounds)
        if let r = drag ?? selection {
            NSColor.systemBlue.setStroke()
            let outline = NSBezierPath(rect: r)
            outline.lineWidth = 2
            outline.stroke()
        }
    }
    override func mouseMoved(with e: NSEvent) {
        guard !whole && !pinned else { return }
        let p = convert(e.locationInWindow, from: nil)
        selection = detected.excerpts.filter { $0.contains(p) }.min { $0.width*$0.height < $1.width*$1.height }
        needsDisplay = true
    }
    override func mouseDown(with e: NSEvent) {
        pinned = false
        mouseMoved(with: e)
        start = convert(e.locationInWindow, from: nil)
    }
    override func mouseDragged(with e: NSEvent) {
        guard let a = start else { return }
        let b = convert(e.locationInWindow, from: nil)
        drag = CGRect(x: min(a.x,b.x), y: min(a.y,b.y), width: abs(a.x-b.x), height: abs(a.y-b.y)).intersection(bounds)
        needsDisplay = true
    }
    override func mouseUp(with e: NSEvent) {
        if let r = drag, r.width > 3 && r.height > 3 {
            if whole { masks.append(r) } else { selection = r }
        }
        pinned = selection != nil
        start = nil
        drag = nil
        refresh()
    }
    override func keyDown(with e: NSEvent) {
        if e.keyCode == 53 { NSApp.terminate(nil); return }
        let key = e.charactersIgnoringModifiers?.lowercased()
        if whole && key == "z" {
            if !masks.isEmpty { masks.removeLast(); refresh() }
            return
        }
        guard e.keyCode == 36 || key == "s" else { return }
        finish(save: key == "s")
    }
    @objc func copyScreenshot() { finish(save: false) }
    func finish(save: Bool) {
        let output = whole ? preview : selection.flatMap { snippet(original, rect: $0, points: bounds.size) }
        guard let output, let data = NSBitmapImageRep(cgImage: output).representation(using: .png, properties: [:]) else { NSSound.beep(); return }
        if save {
            let dialog = NSSavePanel()
            dialog.nameFieldStringValue = whole ? "orca-window.png" : "orca-excerpt.png"
            dialog.level = .floating
            window?.orderOut(nil)
            guard dialog.runModal() == .OK, let url = dialog.url else { window?.makeKeyAndOrderFront(nil); return }
            do { try data.write(to: url, options: .atomic) }
            catch { NSAlert(error: error).runModal(); window?.makeKeyAndOrderFront(nil); return }
        } else {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setData(data, forType: .png)
        }
        NSApp.terminate(nil)
    }
}

@MainActor func run() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
    let order = CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
    let candidates = content.windows.filter { $0.owningApplication?.bundleIdentifier == "com.stablyai.orca" &&
        $0.windowLayer == 0 && $0.frame.width > 200 && $0.frame.height > 150 }
    guard let target = order.compactMap({ row in candidates.first { $0.windowID == row[kCGWindowNumber as String] as? UInt32 } }).first,
          let owner = target.owningApplication, let main = NSScreen.screens.first else {
        throw NSError(domain: "Capture Studio", code: 1, userInfo: [NSLocalizedDescriptionKey: "Open an Orca window and try again."])
    }
    let filter = SCContentFilter(desktopIndependentWindow: target)
    let config = SCStreamConfiguration()
    config.width = Int(filter.contentRect.width * CGFloat(filter.pointPixelScale))
    config.height = Int(filter.contentRect.height * CGFloat(filter.pointPixelScale))
    config.showsCursor = false
    config.ignoreShadowsSingleWindow = true
    let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)
    let frame = CGRect(x: target.frame.minX, y: main.frame.maxY-target.frame.maxY, width: target.frame.width, height: target.frame.height)
    let trusted = AXIsProcessTrustedWithOptions(["AXTrustedCheckOptionPrompt": true] as CFDictionary)
    let regions = trusted ? targets(owner.processID, window: target.frame) : Targets()
    let overlay = Overlay(image: image, size: frame.size, whole: CommandLine.arguments.last == "window", detected: regions)
    let panel = OverlayWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false)
    panel.isReleasedWhenClosed = false
    panel.level = .floating
    panel.collectionBehavior = [.moveToActiveSpace,.fullScreenAuxiliary]
    panel.contentView = overlay
    panel.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    panel.makeFirstResponder(overlay)
    activePanel = panel
}

if CommandLine.arguments.last == "--self-test" {
    let ctx = CGContext(data: nil, width: 240, height: 160, bitsPerComponent: 8, bytesPerRow: 960,
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.setFillColor(CGColor(gray: 1, alpha: 1)); ctx.fill(CGRect(x: 0,y: 0,width: 240,height: 160))
    ctx.setFillColor(CGColor(gray: 0, alpha: 1)); ctx.fill(CGRect(x: 40,y: 60,width: 20,height: 20))
    let source = ctx.makeImage()!
    let size = CGSize(width: 120,height: 80)
    let mask = CGRect(x: 15,y: 25,width: 25,height: 20)
    let rendered = blurRegions(source, masks: [mask], points: size)!
    func pixel(_ image: CGImage, _ x: Int, _ y: Int) -> UInt8 {
        let sample = image.cropping(to: CGRect(x:x,y:y,width:1,height:1))!
        var value: UInt8 = 0
        withUnsafeMutableBytes(of: &value) { bytes in
            let c = CGContext(data: bytes.baseAddress,width:1,height:1,bitsPerComponent:8,bytesPerRow:1,
                              space:CGColorSpaceCreateDeviceGray(),bitmapInfo:0)!
            c.draw(sample,in:CGRect(x:0,y:0,width:1,height:1))
        }
        return value
    }
    precondition(pixel(source,50,90) == 0 && pixel(rendered,50,90) > 50)
    precondition(pixel(rendered,10,10) == pixel(source,10,10))
    let framed = snippet(source, rect:mask,points:size)!
    precondition(framed.width == 146 && framed.height == 136)
    print("Retina crop, framing, and conditional blur passed.")
    exit(0)
}

var activePanel: NSPanel?
let application = NSApplication.shared
application.setActivationPolicy(.accessory)
Task { @MainActor in
    do { try await run() }
    catch {
        let alert = NSAlert(error: error)
        alert.informativeText += "\nCheck Screen Recording permission in macOS System Settings."
        alert.runModal()
        NSApp.terminate(nil)
    }
}
application.run()
