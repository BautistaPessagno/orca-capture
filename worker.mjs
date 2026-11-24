import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export default function activate(orca) {
  let active
  const helper = fileURLToPath(new URL('./native/Capture.swift', import.meta.url))

  function capture(mode) {
    if (process.platform !== 'darwin') return 'Capture in place requires macOS.'
    if (active) return 'Capture is open. Press Escape to cancel it.'
    active = spawn('/usr/bin/swift', [helper, mode], { stdio: ['ignore', 'ignore', 'pipe'] })
    let diagnostic = ''
    active.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-2000) })
    active.once('error', error => orca.log(error.message))
    active.once('close', code => {
      active = undefined
      if (code) orca.log('Capture helper failed. Check the Xcode Command Line Tools installation. ' + diagnostic)
    })
    return 'Opening capture over the Orca window…'
  }

  orca.commands.register('capture-excerpt', () => capture('excerpt'))
  orca.commands.register('capture-window', () => capture('window'))
}
