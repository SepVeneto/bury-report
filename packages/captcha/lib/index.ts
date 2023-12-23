const canvas = document.createElement('canvas')
const block = document.createElement('canvas')
const R = 9
const L = 42

canvas.width = 310
canvas.height = 155 
block.width = canvas.width
block.height = canvas.height

const ctx = canvas.getContext('2d')
const blockCtx = block.getContext('2d')

if (!ctx) throw new Error('Can not create ctx')
if (!blockCtx) throw new Error('Can not create block')

const image = new Image(canvas.width, canvas.height)
image.src = './976-310x155.jpg'
image.onload = () => {
  const x = 150
  const y = 50

  drawSlot(ctx, x, y)
  ctx.fill()
  drawSlot(blockCtx, x, y)
  blockCtx.clip()

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  blockCtx.drawImage(image, 0, 0, canvas.width, canvas.height)

  const imageData = blockCtx.getImageData(x, 0, L + L / 2, block.height)
  block.width = L + L / 2
  blockCtx.putImageData(imageData, 0, 0)
}

const wrapper = document.createElement('div')
wrapper.style.position = 'relative'
block.style.position = 'absolute'
block.style.top = '0'
block.style.left = '0'
wrapper.appendChild(canvas)
wrapper.appendChild(block)

document.body.appendChild(wrapper)

renderBar()

function drawSlot(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath()

  ctx.moveTo(x, y)
  ctx.arc(x + L / 2, y - R + 2, R, 0.72 * Math.PI, 2.26 * Math.PI)
  ctx.lineTo(x + L, y)
  ctx.arc(x + L + R - 2, y + L / 2, R, 1.21 * Math.PI, 2.78 * Math.PI)
  ctx.lineTo(x + L, y + L)
  ctx.lineTo(x, y + L)
  ctx.arc(x + R - 2, y + L / 2, R + 0.4, 2.76 * Math.PI, 1.24 * Math.PI, true)
  ctx.lineTo(x, y)
  ctx.lineWidth = 2
  const color = 'rgba(255,255,255,0.7)'
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.globalCompositeOperation = 'destination-over'
}

let slider: HTMLElement
let mask: HTMLElement
function renderBar() {
  const bar = document.createElement('div')
  bar.style.width = `${canvas.width}px`
  bar.style.height = '40px'
  bar.style.textAlign = 'center'
  bar.style.lineHeight = bar.style.height
  bar.style.backgroundColor = '#f7f9fa'
  bar.style.border = '1px solid #e4e7eb'
  bar.style.position = 'relative'
  bar.style.userSelect = 'none'
  bar.style.overflow = 'hidden'
  const text = document.createElement('span')
  text.innerText = '向右滑动填充拼图'
  mask = document.createElement('div')
  mask.style.height = '100%'
  mask.style.width = '100%'
  mask.style.position = 'absolute'
  mask.style.top = '0'
  mask.style.left = '-100%'
  mask.style.backgroundColor = '#67C23A'

  slider = document.createElement('div')
  slider.style.width = '40px'
  slider.style.height = bar.style.height
  slider.style.boxShadow = '0 0 3px rgba(0, 0, 0, 0.3)'
  slider.style.backgroundColor = '#fff'
  slider.style.position = 'absolute'
  slider.style.top = '0'
  slider.style.left = '0'

  bar.appendChild(text)
  bar.appendChild(slider)
  bar.appendChild(mask)

  document.body.appendChild(bar)

  bar.addEventListener('mousedown', onDragStart)
}

let start = { x: 0, y: 0 }
function onDragStart(evt: MouseEvent) {
  start = { x: evt.clientX, y: evt.clientY }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(evt: MouseEvent) {
  const len = canvas.width - block.width
  const wrapLen = canvas.width - parseFloat(slider.style.width)
  const x = Math.min(Math.max(evt.clientX - start.x, 0), wrapLen)
  const per = x / wrapLen
  block.style.transform = `translateX(${len * per}px)`
  slider.style.transform = `translateX(${x}px)`
  mask.style.transform = `translateX(${x}px)`
}
function onDragEnd(evt: MouseEvent) {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}