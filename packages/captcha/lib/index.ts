import { Bar } from './Bar'

type FunCallback<T> = (result: T) => void
type Options = {
  width: number
  height: number
  background: string,
  block: string,
  onFinish: FunCallback<number>,
}
export class Jigsaw {
  private wrapper: HTMLElement
  private backgroundImgUrl: string
  private blockImgUrl: string
  private onFinish: Options['onFinish']
  private width: number
  private height: number
  private bar: Bar
  private startPos: { x: number, y: number }
  private blockImg: HTMLImageElement
  constructor(options: Options) {
    const { background, block, onFinish, width = 310, height = 155 } = options
    this.width = width
    this.height = height
    this.backgroundImgUrl = background
    this.blockImgUrl = block
    this.onFinish = onFinish
    this.bar = new Bar(this.width, 40)
    this.bar.elmBar.addEventListener('mousedown', this.onDragStart)
    
  }
  async createWrapper() {
    const wrapper = document.createElement('div')
    wrapper.style.position = 'relative'
    const backgroundImg = await this.loadImage(this.backgroundImgUrl)
    const blockImg = await this.loadImage(this.blockImgUrl)
    blockImg.style.position = 'absolute'
    blockImg.style.top = '0'
    blockImg.style.left = '0'

    this.blockImg = blockImg

    wrapper.appendChild(backgroundImg)
    wrapper.appendChild(blockImg)

    this.wrapper = wrapper
  }
  async render(elm: string | HTMLElement) {
    let node: HTMLElement
    if (typeof elm === 'string') {
      node = document.querySelector(elm)
    } else {
      node = elm
    }
    if (!node) {
      throw new Error(`[captcha] cannot find element ${elm}`)
    }
    await this.createWrapper()
    node.appendChild(this.wrapper)
    this.bar.render(node)
  }
  private loadImage(url: string): Promise<HTMLImageElement> {
    const image = new Image()
    image.src = url
    return new Promise((resolve, reject) => {
      image.onload = () => { resolve(image) }
      image.onerror = reject
    })
  }

  onDragStart(evt: MouseEvent) {
    this.startPos = { x: evt.clientX, y: evt.clientY }
    console.log('add')
    document.addEventListener('mousemove', this.onDragMove)
    document.addEventListener('mouseup', this.onDragEnd)
  }
  onDragMove(evt: MouseEvent) {
    console.log('mvoe')
    const len = this.width - this.width
    const wrapLen = this.width - parseFloat(this.bar.elmSlider.style.width)
    const x = Math.min(Math.max(evt.clientX - this.startPos.x, 0), wrapLen)
    const per = x / wrapLen
    this.blockImg.style.transform = `translateX(${len * per}px)`
    this.bar.elmSlider.style.transform = `translateX(${x}px)`
    this.bar.elmMask.style.transform = `translateX(${x}px)`
  }
  onDragEnd() {
    console.log('remove')
    document.removeEventListener('mousemove', this.onDragMove)
    document.removeEventListener('mouseup', this.onDragEnd)

    this.blockImg.style.transform.replace(/(\d*.?\d*)px/, (all, $1) => {
      const offset = $1
      this.onFinish(offset)
      return all
    })
  }

}