const Koa = require('koa')
const app = new Koa()
const Router = require('koa-router')
const router = new Router()
const bodyParser = require('koa-bodyparser')
const sha1 = require('sha1')
const getRawBody = require('raw-body')
const xml2js = require('xml2js')

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
  let signature = ctx.query.signature,
    timestamp = ctx.query.timestamp,
    nonce = ctx.query.nonce,
    token = '123456'
  let str = [token, timestamp, nonce].sort().join('')
  let result = sha1(str)
  let rt
  if (result === signature) {
    rt = ctx.query.echostr
  } else {
    rt = {
      code: -1,
      msg: 'fail',
    }
  }
  ctx.body = rt
  await next()
})

router.post('/', async (ctx, next) => {
  var data = await getRawBody(ctx.req, {
    length: ctx.length,
    limit: '1mb',
    encoding: ctx.charset,
  })
  const xml = await parseXMLAsync(data)

  const createTime = Date.parse(new Date())
  const msgType = xml.xml.MsgType[0]
  const toUserName = xml.xml.ToUserName[0]
  const toFromName = xml.xml.FromUserName[0]
  const event = xml.xml.Event ? xml.xml.Event[0] : ''
  if (msgType == 'event' && event == 'subscribe') {
    //关注后
    ctx.body = `<xml>
		 <ToUserName><![CDATA[${toFromName}]]></ToUserName>
		 <FromUserName><![CDATA[${toUserName}]]></FromUserName>
		 <CreateTime>${createTime}</CreateTime>
		 <MsgType><![CDATA[text]]></MsgType>
		 <Content><![CDATA[欢迎关注]]></Content>
		 </xml>`
  } else {
    //其他情况
    ctx.body = `<xml>
		 <ToUserName><![CDATA[${toFromName}]]></ToUserName>
		 <FromUserName><![CDATA[${toUserName}]]></FromUserName>
		 <CreateTime>${createTime}</CreateTime>
		 <MsgType><![CDATA[text]]></MsgType>
		 <Content><![CDATA[你说啥？]]></Content>
		 </xml>`
  }
})

app.use(router.routes())
app.use(router.allowedMethods())

let server = app.listen(3000, function () {
  let host = server.address().address
  let port = server.address().port
  console.log('应用实例，访问地址为 http://localhost:%s', port)
})

function parseXMLAsync(xml) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xml, { trim: true }, function (err, content) {
      if (err) {
        reject(err)
      }
      resolve(content)
    })
  })
}
