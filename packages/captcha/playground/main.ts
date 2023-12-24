// import '../dist/index.global'

let bgImage = new Image()
let blockImage = new Image()
let keyId
getCaptcha().then(res => {
  const { background, block, key } = res.data
  keyId = key
  bgImage.src = background
  blockImage.src = block

  const wrapper = document.createElement('div')
  wrapper.appendChild(bgImage)
  wrapper.appendChild(blockImage)
  wrapper.style.position = 'relative'
  blockImage.style.position = 'absolute'
  blockImage.style.top = '0'
  blockImage.style.left = '0'

  document.body.appendChild(wrapper)

  renderBar(310)
})

async function getCaptcha() {
  const res = await window.fetch('/api/captcha')
  return await res.json()
}

let slider: HTMLElement
let mask: HTMLElement
function renderBar(width: number) {
  const bar = document.createElement('div')
  bar.style.width = `${width}px`
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
  const len = bgImage.width - blockImage.width
  const wrapLen = bgImage.width - parseFloat(slider.style.width)
  const x = Math.min(Math.max(evt.clientX - start.x, 0), wrapLen)
  const per = x / wrapLen
  blockImage.style.transform = `translateX(${len * per}px)`
  slider.style.transform = `translateX(${x}px)`
  mask.style.transform = `translateX(${x}px)`
}
function onDragEnd(evt: MouseEvent) {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)

  blockImage.style.transform.replace(/(\d*.?\d*)px/, (all, $1) => {
    const offset = $1

    window.fetch('/api/captcha', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: keyId, offset })
    }).then(async res => {
      const json = await res.json() 
      console.log(json)
    })
    return all
  })
}
