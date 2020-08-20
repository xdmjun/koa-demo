const Koa = require('koa')
const app = new Koa()
const Router = require('koa-router')
const router = new Router()
const bodyParser = require('koa-bodyparser')
const sha1 = require('sha1')
const getRawBody = require('raw-body')
const xml2js = require('xml2js')
const rp = require('request-promise')
const config = require('./config.js')
if (typeof localStorage === 'undefined' || localStorage === null) {
  var LocalStorage = require('node-localstorage').LocalStorage
  localStorage = new LocalStorage('./scratch')
}

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

  localStorage.clear()
  let fromUserName = localStorage.getItem('fromUserName') || []

  if (event == 'LOCATION') {
    let latitude = xml.xml.Latitude ? xml.xml.Latitude[0] : ''
    let longitude = xml.xml.Longitude ? xml.xml.Longitude[0] : ''

    if (fromUserName.length > 0) {
      if (fromUserName.findIndex((f) => f.id == toFromName) == -1) {
        fromUserName.push({
          id: toFromName,
          latitude: latitude,
          longitude: longitude,
        })
        localStorage.setItem('fromUserName', fromUserName)
      }
    } else {
      fromUserName.push({
        id: toFromName,
        latitude: latitude,
        longitude: longitude,
      })
      localStorage.setItem('fromUserName', fromUserName)
    }
  }

  if (msgType == 'event') {
    let replyMsg = '说些什么'
    if (event == 'subscribe') {
      replyMsg = '欢迎关注'
      //关注后
      ctx.body = `<xml>
        <ToUserName><![CDATA[${toFromName}]]></ToUserName>
        <FromUserName><![CDATA[${toUserName}]]></FromUserName>
        <CreateTime>${createTime}</CreateTime>
        <MsgType><![CDATA[text]]></MsgType>
        <Content><![CDATA[${replyMsg}]]></Content>
        </xml>`
    } else if (event == 'CLICK') {
      let eventKey = xml.xml.EventKey ? xml.xml.EventKey[0] : ''
      switch (eventKey) {
        case 'weather':
          let latitude = '31.467138'
          let longitude = '120.286194'
          if (fromUserName.length > 0) {
            // 当前用户的经纬度
            latitude = fromUserName.find((f) => f.id == toFromName).latitude
            longitude = fromUserName.find((f) => f.id == toFromName).longitude
          }
          let options = {
            method: 'get',
            uri:
              'http://api.map.baidu.com/geocoder?location=' +
              latitude +
              ',' +
              longitude +
              '&output=json&key=' +
              config.baiduAk,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            json: true,
          }
          let cityInfo = await rp(options),
            city = cityInfo.result.addressComponent.city.replace('市', '')

          let woptions = {
            method: 'get',
            url:
              'https://tianqiapi.com/api?version=v6&appid=' +
              config.weatherAppid +
              '&appsecret=' +
              config.weatherSecrect +
              '&city=' +
              encodeURI(city),
            json: true,
          }
          let weather = await rp(woptions)
          let weatherTip = `您当前的城市${weather.city}\n天气:${weather.wea}\n温度:${weather.tem2}~${weather.tem1}℃\n实时温度:${weather.tem}℃\n风力:${weather.win}${weather.win_speed}\n空气质量:${weather.air_tips}`
          replyMsg = weatherTip
          ctx.body = `<xml>
            <ToUserName><![CDATA[${toFromName}]]></ToUserName>
            <FromUserName><![CDATA[${toUserName}]]></FromUserName>
            <CreateTime>${createTime}</CreateTime>
            <MsgType><![CDATA[text]]></MsgType>
            <Content><![CDATA[${replyMsg}]]></Content>
            </xml>`
          break
        default:
          break
      }
    }
  } else if (msgType == 'text') {
    // 其他情况
    // 接入智能机器人自动回复
    let content = encodeURIComponent(xml.xml.Content[0])
    // 图灵机器人
    let txt = await tlRobot(content)
    // 青云客机器人
    // let txt = await qykRobot(content)
    // 茉莉机器人
    // let txt = await mlRobot(content)

    ctx.body = `<xml>
		 <ToUserName><![CDATA[${toFromName}]]></ToUserName>
		 <FromUserName><![CDATA[${toUserName}]]></FromUserName>
		 <CreateTime>${createTime}</CreateTime>
		 <MsgType><![CDATA[text]]></MsgType>
		 <Content><![CDATA[${txt}]]></Content>
		 </xml>`
  }
})

app.use(router.routes())
app.use(router.allowedMethods())

let server = app.listen(config.serverPort, function () {
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

async function mlRobot(content) {
  let rtn = await rp({
      method: 'GET',
      uri: `http://i.itpk.cn/api.php?question=
      ${content}&limit=5&api_key=${config.robotKey}&api_secret=${config.robotSecret}`,
    }),
    rt = unescape(rtn.replace(/\\/g, '%')).replace(/%r%n/g, ''),
    txt = ''

  if (typeof rt == 'string') {
    if (rt.indexOf('{') != -1) {
      try {
        let obj = JSON.parse(rt.trim())
        if (typeof obj == 'object' && obj) {
          txt = '【' + obj.title + '】\n' + obj.content
        }
      } catch (e) {
        console.log(e)
      }
    } else {
      txt = rt
    }
  }
  return txt
}

async function qykRobot(content) {
  let rtn = await rp({
      method: 'GET',
      uri: `http://api.qingyunke.com/api.php?key=free&appid=0&msg=${content}`,
    }),
    txt = JSON.parse(rtn).content
  return txt
}

async function tlRobot(content) {
  let params = {
      reqType: 0,
      perception: {
        inputText: {
          text: content,
        },
      },
      userInfo: {
        apiKey: config.apiKey,
        userId: config.userId,
      },
    },
    options = {
      method: 'POST',
      uri: 'http://openapi.tuling123.com/openapi/api/v2',
      body: JSON.stringify(params),
    },
    rt = await rp(options),
    txt = JSON.parse(rt).results[0].values.text
  return txt
}
