const Koa = require('koa');
const path = require('path');
const app = new Koa();
const Router = require('koa-router');
const router = new Router();
const bodyParser = require('koa-bodyparser');
const rp = require('request-promise');
const views = require('koa-views');
const static = require('koa-static');
const cors = require('koa2-cors');
const cache = require('memory-cache');
const sha1 = require('sha1'); //签名算法
const config = require('./config');

app.use(bodyParser());
app.use(cors());
app.use(static(path.join(__dirname, './static')));
app.use(
  views(path.join(__dirname, './views'), {
    extension: 'ejs',
  })
);

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.body = {
      code: -1,
      data: ctx.data,
      message: ctx.msg || err.message || '服务开小差了，请稍后再试',
      etime: Date.now(),
    };
  }
});

app.use(async (ctx, next) => {
  await next();
  if (ctx.data) {
    ctx.set('Content-Type', 'application/json');
    ctx.body = {
      code: ctx.code || 0,
      data: ctx.data,
      message: ctx.msg || 'success',
      etime: Date.now(),
    };
  } else {
    ctx.set('Content-Type', 'text/html; charset=utf-8');
  }
});

router.get('/', async (ctx, next) => {
  //获取当前url
  var url =
    ctx.request.protocol + '://' + ctx.request.host + ctx.request.originalUrl;
  await ctx.render('index', { signPackage: await sign(url) });
  await next();
});

router.get('/sig', async (ctx, next) => {
  try {
    //获取当前url
    let url =
      ctx.request.protocol + '://' + ctx.request.host + ctx.request.originalUrl;
    if (ctx.query.url) {
      url = ctx.query.url;
    }
    ctx.data = await sign(url);
  } catch (e) {
    console.log(e);
  }
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

let server = app.listen(4000, function () {
  let host = server.address().address;
  let port = server.address().port;
  console.log('应用实例，访问地址为 http://localhost:%s', port);
});

async function sign(url) {
  let sig = {},
    noncestr = config.noncestr,
    timestamp = Math.floor(Date.now() / 1000), //精确到秒
    jsapi_ticket;
  if (cache.get('ticket')) {
    jsapi_ticket = cache.get('ticket');
    sig = {
      appId: config.appid,
      noncestr: noncestr,
      timestamp: timestamp,
      url: url,
      jsapi_ticket: jsapi_ticket,
      signature: sha1(
        'jsapi_ticket=' +
          jsapi_ticket +
          '&noncestr=' +
          noncestr +
          '&timestamp=' +
          timestamp +
          '&url=' +
          url
      ),
    };
  } else {
    // 获取 token
    let tokenRes = await rp({
      uri:
        config.accessTokenUrl +
        '?grant_type=' +
        config.grant_type +
        '&appid=' +
        config.appid +
        '&secret=' +
        config.secret,
    });
    tokenRes = JSON.parse(tokenRes);

    // 获取 ticket
    let ticketRes = await rp({
      uri:
        config.ticketUrl +
        '?access_token=' +
        tokenRes.access_token +
        '&type=jsapi',
    });
    var ticketMap = JSON.parse(ticketRes);
    // 加入缓存
    cache.put('ticket', ticketMap.ticket, config.cache_duration);
    sig = {
      appId: config.appid,
      noncestr: noncestr,
      timestamp: timestamp,
      url: url,
      jsapi_ticket: ticketMap.ticket,
      signature: sha1(
        'jsapi_ticket=' +
          ticketMap.ticket +
          '&noncestr=' +
          noncestr +
          '&timestamp=' +
          timestamp +
          '&url=' +
          url
      ),
    };
  }
  return sig;
}
