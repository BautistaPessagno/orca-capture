import { spawn } from 'node:child_process'

export default function activate(orca) {
  let picker
  orca.commands.register('capture-window', () => {
    if (process.platform !== 'darwin') {
      return 'Use your system screenshot tool, then open the image in Capture Studio.'
    }
    if (picker) return 'The macOS window picker is already open.'

    const child = spawn('/usr/sbin/screencapture', ['-i', '-w', '-o', '-x', '-c'], {
      stdio: 'ignore'
    })
    picker = child
    child.once('error', (error) => orca.log(`Could not start the macOS window picker: ${error.message}`))
    child.once('close', () => {
      picker = undefined
    })
    return 'Click the Orca window, then paste the capture into Capture Studio.'
  })
}
