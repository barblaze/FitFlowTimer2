import { Mode, normalizeConfig, totalSeconds, PhaseType } from './core/model.js';
import { TimerEngine } from './core/engine.js';
import { formatMinSec, formatClock, splitSeconds, toSeconds } from './core/format.js';
import { loadConfig, saveConfig, loadProfile, loadSettings, saveSettings, CoachStyle } from './store.js';
import { Beeps, unlockAudio } from './audio/beep.js';
import { CoachVoice } from './audio/coach.js';
import { isWakeLockSupported, requestWakeLock, releaseWakeLock, setupWakeLockAutoReacquire } from './wake.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let config = loadConfig();
let settings = loadSettings();
let engine = null;
let timerId = null;
let lastPhaseKey = null;
let lastSecond = -1;
let logLines = [];
let resyncing = false;

const coach = new CoachVoice();
applyCoachSettings();

function applyCoachSettings() {
  coach.setStyle(settings.coachStyle);
  coach.setVolume(settings.coachVoiceVolume);
  coach.setEnabled(settings.voiceEnabled);
}

const PROFILE_LABEL = { TABATA: 'Perfil 1', EMOM: 'Perfil 2', AMRAP: 'Perfil 3', CUSTOM: 'Perfil 4' };
const PHASE_LABEL = {
  PREPARATION: 'PREPARACIÓN',
  WORK: 'TRABAJO',
  REST: 'DESCANSO',
  REST_BETWEEN_CYCLES: 'DESCANSO ENTRE CICLOS',
  FINISHED: 'FINALIZADO',
};
const RING_CIRC = 2 * Math.PI * 112;
const IC_PAUSE = '<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
const IC_PLAY = '<path fill="currentColor" d="M8 5v14l11-7z"/>';

// ---- Tabs ----
$('#tabTraining').addEventListener('click', () => showTab('training'));
$('#tabSettings').addEventListener('click', () => showTab('settings'));
function showTab(which) {
  const t = which === 'training';
  $('#tabTraining').classList.toggle('active', t);
  $('#tabSettings').classList.toggle('active', !t);
  $('#tabTraining').setAttribute('aria-selected', t ? 'true' : 'false');
  $('#tabSettings').setAttribute('aria-selected', t ? 'false' : 'true');
  $('#panelTraining').classList.toggle('hidden', !t);
  $('#panelSettings').classList.toggle('hidden', t);
  $('#startBar').classList.toggle('hidden', !t);
}

function showView(name) {
  $('#viewSetup').classList.toggle('hidden', name !== 'setup');
  $('#viewWorkout').classList.toggle('hidden', name !== 'workout');
  $('.tabbar').classList.toggle('hidden', name === 'workout');
  $('#startBar').classList.toggle('hidden', name === 'workout' || !$('#tabTraining').classList.contains('active'));
}

// ---- Mode selection ----
$$('.mode-card').forEach((btn) => btn.addEventListener('click', () => {
  const mode = btn.dataset.mode;
  if (!Mode[mode]) return;
  config = loadProfile(mode);
  config = saveConfig(normalizeConfig({ ...config, mode }));
  renderSetup();
}));

function setActiveMode() {
  $$('.mode-card').forEach((b) => b.classList.toggle('selected', b.dataset.mode === config.mode));
}

// ---- Quick coach (training tab) ----
$('#coachQuickSwitch').addEventListener('change', (e) => {
  settings.voiceEnabled = e.target.checked;
  persistSettings();
  applyCoachSettings();
  renderCoachQuick();
  renderSettings();
});
$$('.seg-btn').forEach((btn) => btn.addEventListener('click', () => {
  const style = btn.dataset.style;
  if (!CoachStyle[style]) return;
  settings.coachStyle = style;
  persistSettings();
  applyCoachSettings();
  renderCoachQuick();
  renderSettings();
}));

