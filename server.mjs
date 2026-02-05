import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');
const HOST = 'https://24data.ptfs.app';
const PORT = Number(process.env.PORT || 4173);

const state = {
  acftMain: null,
  acftEvent: null,
  controllers: null,
  atis: null,
  ws: {
    connected: false,
    lastEventAt: null,
    acftMain: null,
    acftEvent: null,
    controllers: null,
    atis: null,
    flightPlansMain: [],
    flightPlansEvent: []
  },
  lastRestUpdate: null,
  errors: []
};

const sseClients = new Set();
const isControllerCache = new Map();

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8' };

function pushError(scope, error) {
  state.errors.unshift({ scope, at: new Date().toISOString(), message: String(error?.message || error) });
  state.errors = state.errors.slice(0, 20);
}

async function fetchJson(path) {
  const res = await fetch(`${HOST}${path}`);
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json();
}

async function pollRest() {
  try {
    const [acftMain, acftEvent, controllers, atis] = await Promise.all([
      fetchJson('/acft-data'),
      fetchJson('/acft-data/event'),
      fetchJson('/controllers'),
      fetchJson('/atis')
    ]);
    state.acftMain = acftMain;
    state.acftEvent = acftEvent;
    state.controllers = controllers;
    state.atis = atis;
    state.lastRestUpdate = new Date().toISOString();
    broadcastSSE({ t: 'REST_SNAPSHOT', d: snapshot(), s: state.lastRestUpdate });
  } catch (error) {
    pushError('rest-poll', error);
  }
}

function connectWs() {
  let ws;
  try {
    ws = new WebSocket('wss://24data.ptfs.app/wss');
  } catch (error) {
    pushError('ws-connect', error);
    setTimeout(connectWs, 2000);
    return;
  }

  ws.addEventListener('open', () => {
    state.ws.connected = true;
    state.ws.lastEventAt = new Date().toISOString();
    broadcastSSE({ t: 'WS_STATUS', d: { connected: true }, s: state.ws.lastEventAt });
  });

  ws.addEventListener('close', () => {
    state.ws.connected = false;
    broadcastSSE({ t: 'WS_STATUS', d: { connected: false }, s: new Date().toISOString() });
    setTimeout(connectWs, 2000);
  });

  ws.addEventListener('error', (event) => {
    pushError('ws-error', event?.message || 'Unknown websocket error');
  });

  ws.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      state.ws.lastEventAt = payload?.s || new Date().toISOString();
      switch (payload.t) {
        case 'ACFT_DATA':
          state.ws.acftMain = payload.d;
          break;
        case 'EVENT_ACFT_DATA':
          state.ws.acftEvent = payload.d;
          break;
        case 'CONTROLLERS':
          state.ws.controllers = payload.d;
          break;
        case 'ATIS':
          state.ws.atis = payload.d;
          break;
        case 'FLIGHT_PLAN':
          state.ws.flightPlansMain.unshift(payload.d);
          state.ws.flightPlansMain = state.ws.flightPlansMain.slice(0, 25);
          break;
        case 'EVENT_FLIGHT_PLAN':
          state.ws.flightPlansEvent.unshift(payload.d);
          state.ws.flightPlansEvent = state.ws.flightPlansEvent.slice(0, 25);
          break;
        default:
          break;
      }
      broadcastSSE(payload);
    } catch (error) {
      pushError('ws-parse', error);
    }
  });
}

function snapshot() {
  return {
    rest: {
      acftMain: state.acftMain,
      acftEvent: state.acftEvent,
      controllers: state.controllers,
      atis: state.atis,
      lastRestUpdate: state.lastRestUpdate
    },
    ws: state.ws,
    errors: state.errors
  };
}

function writeJson(res, code, payload) {
  res.writeHead(code, jsonHeaders);
  res.end(JSON.stringify(payload));
}

function sendSSE(res, evt) {
  res.write(`data: ${JSON.stringify(evt)}\n\n`);
}

function broadcastSSE(evt) {
  for (const res of sseClients) sendSSE(res, evt);
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

async function serveStatic(pathname, res) {
  const safePath = normalize(pathname).replace(/^\.\.(\/|\\|$)/, '');
  const target = safePath === '/' ? '/index.html' : safePath;
  const filePath = join(PUBLIC_DIR, target);
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/snapshot') return writeJson(res, 200, snapshot());

  if (url.pathname.startsWith('/api/is-controller/')) {
    const discordId = url.pathname.split('/').pop();
    if (!discordId) return writeJson(res, 400, { error: 'missing discord id' });

    const cached = isControllerCache.get(discordId);
    if (cached && Date.now() - cached.at < 30000) {
      return writeJson(res, 200, { discordId, isController: cached.value, cached: true });
    }

    try {
      const value = await fetchJson(`/is-controller/${discordId}`);
      isControllerCache.set(discordId, { value, at: Date.now() });
      return writeJson(res, 200, { discordId, isController: value, cached: false });
    } catch (error) {
      pushError('is-controller', error);
      return writeJson(res, 502, { error: 'upstream failed', details: String(error.message || error) });
    }
  }

  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    });
    sseClients.add(res);
    sendSSE(res, { t: 'HELLO', d: snapshot(), s: new Date().toISOString() });
    req.on('close', () => sseClients.delete(res));
    return;
  }

  return serveStatic(url.pathname, res);
});

server.listen(PORT, () => {
  console.log(`ATC24 Hub running on http://localhost:${PORT}`);
});

pollRest();
setInterval(pollRest, 3000);
connectWs();
setInterval(() => broadcastSSE({ t: 'HEARTBEAT', d: { now: new Date().toISOString() } }), 6000);
