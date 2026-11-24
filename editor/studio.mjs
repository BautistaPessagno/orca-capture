import { drawScreenshot, pixelAt, rectangle } from './redaction.mjs'
import { renderCode, renderConversation } from './text-image.mjs'

const byId = (id) => document.getElementById(id)
const modeButtons = [...document.querySelectorAll('[data-mode]')]
const sections = [...document.querySelectorAll('[data-section]')]
const canvas = byId('image')
const stage = byId('stage')
const messages = byId('messages')
const exportButton = byId('export')
const chooser = byId('image-file')
const maxImageBytes = 32 * 1024 * 1024
const maxPixels = 32_000_000
const maxMessages = 12
let mode = 'code'
let screenshot
let latestImageRequest = 0
let masks = []
let drag
let exporting = false
let canExport = false

function status(message = '') {
  byId('status').textContent = message
}

function showPreview(available) {
  canExport = available
  canvas.hidden = !available
  byId('empty').hidden = available
  byId('dimensions').textContent = available ? `${canvas.width} × ${canvas.height} px` : ''
  exportButton.disabled = exporting || !available
}

function render() {
  canvas.classList.toggle('maskable', mode === 'window' && Boolean(screenshot))
  try {
    if (mode === 'window') {
      byId('empty').textContent = 'Paste, drop, or open a screenshot.'
      if (!screenshot) return showPreview(false)
      drawScreenshot(canvas, screenshot, masks)
    } else if (mode === 'code') {
      byId('empty').textContent = 'Paste code to start.'
      const code = byId('code').value
      if (!code.trim()) return showPreview(false)
      renderCode(canvas, {
        code,
        filename: byId('filename').value,
        language: byId('language').value,
        theme: byId('theme').value,
        numbered: byId('line-numbers').checked,
        firstLine: Math.min(999999, Math.max(1, parseInt(byId('first-line').value, 10) || 1))
      })
    } else {
      byId('empty').textContent = 'Paste a prompt or agent reply to start.'
      const entries = [...messages.children].map((field) => ({
        speaker: field.querySelector('.speaker').value,
        text: field.querySelector('textarea').value.trim()
      })).filter((entry) => entry.text)
      if (!entries.length) return showPreview(false)
      renderConversation(canvas, { title: byId('chat-title').value, theme: byId('theme').value, messages: entries })
    }
    showPreview(true)
  } catch (error) {
    byId('empty').textContent = error.message
    showPreview(false)
  }
}

function setMode(next) {
  mode = next
  drag = undefined
  for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
  for (const section of sections) section.hidden = section.dataset.section !== mode
  byId('theme-field').hidden = mode === 'window'
  status()
  render()
}

function renumberMessages() {
  for (const [index, field] of [...messages.children].entries()) {
    field.querySelector('legend').textContent = `Message ${index + 1}`
    field.querySelector('.remove').disabled = messages.children.length === 1
  }
  byId('add-message').disabled = messages.children.length >= maxMessages
}

function addMessage(speaker, focus = false) {
  if (messages.children.length >= maxMessages) return
  const field = byId('message-template').content.firstElementChild.cloneNode(true)
  field.querySelector('.speaker').value = speaker
  field.querySelector('.remove').addEventListener('click', () => {
    const neighbor = field.nextElementSibling ?? field.previousElementSibling
    field.remove()
    renumberMessages()
    neighbor?.querySelector('textarea').focus()
    render()
  })
  messages.append(field)
  renumberMessages()
  if (focus) field.querySelector('textarea').focus()
}

function refreshMaskControls() {
  byId('undo').disabled = masks.length === 0
  byId('clear').disabled = masks.length === 0
}

async function loadScreenshot(file) {
  if (!file) return
  const request = ++latestImageRequest
  status('Opening screenshot…')
  let image
  try {
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error('Choose a PNG, JPEG, or WebP file.')
    if (file.size > maxImageBytes) throw new Error('Choose a screenshot smaller than 32 MB.')
    image = await createImageBitmap(file)
    if (request !== latestImageRequest) return
    if (image.width > 8192 || image.height > 8192 || image.width * image.height > maxPixels) {
      throw new Error('Choose a screenshot under 32 megapixels and 8192 pixels per side.')
    }
    screenshot?.close()
    screenshot = image
    image = undefined
    masks = []
    drag = undefined
    refreshMaskControls()
    setMode('window')
    status('Drag on the screenshot to cover or blur a region.')
  } catch (error) {
    if (request === latestImageRequest) status(error instanceof DOMException
      ? 'Could not open this image. Try another PNG, JPEG, or WebP.' : error.message)
  } finally {
    image?.close()
  }
}

