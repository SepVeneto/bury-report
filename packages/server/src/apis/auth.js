const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const md5 = require('md5')
const jwt = require('jsonwebtoken')
const { SECRET } = require('../utils')
const canvas = require('canvas')
const timezone = require('dayjs/plugin/timezone')
const utc = require('dayjs/plugin/utc')
const dayjs = require('dayjs')

dayjs.extend(utc)
dayjs.extend(timezone)

router.post('/login', async (ctx, next) => {
  const { name, password, key, offset } = ctx.request.body

  const captcha = db.collection('captcha')
  const res = await captcha.findOne({ key })
  await captcha.deleteOne({ key })
  const target = res.offset
  const isVerify = verifyCaptcha(target, offset)

  if (!isVerify) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '验证码错误'
    return
  }

  const users = db.collection('users')

  const isAccess = await users.findOne({ name, password: md5(password)} )
  if (isAccess) {
    const payload = {
      account: name,
      time: Date.now(),
    }
    ctx.body = { token: jwt.sign(payload, SECRET) }
    await next()
  } else {
    await next()
    ctx.body.code = 1
    ctx.body.message = '用户名或密码错误'
  }

})
router.post('/register', async (ctx, next) => {
  const { name, password } = ctx.request.body

  const users = db.collection('users')
  const res = await users.findOne({ name })
  if (res) {
    await next()
    ctx.body.code = 1
    ctx.body.message = 'The name has been registered'
    return
  }
  const md5pwd = md5(password)
  users.insertOne({ name, password: md5pwd })

  await next()
  ctx.body.message = '注册成功'
})

const L = 42
const R = 9
router.get('/captcha', async (ctx, next) => {
  const width = 310
  const height = 155
  const background = canvas.createCanvas(width, height)
  const block = canvas.createCanvas(width, height)
  const backgroundCtx = background.getContext('2d')
  const blockCtx = block.getContext('2d')

  const image = await canvas.loadImage('./976-310x155.jpg')
  const x = 150
  const y = 50

  drawSlot(backgroundCtx, x, y)
  backgroundCtx.fill()
  drawSlot(blockCtx, x, y)
  blockCtx.clip()

  backgroundCtx.drawImage(image, 0, 0, width, height)
  blockCtx.drawImage(image, 0, 0, width, height)

  const imageData = blockCtx.getImageData(x, 0, L + L / 2, height)
  block.width = L + L / 2
  blockCtx.putImageData(imageData, 0, 0)

  const captchaMd5 = md5(`${Date.now()}-captcha`)
  ctx.body = {
    background: background.toDataURL('image/jpeg', 1),
    block: block.toDataURL(),
    key: captchaMd5,
  }
  const captcha = db.collection('captcha')
  await captcha.insertOne({ key: captchaMd5, offset: 150, createTime: new Date() })
  await next()
})
function verifyCaptcha(target, answer) {
  const offset = Math.abs(target - answer)
  return offset < 5
}

function drawSlot(ctx, x, y) {
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

module.exports = router
