export class Bar {
  private width: number
  private height: number
  private successColor = '#f7f9fa'
  private bar: HTMLElement
  private text: HTMLElement
  private mask: HTMLElement
  private slider: HTMLElement
  constructor(width: number, height: number) {
    this.width = width
    this.height = height

    this.createBar()
    this.createMask()
    this.createSlider()
    this.createText()
  }
  get elmBar() {
    return this.bar
  }
  get elmSlider() {
    return this.slider
  }
  get elmMask() {
    return this.mask
  }
  createBar() {
    const bar = document.createElement('div')

    bar.style.width = `${this.width}px`
    bar.style.height = `${this.height}px`
    bar.style.textAlign = 'center'
    bar.style.lineHeight = bar.style.height
    bar.style.backgroundColor = this.successColor
    bar.style.border = '1px solid #e4e7eb'
    bar.style.position = 'relative'
    bar.style.userSelect = 'none'
    bar.style.overflow = 'hidden'

    this.bar = bar
  }
  createText() {
    const text = document.createElement('span')

    text.innerText = '向右滑动填充拼图'

    this.text = text
  }
  createMask() {
    const mask = document.createElement('div')

    mask.style.height = '100%'
    mask.style.width = '100%'
    mask.style.position = 'absolute'
    mask.style.top = '0'
    mask.style.left = '-100%'
    mask.style.backgroundColor = '#67C23A'

    this.mask = mask
  }
  createSlider() {
    const slider = document.createElement('div')
    slider.style.width = '40px'
    slider.style.height = this.bar.style.height
    slider.style.boxShadow = '0 0 3px rgba(0, 0, 0, 0.3)'
    slider.style.backgroundColor = '#fff'
    slider.style.position = 'absolute'
    slider.style.top = '0'
    slider.style.left = '0'

    this.slider = slider
  }
  render(elm: HTMLElement) {
    this.bar.appendChild(this.text)
    this.bar.appendChild(this.slider)
    this.bar.appendChild(this.mask)

    elm.appendChild(this.bar)
  }
}