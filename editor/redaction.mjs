export function pixelAt(bounds, width, height, x, y) {
  return {
    x: Math.max(0, Math.min(width, Math.round(((x - bounds.left) / bounds.width) * width))),
    y: Math.max(0, Math.min(height, Math.round(((y - bounds.top) / bounds.height) * height)))
  }
}

export function rectangle(start, end, kind) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
    kind
  }
}

export function drawScreenshot(canvas, source, masks, draft) {
  if (canvas.width !== source.width || canvas.height !== source.height) {
    canvas.width = source.width
    canvas.height = source.height
  }
  const context = canvas.getContext('2d')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0)
  for (const mask of masks) {
    if (mask.kind !== 'blur') continue
    const { x, y, width, height } = mask
    context.save()
    context.beginPath()
    context.rect(x, y, width, height)
    context.clip()
    context.filter = 'blur(24px)'
    const left = Math.max(0, x - 80)
    const top = Math.max(0, y - 80)
    const right = Math.min(source.width, x + width + 80)
    const bottom = Math.min(source.height, y + height + 80)
    const sampleWidth = right - left
    const sampleHeight = bottom - top
    // Clear the covered pixels so blur at a transparent edge cannot reveal the original underneath.
    context.clearRect(x, y, width, height)
    context.drawImage(source, left, top, sampleWidth, sampleHeight, left, top, sampleWidth, sampleHeight)
    context.restore()
  }
  for (const { x, y, width, height, kind } of masks) {
    if (kind !== 'solid') continue
    context.fillStyle = '#101726'
    context.fillRect(x, y, width, height)
  }
  if (draft) {
    context.fillStyle = '#7599ff55'
    context.fillRect(draft.x, draft.y, draft.width, draft.height)
    context.strokeStyle = '#b8c9ff'
    context.lineWidth = Math.max(2, source.width / 800)
    context.strokeRect(draft.x, draft.y, draft.width, draft.height)
  }
}