async function exportPng() {
  if (!canExport || exporting || drag) return
  const names = {
    code: 'code-snippet',
    chat: 'agent-conversation',
    window: masks.length ? 'redacted-window' : 'window-capture'
  }
  const suggestedName = `${names[mode]}.png`
  exporting = true
  exportButton.disabled = true
  status()
  try {
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('Could not encode this image. Try a smaller capture.')
    const result = await window.orca.files.saveAs({
      suggestedName,
      mimeType: 'image/png',
      data: await png.arrayBuffer()
    })
    status(result.status === 'saved' ? 'PNG exported.' : 'Export cancelled.')
  } catch (error) {
    status(error.message || 'Could not save the PNG.')
  } finally {
    exporting = false
    exportButton.disabled = !canExport
  }
}

function point(event) {
  return pixelAt(canvas.getBoundingClientRect(), canvas.width, canvas.height, event.clientX, event.clientY)
}

for (const button of modeButtons) button.addEventListener('click', () => setMode(button.dataset.mode))
document.querySelector('.controls').addEventListener('input', (event) => {
  if (event.target === chooser) return
  status()
  render()
})
byId('add-message').addEventListener('click', () => {
  const lastSpeaker = messages.lastElementChild.querySelector('.speaker').value
  addMessage(lastSpeaker === 'You' ? 'Agent' : 'You', true)
})
byId('choose-image').addEventListener('click', () => chooser.click())
chooser.addEventListener('change', () => {
  void loadScreenshot(chooser.files[0])
  chooser.value = ''
})
byId('paste-target').addEventListener('click', () => {
  stage.focus()
  status('Paste the screenshot from your clipboard.')
})
document.addEventListener('paste', (event) => {
  if (mode !== 'window') return
  const image = [...(event.clipboardData?.files ?? [])].find((file) => file.type.startsWith('image/'))
  if (!image) return
  event.preventDefault()
  void loadScreenshot(image)
})
stage.addEventListener('dragover', (event) => {
  if (mode === 'window') event.preventDefault()
})
stage.addEventListener('drop', (event) => {
  if (mode !== 'window') return
  event.preventDefault()
  void loadScreenshot(event.dataTransfer.files[0])
})
canvas.addEventListener('pointerdown', (event) => {
  if (mode !== 'window' || !screenshot || event.button !== 0 || drag) return
  drag = { id: event.pointerId, start: point(event), kind: byId('redaction').value }
  canvas.setPointerCapture(event.pointerId)
})
canvas.addEventListener('pointermove', (event) => {
  if (drag?.id !== event.pointerId) return
  drawScreenshot(canvas, screenshot, masks, rectangle(drag.start, point(event), drag.kind))
})
canvas.addEventListener('pointerup', (event) => {
  if (drag?.id !== event.pointerId) return
  const mask = rectangle(drag.start, point(event), drag.kind)
  if (mask.width >= 2 && mask.height >= 2) masks.push(mask)
  drag = undefined
  refreshMaskControls()
  status(masks.length ? `${masks.length} ${masks.length === 1 ? 'redaction' : 'redactions'} applied.` : '')
  render()
})
canvas.addEventListener('lostpointercapture', (event) => {
  if (drag?.id !== event.pointerId) return
  drag = undefined
  render()
})
byId('undo').addEventListener('click', () => {
  masks.pop()
  refreshMaskControls()
  status('Last redaction removed.')
  render()
})
byId('clear').addEventListener('click', () => {
  masks = []
  refreshMaskControls()
  status('Redactions cleared.')
  render()
})
exportButton.addEventListener('click', () => void exportPng())

addMessage('You')
addMessage('Agent')
setMode(mode)