function renderCoachQuick() {
  $('#coachQuickSwitch').checked = !!settings.voiceEnabled;
  $('#coachQuickStyles').classList.toggle('hidden', !settings.voiceEnabled);
  $$('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.style === settings.coachStyle));
  const ind = $('#coachQuickIndicator');
  if (settings.voiceEnabled) {
    const s = CoachStyle[settings.coachStyle] || CoachStyle.TRAINER;
    ind.textContent = s.label;
    ind.classList.remove('hidden');
  } else {
    ind.classList.add('hidden');
  }
  // workout badge
  const wb = $('#wkCoachBadge');
  if (settings.voiceEnabled) {
    const s = CoachStyle[settings.coachStyle] || CoachStyle.TRAINER;
    wb.textContent = s.label.toUpperCase();
    wb.classList.remove('hidden');
  } else {
    wb.classList.add('hidden');
  }
}

// ---- Steppers / editor ----
$$('[data-step]').forEach((btn) => btn.addEventListener('click', () => {
  const [field, deltaStr] = btn.dataset.step.split(':');
  applyDelta(field, parseInt(deltaStr, 10));
}));

function applyDelta(field, delta) {
  const limits = {
    prep: [0, 600], work: [1, 3600], rest: [0, 600], restCycles: [0, 600], rounds: [1, 99], cycles: [1, 99],
  };
  const map = { prep: 'prepSeconds', work: 'workSeconds', rest: 'restSeconds', restCycles: 'restBetweenCyclesSeconds', rounds: 'rounds', cycles: 'cycles' };
  const key = map[field];
  if (!key) return;
  const [min, max] = limits[field];
  let val = (Number(config[key]) || 0) + delta;
  val = Math.max(min, Math.min(max, val));
  config = saveConfig(normalizeConfig({ ...config, [key]: val }));
  renderSetup();
}

$$('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openTimeDialog(btn.dataset.edit)));

function openTimeDialog(field) {
  const map = {
    prep: ['prepSeconds', 'Preparación', 0, 600],
    work: ['workSeconds', 'Trabajo', 1, 3600],
    rest: ['restSeconds', 'Descanso entre rondas', 0, 600],
    restCycles: ['restBetweenCyclesSeconds', 'Descanso entre ciclos', 0, 600],
  };
  const info = map[field];
  if (!info) return;
  const [key, title, minS, maxS] = info;
  const dlg = $('#timeDialog');
  $('#dlgTitle').textContent = title;
  const { minutes, seconds } = splitSeconds(config[key]);
  $('#dlgMin').value = minutes;
  $('#dlgSec').value = seconds;
  $('#dlgError').textContent = '';
  const updatePreview = () => {
    const s = toSeconds($('#dlgMin').value, $('#dlgSec').value);
    $('#dlgPreview').textContent = formatMinSec(s);
    $('#dlgError').textContent = (s < minS || s > maxS) ? `Rango: ${formatMinSec(minS)} a ${formatMinSec(maxS)}` : '';
  };
  $('#dlgMin').oninput = updatePreview;
  $('#dlgSec').oninput = updatePreview;
  updatePreview();
  dlg.returnValue = 'cancel';
  dlg.showModal();
  dlg.onclose = () => {
    if (dlg.returnValue !== 'ok') return;
    let s = toSeconds($('#dlgMin').value, $('#dlgSec').value);
    if (s < minS || s > maxS) return;
    config = saveConfig(normalizeConfig({ ...config, [key]: s }));
    renderSetup();
  };
  $('#dlgOk').onclick = (e) => {
    let s = toSeconds($('#dlgMin').value, $('#dlgSec').value);
    if (s < minS || s > maxS) { e.preventDefault(); $('#dlgError').textContent = `Rango: ${formatMinSec(minS)} a ${formatMinSec(maxS)}`; dlg.returnValue = 'cancel'; return; }
    dlg.returnValue = 'ok';
  };
}

function renderSetup() {
  config = normalizeConfig(config);
  setActiveMode();
  $('#valPrep').textContent = formatMinSec(config.prepSeconds);
  $('#valWork').textContent = formatMinSec(config.workSeconds);
  $('#valRest').textContent = formatMinSec(config.restSeconds);
  $('#valRounds').textContent = String(config.rounds);
  $('#valCycles').textContent = String(config.cycles);
  $('#valRestCycles').textContent = formatMinSec(config.restBetweenCyclesSeconds);
  const total = totalSeconds(config);
  $('#totalText').textContent = formatMinSec(total);
  const structure = `${config.rounds} rondas · ${config.cycles} ciclos · ${formatMinSec(config.workSeconds)} trabajo / ${formatMinSec(config.restSeconds)} descanso`;
  $('#structureText').textContent = structure;
  const warn = $('#warningText');
  if (config.cycles > 1 && config.restBetweenCyclesSeconds === 0) warn.classList.remove('hidden');
  else warn.classList.add('hidden');
  renderCoachQuick();
  renderSettings();
}

// ---- Settings ----
function bindSettings() {
  const bindCheck = (id, key, extra) => $(id).addEventListener('change', (e) => { settings[key] = e.target.checked; persistSettings(); if (extra) extra(e.target.checked); });
  bindCheck('#setSound', 'soundEnabled');
  bindCheck('#setCountdown', 'countdownBeeps');
  bindCheck('#setStartTone', 'startTone');
  bindCheck('#setWake', 'keepScreenOn');
  bindCheck('#setVibrate', 'vibration');
  bindCheck('#setVoice', 'voiceEnabled', () => { applyCoachSettings(); renderCoachQuick(); });
  $('#setVolume').addEventListener('input', (e) => { settings.volume = (+e.target.value) / 100; $('#setVolumeOut').textContent = `${e.target.value}%`; persistSettings(); });
  $('#setCoachVol').addEventListener('input', (e) => { settings.coachVoiceVolume = (+e.target.value) / 100; $('#setCoachVolOut').textContent = `${e.target.value}%`; persistSettings(); applyCoachSettings(); });
  $('#setCoachStyle').addEventListener('change', (e) => { settings.coachStyle = e.target.value; persistSettings(); applyCoachSettings(); renderCoachQuick(); });
  $('#testBeepBtn').addEventListener('click', async () => { await unlockAudio(); Beeps.test(settings.volume); });
  $('#testVoiceBtn').addEventListener('click', async () => { await unlockAudio(); await coach.unlock(); coach.playTest(settings.coachStyle); });
  if (!('vibrate' in navigator)) $('#rowVibrateWrap').classList.add('hidden');
  if (!isWakeLockSupported()) {
    $('#rowWakeWrap').classList.add('hidden');
    const divider = $('#rowVibrateWrap .divider');
    if (divider) divider.classList.add('hidden');
  }
}

function renderSettings() {
  $('#setSound').checked = !!settings.soundEnabled;
  $('#setCountdown').checked = !!settings.countdownBeeps;
  $('#setStartTone').checked = !!settings.startTone;
  $('#setWake').checked = !!settings.keepScreenOn;
  $('#setVibrate').checked = !!settings.vibration;
  $('#setVoice').checked = !!settings.voiceEnabled;
  $('#setVolume').value = Math.round((settings.volume ?? 0.8) * 100);
  $('#setVolumeOut').textContent = `${$('#setVolume').value}%`;
  $('#setCoachVol').value = Math.round((settings.coachVoiceVolume ?? 1) * 100);
  $('#setCoachVolOut').textContent = `${$('#setCoachVol').value}%`;
  $('#setCoachStyle').value = settings.coachStyle || 'TRAINER';
}

function persistSettings() { settings = saveSettings(settings); }

// ---- Workout ----
$('#startBtn').addEventListener('click', startWorkout);
$('#btnToggle').addEventListener('click', toggleWorkout);
$('#btnSkip').addEventListener('click', () => { if (engine && !engine.isFinished) { engine.skip(); renderWorkout(true); } });
$('#btnStop').addEventListener('click', stopWorkout);

async function startWorkout() {
  config = saveConfig(config);
  settings = saveSettings(settings);
  applyCoachSettings();
  logLines = [];
  lastPhaseKey = null;
  lastSecond = -1;
  resyncing = false;
  await unlockAudio();
  if (settings.voiceEnabled) await coach.unlock();
  if (settings.keepScreenOn) await requestWakeLock(true);
  engine = new TimerEngine(config, () => Date.now(), onAnnounce);
  engine.start();
  const first = engine.currentSegment;
  if (first && settings.soundEnabled) {
    if (first.type === PhaseType.WORK && settings.startTone) Beeps.workStart(settings.volume);
    else if (first.type === PhaseType.REST || first.type === PhaseType.REST_BETWEEN_CYCLES) Beeps.restStart(settings.volume);
  }
  showView('workout');
  renderCoachQuick();
  renderWorkout(true);
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => { tick(); renderWorkout(); }, 100);
}

function onAnnounce(event) {
  if (!event) return;
  const msg = announceLabel(event);
  if (msg) { logLines.push(msg); if (logLines.length > 8) logLines.shift(); }
  if (resyncing) return;
  if (settings.voiceEnabled) coach.playEvent(event.type);
}

function announceLabel(e) {
  switch (e.type) {
    case 'SessionStarting': return 'Inicio';
    case 'WorkStarted': return `Trabajo · ronda ${e.round}`;
    case 'HalfTime': return 'Mitad del trabajo';
    case 'WorkFinished': return `Fin ronda ${e.round}`;
    case 'RestStarted': return `Descanso ${formatMinSec(e.seconds || 0)}`;
    case 'CycleFinished': return `Fin ciclo ${e.cycle}`;
    case 'SessionFinished': return 'Sesión finalizada';
    default: return '';
  }
}

function toggleWorkout() {
  if (!engine || engine.isFinished) return;
  if (engine.isRunning) engine.pause(); else engine.resume();
  renderWorkout(true);
}

function stopWorkout() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  if (engine) { try { engine.stop(); } catch {} }
  engine = null;
  coach.stopAll();
  releaseWakeLock();
  showView('setup');
  renderSetup();
}

