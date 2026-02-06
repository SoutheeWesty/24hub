const $ = (id) => document.getElementById(id);

const els = {
  wsStatus: $('wsStatus'),
  restStatus: $('restStatus'),
  userStatus: $('userStatus'),
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
  controllerResult: $('controllerResult'),
  loginButton: $('loginButton'),
  authPanel: $('authPanel'),
  loginForm: $('loginForm'),
  displayName: $('displayName'),
  role: $('role'),
  workspacePanel: $('workspacePanel'),
  workspaceIntro: $('workspaceIntro'),
  softwareTitle: $('softwareTitle'),
  softwareMenu: $('softwareMenu'),
  controllerWorkspace: $('controllerWorkspace'),
  groundWorkspace: $('groundWorkspace'),
  playerWorkspace: $('playerWorkspace'),
  viewerWorkspace: $('viewerWorkspace'),
  pdcForm: $('pdcForm'),
  pdcOutput: $('pdcOutput'),
  pdcCallsign: $('pdcCallsign'),
  pdcDeparture: $('pdcDeparture'),
  pdcArrival: $('pdcArrival'),
  pdcSquawk: $('pdcSquawk'),
  scopeButtons: $('scopeButtons'),
  scopePreview: $('scopePreview'),
  scopeCaption: $('scopeCaption')
};

const roleSoftware = {
  controller: ['Radar', 'Scope', 'PDC', 'ATIS', 'Traffic'],
  ground: ['Turnaround', 'Stand Ops', 'Pushback', 'Service Board'],
  player: ['Flight Plan', 'Briefing', 'ATIS Monitor', 'Nav Tools'],
  viewer: ['Live Map', 'Traffic Feed', 'Controller Feed', 'ATIS Board']
};

const scopeDescriptions = {
  tower: 'Tower Scope: final + immediate pattern traffic.',
  approach: 'Approach Scope: arrival streams and sequencing outside the pattern.',
  ground: 'Ground Scope: apron and taxi movement awareness.'
};

function listReplace(target, items) {
  target.innerHTML = '';
  for (const item of items.slice(0, 25)) {
    const li = document.createElement('li');
    li.textContent = item;
    target.appendChild(li);
  }
}

function setVisible(el, visible) {
  if (!el) return;
  el.classList.toggle('hidden', !visible);
}

function roleLabel(role) {
  return role === 'controller' ? 'Controller' : role === 'ground' ? 'Ground Crew' : role === 'player' ? 'Player' : 'Viewer';
}

function setScopeView(scope) {
  if (!els.scopePreview || !els.scopeCaption || !els.scopeButtons) return;

  els.scopePreview.className = `scope-preview ${scope}`;
  els.scopeCaption.textContent = scopeDescriptions[scope] || scopeDescriptions.tower;

  for (const button of els.scopeButtons.querySelectorAll('.scope-view-btn')) {
    button.classList.toggle('active', button.dataset.scope === scope);
  }
}

function showRoleSoftware(role) {
  setVisible(els.workspacePanel, true);
  setVisible(els.controllerWorkspace, role === 'controller');
  setVisible(els.groundWorkspace, role === 'ground');
  setVisible(els.playerWorkspace, role === 'player');
  setVisible(els.viewerWorkspace, role === 'viewer');

  els.softwareTitle.textContent = `${roleLabel(role)} Software`;
  els.softwareMenu.innerHTML = '';
  for (const moduleName of roleSoftware[role] || []) {
    const moduleChip = document.createElement('button');
    moduleChip.type = 'button';
    moduleChip.className = 'module-chip';
    moduleChip.textContent = moduleName;
    els.softwareMenu.appendChild(moduleChip);
  }

  if (role === 'controller') {
    setScopeView('tower');
  }

  els.workspacePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applySession(session) {
  if (!session) {
    els.userStatus.textContent = 'Not logged in';
    setVisible(els.authPanel, false);
    setVisible(els.workspacePanel, false);
    return;
  }

  els.userStatus.textContent = `${session.displayName} · ${roleLabel(session.role)}`;
  els.workspaceIntro.textContent = `Logged in as ${session.displayName}. Opening ${roleLabel(session.role)} software.`;
  setVisible(els.authPanel, false);
  showRoleSoftware(session.role);
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

  const savedSessionRaw = localStorage.getItem('atc24_session');
  if (savedSessionRaw) {
    try {
      applySession(JSON.parse(savedSessionRaw));
    } catch {
      localStorage.removeItem('atc24_session');
    }
  }

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

els.loginButton.addEventListener('click', () => {
  const willShow = els.authPanel.classList.contains('hidden');
  setVisible(els.authPanel, willShow);
});

els.loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const displayName = els.displayName.value.trim();
  const role = els.role.value;
  if (!displayName || !role) return;

  const session = { displayName, role, loggedInAt: new Date().toISOString() };
  localStorage.setItem('atc24_session', JSON.stringify(session));
  applySession(session);
});

els.scopeButtons?.addEventListener('click', (event) => {
  const button = event.target.closest('.scope-view-btn');
  if (!button?.dataset.scope) return;
  setScopeView(button.dataset.scope);
});

els.pdcForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const callsign = els.pdcCallsign.value.trim().toUpperCase();
  const dep = els.pdcDeparture.value.trim().toUpperCase();
  const arr = els.pdcArrival.value.trim().toUpperCase();
  const squawk = els.pdcSquawk.value.trim();
  if (!callsign || !dep || !arr || !squawk) return;

  els.pdcOutput.textContent = [
    `${callsign} PRE-DEPARTURE CLEARANCE`,
    `CLEARED TO ${arr} VIA FILED ROUTE`,
    `DEPARTURE ${dep}, EXPECT DEP RWY AS ASSIGNED`,
    `SQUAWK ${squawk}`,
    'CONTACT DELIVERY/GROUND WHEN READY'
  ].join('\n');
});

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
