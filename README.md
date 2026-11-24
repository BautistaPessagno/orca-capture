# Capture Studio for Orca

Turn a code excerpt or an agent exchange into a styled PNG. Capture the Orca window when the layout matters, then blur or cover the panes you want to hide.

Capture Studio opens as an editor tab. It requires Orca Desktop 1.4.248 or later.

## Install

Open **Settings → Plugins** and search for **Capture Studio**, or install this release from GitHub.

```sh
orca plugin install BautistaPessagno/orca-capture@v0.1.0
```

Review the permission prompt Orca displays. The plugin is a trusted worker so that its command can start the macOS window picker. It requests no Orca API capabilities. macOS may also ask you to allow screen recording for the window picker. You can skip that permission and import a screenshot manually.

## Create a capture

Open **New Capture Studio** from Orca's command palette or the tab bar's **+** menu.

- **Code.** Copy the lines you want to share and paste them into **Code**. Set the filename or language for syntax highlighting, and choose whether to include line numbers and where they start. JavaScript, TypeScript, JSON, Python, shell, and plain text are supported.
- **Conversation.** Paste each prompt or reply into its own message and choose **You** or **Agent**. Add or remove messages and set an optional conversation title.
- **Window.** On macOS, run **Capture Studio: Capture Window to Clipboard** from the command palette while the Orca layout you want is visible. Click the Orca window, switch to **Window** in Capture Studio, then paste. You can also open or drop a PNG, JPEG, or WebP from any platform. Choose **Solid cover** or **Blur** and drag over any area you want to hide. Use **Solid cover** for secrets.

Choose **Export PNG** to save the image. Window exports contain only the rendered pixels. The preview keeps the imported image in memory until the tab closes so redactions can be undone. The capture command leaves the original screenshot in the system clipboard. It does not save a source file or upload content.

## Development

```sh
node --test
orca plugin validate . --json
orca plugin check . --json
orca plugin dev load . --json
```

The repository's release tags match the version in `orca-plugin.json`. The `orca-plugin` topic opts the repository into the [Orca community catalog](https://orca.dev/plugins/add).