function tick() {
  if (!engine) return;
  const events = engine.tick();
  for (const ev of events) handleEngineEvent(ev);
  if (engine.isFinished) {
    if (timerId) { clearInterval(timerId); timerId = null; }
    releaseWakeLock();
  }
}

function handleEngineEvent(ev) {
  if (resyncing) return;
  if (ev.type === 'Countdown') {
    if (settings.soundEnabled && settings.countdownBeeps) Beeps.countdown(settings.volume);
  } else if (ev.type === 'HalfTime') {
    if (settings.soundEnabled) Beeps.halfway(settings.volume);
    maybeVibrate();
  } else if (ev.type === 'SegmentChanged') {
    const seg = ev.segment;
    if (settings.soundEnabled) {
      if (seg.type === PhaseType.WORK && settings.startTone) Beeps.workStart(settings.volume);
      else if (seg.type === PhaseType.REST || seg.type === PhaseType.REST_BETWEEN_CYCLES) Beeps.restStart(settings.volume);
    }
    maybeVibrate();
    triggerPhaseAnim();
  } else if (ev.type === 'Finished') {
    if (settings.soundEnabled) Beeps.finished(settings.volume);
    maybeVibrate();
  }
}

function triggerPhaseAnim() {
  const ph = $('#wkPhase');
  ph.classList.remove('enter'); void ph.offsetWidth; ph.classList.add('enter');
  const rw = $('#ringWrap');
  rw.classList.remove('pulse-ring'); void rw.offsetWidth; rw.classList.add('pulse-ring');
}

