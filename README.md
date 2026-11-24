# Capture Studio for Orca

Take a framed screenshot of code or a conversation where it appears, or copy a screenshot of the Orca window with chat and editor panes blurred.

## Try it

Requires macOS 14.2 or later, Orca Desktop 1.4.248 or later, and Apple's Swift toolchain (available through Xcode Command Line Tools). Install with:

```sh
orca plugin install BautistaPessagno/orca-capture@v0.2.0
```

Approve the trusted worker. It launches the bundled Swift source with the system toolchain. macOS Screen Recording permission lets the helper capture the Orca window. Accessibility permission enables hover targeting and automatic pane detection. After granting permission, reopen capture.

- **Screenshot Excerpt** (⌘⌥⇧C). With code or a chat visible, invoke the shortcut, hover the text, and click to select it. Drag a rectangle to include multiple lines or messages. Press Return or click **Copy screenshot** for a framed PNG with the original on-screen colors and typography. Press S to save instead.
- **Screenshot Orca Window** (⌘⌥⇧B). Review the window with recognized Monaco editors and native chat panes blurred. Other views stay visible. The toolbar shows how many regions were found. If a pane is missing, drag over it before copying or saving. Z removes the last region.
- Press Escape to dismiss either capture. Both commands are also available through Orca's ⌘J palette.

The capture overlay opens over a frozen image of the frontmost visible Orca window. Hover and automatic masking depend on the accessibility information Orca supplies. Embedded terminal agents and panes without recognizable accessibility classes can require a manual rectangle. Review the visible result before sharing. The helper holds the original in memory and writes only the image you copy or save.

## Development

```sh
swift native/Capture.swift --self-test
orca plugin validate . --json
orca plugin check . --json
```
