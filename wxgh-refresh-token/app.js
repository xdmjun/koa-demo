const Koa = require('koa');
const app = new Koa();
const Router = require('koa-router');
const router = new Router();
const fs = require('fs');
const request = require('request');

const appid = '',
  appsecret = '',
  // 微信 Access_token 接口
  tokenUrl = 'https://api.weixin.qq.com/cgi-bin/token';

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
  ctx.body = {
    code: ctx.code || 0,
    data: ctx.data,
    message: ctx.msg || 'success',
    etime: Date.now(),
  };
});

router.get('/getToken', async (ctx, next) => {
  let tokenInfo = fs.existsSync('token_info.json')
    ? JSON.parse(fs.readFileSync('token_info.json', 'utf-8'))
    : null;
  let expires_time = tokenInfo ? tokenInfo.expires_time : '';
  let cache_access_token =
    tokenInfo && tokenInfo.access_token ? tokenInfo.access_token : '';
  if (
    parseInt(Date.now() / 1000) > expires_time + 3600 ||
    tokenInfo == null ||
    cache_access_token == ''
  ) {
    // 请求 url 拼接
    let tokenForUrl =
      tokenUrl +
      '?grant_type=client_credential&appid=' +
      appid +
      '&secret=' +
      appsecret;
    // 请求 token
    let tokenInfoNew = await new Promise(function (resolve, reject) {
      request.get(tokenForUrl, function (error, response, body) {
        if (!error && response.statusCode == 200) {
          resolve(body);
        }
        reject(error);
      });
    });
    tokenInfoNew = JSON.parse(tokenInfoNew);
    // 获取返回的 token
    cache_access_token = tokenInfoNew.access_token;
    expires_time = parseInt(Date.now() / 1000);
    // 将新的 token 及 过期时间写入缓存
    fs.writeFileSync(
      'token_info.json',
      JSON.stringify({
        access_token: cache_access_token,
        expires_time: expires_time,
      })
    );
    // 返回新的 token
    ctx.data = { token: cache_access_token, expires_time: expires_time };
  } else {
    // 未过期时直接返回缓存的 token
    ctx.data = {
      token: tokenInfo.access_token,
      expires_time: tokenInfo.expires_time,
    };
  }
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

let server = app.listen(3000, function () {
  let host = server.address().address;
  let port = server.address().port;
  console.log('应用实例，访问地址为 http://localhost:%s', port);
});