function maybeVibrate() {
  if (resyncing) return;
  if (settings.vibration && navigator.vibrate) { try { navigator.vibrate(120); } catch {} }
}

function renderWorkout(phaseAnim) {
  if (!engine) return;
  const seg = engine.currentSegment;
  const root = $('#workoutRoot');
  const phaseType = engine.isFinished ? 'FINISHED' : (seg ? seg.type : 'FINISHED');
  const phaseKey = `${engine.index}:${phaseType}:${engine.isFinished}`;
  if (phaseKey !== lastPhaseKey) {
    const changed = lastPhaseKey !== null;
    lastPhaseKey = phaseKey;
    if (changed || phaseAnim) triggerPhaseAnim();
  }
  root.className = `workout phase-${phaseType}`;
  $('#wkPhase').textContent = PHASE_LABEL[phaseType] || phaseType;

  const remSec = Math.max(0, Math.ceil(engine.remainingMs() / 1000));
  const timeStr = (engine.totalMs >= 3600000 || remSec >= 3600) ? formatClock(remSec) : formatMinSec(remSec);
  $('#wkTime').textContent = engine.isFinished ? '00:00' : timeStr;

  // pulse on each of 3,2,1
  if (engine.isRunning && !engine.isFinished && remSec >= 1 && remSec <= 3) {
    if (remSec !== lastSecond) {
      lastSecond = remSec;
      const t = $('#wkTime');
      t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse');
    }
  } else {
    if (remSec !== lastSecond) { lastSecond = remSec; $('#wkTime').classList.remove('pulse'); }
  }

  if (engine.isFinished) {
    $('#wkCounter').textContent = '¡Buen trabajo!';
    $('#wkNext').textContent = '';
  } else if (seg) {
    if (seg.type === PhaseType.PREPARATION) {
      $('#wkCounter').textContent = `${seg.totalCycles} ciclo${seg.totalCycles !== 1 ? 's' : ''} · ${seg.totalRounds} rondas`;
    } else {
      $('#wkCounter').textContent = `Ciclo ${seg.cycle}/${seg.totalCycles} · Ronda ${seg.round}/${seg.totalRounds}`;
    }
    const next = engine.segments[engine.index + 1];
    $('#wkNext').textContent = next ? `Siguiente: ${PHASE_LABEL[next.type] || next.type}` : '';
  }

  $('#wkLog').textContent = logLines.slice(-2).join(' · ');

  const prog = engine.isFinished ? 1 : engine.progress();
  $('#wkRing').style.strokeDasharray = String(RING_CIRC);
  $('#wkRing').style.strokeDashoffset = String(RING_CIRC * (1 - Math.max(0, Math.min(1, prog))));

  const running = engine.isRunning && !engine.isFinished;
  $('#txtToggle').textContent = running ? 'Pausar' : 'Reanudar';
  $('#icToggle').innerHTML = running ? IC_PAUSE : IC_PLAY;
  $('#btnToggle').disabled = engine.isFinished;
  $('#btnSkip').disabled = engine.isFinished;
}

