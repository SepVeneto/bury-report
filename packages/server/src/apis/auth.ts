import { Router } from '@oak/oak'
import md5 from 'md5'
import jwt from 'jsonwebtoken'
import { SECRET } from '../utils/index.ts'
import * as canvas from '@josefabio/deno-canvas'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import dayjs from 'dayjs'

const router = new Router()

const isDebug = !!Deno.env.get('DEBUG')
console.log('DEBUG', isDebug)

dayjs.extend(utc)
dayjs.extend(timezone)

router.post('/login', async (ctx) => {
  const { name, password, key, offset } = await ctx.request.body.json()

  if (!isDebug) {
    const captcha = ctx.db.collection('captcha')
    const res = await captcha.findOne({ key })
    if (!res) {
      ctx.resCode = 1
      ctx.resBody = '验证码已过期'
      return
    }
    await captcha.deleteOne({ key })
    const target = res.offset
    const isVerify = verifyCaptcha(target, offset)

    if (!isVerify) {
      ctx.resCode = 1
      ctx.resMsg = '验证码错误'
      return
    }
  }

  const users = ctx.db.collection('users')

  const isAccess = await users.findOne({ name, password: md5(password)} )
  if (isAccess) {
    const payload = {
      account: name,
      time: Date.now(),
    }
    ctx.resBody = { token: jwt.sign(payload, SECRET) }
  } else {
    ctx.resCode = 1
    ctx.resMsg = '用户名或密码错误'
  }

})
router.post('/register', async (ctx) => {
  const { name, password } = await ctx.request.body.json()

  const users = ctx.db.collection('users')
  const res = await users.findOne({ name })
  if (res) {
    ctx.resCode = 1
    ctx.resMsg = 'The name has been registered'
    return
  }
  const md5pwd = md5(password)
  users.insertOne({ name, password: md5pwd })

  ctx.resMsg = '注册成功'
})

const L = 42
const R = 9
function getRandomPos(w: number) {
  const x = Math.random() * (w - L * 2) + L
  return [Number(x.toFixed(0)), 50]
}
router.get('/captcha', async (ctx, next) => {
  const width = 310
  const height = 155
  const background = canvas.createCanvas(width, height)
  let block = canvas.createCanvas(width, height)
  const backgroundCtx = background.getContext('2d')
  let blockCtx = block.getContext('2d')

  const image = await canvas.loadImage('./976-310x155.jpg')
  const [x, y] = getRandomPos(width)

  drawSlot(backgroundCtx, x, y)
  backgroundCtx.fill()
  drawSlot(blockCtx, x, y)
  blockCtx.clip()

  backgroundCtx.drawImage(image, 0, 0, width, height)
  blockCtx.drawImage(image, 0, 0, width, height)

  const imageData = blockCtx.getImageData(x, 0, L + L / 2, height)
  // block.width = L + L / 2
  block = canvas.createCanvas(L + L / 2, block.height)
  blockCtx = block.getContext('2d')
  blockCtx.putImageData(imageData, 0, 0)

  const captchaMd5 = md5(`${Date.now()}-captcha`)
  ctx.resBody = {
    background: background.toDataURL(),
    block: block.toDataURL(),
    key: captchaMd5,
  }
  const captcha = ctx.db.collection('captcha')
  await captcha.insertOne({ key: captchaMd5, offset: x, create_time: new Date() })
  await next()
})
function verifyCaptcha(target: number, answer: number) {
  const offset = Math.abs(target - answer)
  return offset < 5
}

function drawSlot(ctx: canvas.CanvasRenderingContext2D, x: number, y: number) {
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

export default router
