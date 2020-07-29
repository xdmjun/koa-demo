const Koa = require('koa')
const app = new Koa()
const Router = require('koa-router')
const router = new Router()
const bodyParser = require('koa-bodyparser')
const rp = require('request-promise')

app.use(bodyParser())

app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    ctx.body = {
      code: -1,
      data: ctx.data,
      message: ctx.msg || err.message || '服务开小差了，请稍后再试',
      etime: Date.now(),
    }
  }
})

app.use(async (ctx, next) => {
  await next()
  ctx.set('Content-Type', 'application/json')
  if (!ctx.body) {
    ctx.body = {
      code: ctx.code || 0,
      data: ctx.data,
      message: ctx.msg || 'success',
      etime: Date.now(),
    }
  }
})

router.get('/', async (ctx, next) => {
  ctx.data = 'demo api'
  await next()
})

router.get('/token', async (ctx, next) => {
  try {
    let appid = 'wx36963a5a84d5ca4d'
    let secret = '98431bcb5cac6b46ef132b6f544a11dd'
    let opts = {
      uri:
        'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
        appid +
        '&secret=' +
        secret,
    }
    let res = await rp(opts)
    res = JSON.parse(res)
    let token = res.access_token
    ctx.data = { token: token }
  } catch (e) {
    console.log(e)
  }
  await next()
})

router.get('/qrcode', async (ctx, next) => {
  let token = ctx.request.query.token
  let opts = {
    method: 'post',
    form:
      '{"expire_seconds": 604800, "action_name": "QR_STR_SCENE", "action_info": {"scene": {"scene_str": 111 }}}',
    uri:
      'https://api.weixin.qq.com/cgi-bin/qrcode/create?access_token=' + token,
  }
  let res = await rp(opts)
  ctx.data = res
  await next()
})

app.use(router.routes())
app.use(router.allowedMethods())

let server = app.listen(4000, function () {
  let host = server.address().address
  let port = server.address().port
  console.log('应用实例，访问地址为 http://localhost:%s', port)
})