// ---- Visibility/resume ----
function resyncFromBackground() {
  if (!engine) return;
  const beforeKey = `${engine.index}:${engine.currentSegment ? engine.currentSegment.type : 'NONE'}:${engine.isFinished}`;
  resyncing = true;
  try {
    coach.clearQueueKeepCurrent();
    tick();
  } finally {
    resyncing = false;
  }
  renderWorkout(true);
  if (!engine || engine.isFinished) {
    releaseWakeLock();
    return;
  }
  const seg = engine.currentSegment;
  const afterKey = `${engine.index}:${seg ? seg.type : 'NONE'}:${engine.isFinished}`;
  if (afterKey !== beforeKey && seg && settings.voiceEnabled) {
    if (seg.type === PhaseType.WORK) coach.playEvent('WorkStarted');
    else if (seg.type === PhaseType.REST || seg.type === PhaseType.REST_BETWEEN_CYCLES) coach.playEvent('RestStarted');
  }
  if (settings.keepScreenOn) requestWakeLock(true);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resyncFromBackground(); });
window.addEventListener('pageshow', () => resyncFromBackground());
setupWakeLockAutoReacquire(() => !!engine && !engine.isFinished && settings.keepScreenOn);

// ---- SW ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {}); });
}

// ---- init ----
bindSettings();
renderSetup();
showView('setup');
showTab('training');
