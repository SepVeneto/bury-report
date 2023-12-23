import { onMounted } from 'vue'
import type { Ref } from 'vue'
import { Stage } from 'logo-particle'
export function useLogoParticle(canvasRef: Ref<HTMLCanvasElement | undefined>) {
  onMounted(async () => {
    if (!canvasRef.value) {
      console.warn('[logo-particle]挂载失败，找不到指定dom')
      return
    }
    const stage = new Stage(canvasRef.value)
    const particle = await stage.loadImage('/favicon.png', {
      width: 380,
      x: document.body.offsetWidth / 2,
      y: 200,
      imgGap: 10,
      particleSize: 5,
      color: 0xffffff,
      type: 'contain',
      origin: 'center',
      // type: 'contain'
    })
    stage.start()
    stage.setInterval(() => {
      stage.setTimer(() => {
        stage.switchShape(particle)
      }, 1)
      stage.setTimer(() => {
        stage.switchShape([])
      }, 5)
    }, 8)
  })
}
