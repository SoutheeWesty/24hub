const $ = (id) => document.getElementById(id);

const els = {
  wsStatus: $('wsStatus'),
  restStatus: $('restStatus'),
  mainAircraftCount: $('mainAircraftCount'),
  eventAircraftCount: $('eventAircraftCount'),
  controllersCount: $('controllersCount'),
  atisCount: $('atisCount'),
  flightPlansMain: $('flightPlansMain'),
  flightPlansEvent: $('flightPlansEvent'),
  controllers: $('controllers'),
  atis: $('atis'),
  events: $('events'),
  controllerForm: $('controllerForm'),
  discordId: $('discordId'),
  controllerResult: $('controllerResult')
};

function listReplace(target, items) {
  target.innerHTML = '';
  for (const item of items.slice(0, 25)) {
    const li = document.createElement('li');
    li.textContent = item;
    target.appendChild(li);
  }
}

function renderSnapshot(data) {
  const mainAcft = Object.keys(data?.rest?.acftMain || {}).length;
  const eventAcft = Object.keys(data?.rest?.acftEvent || {}).length;
  const ctrls = Array.isArray(data?.rest?.controllers) ? data.rest.controllers : [];
  const atis = Array.isArray(data?.rest?.atis) ? data.rest.atis : [];

  els.mainAircraftCount.textContent = String(mainAcft);
  els.eventAircraftCount.textContent = String(eventAcft);
  els.controllersCount.textContent = String(ctrls.length);
  els.atisCount.textContent = String(atis.length);
  els.restStatus.textContent = `REST: ${data?.rest?.lastRestUpdate || 'waiting'}`;

  listReplace(
    els.controllers,
    ctrls.map((c) => `${c.airport} ${c.position} — ${c.holder ?? 'Unclaimed'}${c.queue?.length ? ` (Queue: ${c.queue.join(', ')})` : ''}`)
  );

  listReplace(
    els.atis,
    atis.map((a) => `${a.airport} ${a.letter} — ${a.lines?.[0] || 'No lines'}${a.editor ? ` (by ${a.editor})` : ''}`)
  );

  listReplace(
    els.flightPlansMain,
    (data?.ws?.flightPlansMain || []).map((f) => `${f.callsign} ${f.departing}→${f.arriving} ${f.flightrules} FL${f.flightlevel}`)
  );

  listReplace(
    els.flightPlansEvent,
    (data?.ws?.flightPlansEvent || []).map((f) => `${f.callsign} ${f.departing}→${f.arriving} ${f.flightrules} FL${f.flightlevel}`)
  );

  const events = (data?.errors || []).map((e) => `${e.at} [${e.scope}] ${e.message}`);
  listReplace(els.events, events.length ? events : ['No errors recorded']);

  els.wsStatus.textContent = `WS: ${data?.ws?.connected ? 'connected' : 'disconnected'} (${data?.ws?.lastEventAt || 'no event'})`;
}

async function boot() {
  const snapshot = await fetch('/api/snapshot').then((r) => r.json());
  renderSnapshot(snapshot);

  const stream = new EventSource('/api/stream');
  stream.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.t === 'HELLO' || msg.t === 'REST_SNAPSHOT') {
        renderSnapshot(msg.d);
      }
    } catch {
      // ignored
    }
  };
}

els.controllerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const discordId = els.discordId.value.trim();
  if (!discordId) return;

  try {
    const response = await fetch(`/api/is-controller/${encodeURIComponent(discordId)}`);
    const data = await response.json();
    els.controllerResult.textContent = `${data.discordId}: ${data.isController ? 'currently controlling' : 'not controlling'}${data.cached ? ' (cached)' : ''}`;
  } catch (error) {
    els.controllerResult.textContent = `Check failed: ${error.message}`;
  }
});

boot();
