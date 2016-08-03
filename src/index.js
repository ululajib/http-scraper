import Promise from 'bluebird';
import fse from 'fs-extra';
import Request from 'request';
import Debug from 'debug';
import path from 'path';
import absoluteAllResource from './libs/rel-to-abs';
const fs = Promise.promisifyAll(fse);
const debug = Debug('http-scrapers:main');
const http = {
  requestAsync,
  get,
  post,
  stream,
  getCookies,
  setCookies,
  resetCookies,
  saveFile,
  saveHtml,
  savePDF,
  saveImage,
};
export default function Http(options = {}) {
  const initialProperties = initialize(options);
  const httpInstance = Object.create(http);
  return Object.assign(httpInstance, initialProperties);
}

function initialize(options) {
  const {
    uri = requiredParameter('uri'),
    host = '',
    userAgent = '',
    headers = {},
    gzip = false,
    delay = 0,
    followAllRedirects = false,
    type = 'unknown',
    capture = false,
    capturePath = '.',
  } = options;
  const defaultHeaders = {
    Host: host,
    Accept: '*/*',
    Connection: 'close',
    'User-Agent': userAgent,
  };
  const jar = Request.jar();
  const defaultRequestOptions = {
    jar,
    gzip,
    followAllRedirects,
    headers: Object.assign({}, defaultHeaders, headers),
  };
  const request = Promise.promisifyAll(Request.defaults(defaultRequestOptions));
  const logs = [];
  const initialProperties = {
    type,
    logs,
    logId: 0,
    capture,
    capturePath,
    request,
    jar,
    uri,
    delay,
  };
  return initialProperties;
}

function getCookies() {
  return this.jar.getCookies(this.uri);
}

function setCookies(cookies) {
  cookies = [].concat(cookies);
  if (cookies.length) {
    cookies.forEach((rawCookie) => {
      const cookie = Request.cookie(rawCookie);
      Reflect.deleteProperty(cookie, 'domain');
      this.jar.setCookie(cookie, this.uri, {ignoreError: true});
    });
  }
  return this;
}

function resetCookies() {
  const jar = Request.jar();
  this.request = Promise.promisifyAll(this.request.defaults({jar}));
  this.jar = jar;
  return this;
}

function requestAsync(method, options) {
  const request = this;
  const methodAsync = `${method}Async`;
  const cookies = this.getCookies() || 'N/A';
  debug(`request using cookie ${cookies}`);
  logThisRequest();
  options.followRedirect = logRedirect;
  return Promise.delay(this.delay)
    .then(() => this.request[methodAsync](options))
    .tap(logThisResponse);

  function logThisRequest() {
    const data = {
      logId: request.logId++,
      time: new Date(),
      type: 'request',
      method,
      options,
      cookies,
    };
    request.logs.push(data);
  }

  function logThisResponse(response) {
    const {body, statusCode, headers} = response;
    const responseData = {
      logId: request.logId++,
      time: new Date(),
      type: 'response',
      url: options.url,
      body,
      statusCode,
      headers,
    };
    request.logs.push(responseData);
  }

  function logRedirect(response) {
    const {statusCode, headers} = response;
    const authStatusCode = 401;
    const type = response.statusCode === authStatusCode ? 'auth' : 'redirect';
    const data = {
      logId: request.logId++,
      time: new Date(),
      type,
      url: response.url,
      statusCode,
      headers,
    };
    request.logs.push(data);
    return true;
  }
}

function get(options) {
  return this.requestAsync('get', options);
}

function post(options) {
  return this.requestAsync('post', options);
}

function stream(options) {
  return Promise.resolve(this.request(options));
}

function saveHtml(name, currentUrl) {
  const ext = 'html';
  const convertAbsolute = true;
  return this.saveFile(name, {currentUrl, ext, convertAbsolute});
}

function savePDF(name, currentUrl) {
  const ext = 'pdf';
  const encoding = 'binary';
  return this.saveFile(name, {currentUrl, ext, encoding});
}

function saveImage(name, currentUrl) {
  const ext = 'jpg';
  const encoding = 'binary';
  return this.saveFile(name, {currentUrl, ext, encoding});
}

function saveFile(name, options = {}) {
  const {
    currentUrl = this.uri,
    ext = 'html',
    encoding = 'utf8',
    convertAbsolute = false,
  } = options;
  if (!this.capture) {
    return Promise.resolve();
  }
  const filepath = path.resolve(this.capturePath, 'capture', `${this.type}/${name}.${ext}`);
  debug(`Capture ${name} to ${filepath}`);
  return (text) => {
    text = convertAbsolute ? absoluteAllResource.convert(text, currentUrl) : text;
    return fs.outputFileAsync(filepath, text, encoding);
  };
}

function requiredParameter(name) {
  throw new Error(`Missing parameter ${name}`);
}