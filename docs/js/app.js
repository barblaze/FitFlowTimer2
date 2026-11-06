import { Mode, preset, normalizeConfig, totalSeconds, PhaseType } from './core/model.js';
import { buildSegments } from './core/planner.js';
import { TimerEngine } from './core/engine.js';
import { formatMinSec, formatClock, splitSeconds, toSeconds, formatDurationLabel } from './core/format.js';
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
let lastSecondPulse = -1;
let logLines = [];
let resyncing = false;

const coach = new CoachVoice();
applyCoachSettings();

function applyCoachSettings() {
  coach.setStyle(settings.coachStyle);
  coach.setVolume(settings.coachVoiceVolume);
  coach.setEnabled(settings.voiceEnabled);
}

// ---- Tabs / views ----
$('#tabTraining').addEventListener('click', () => showTab('training'));
$('#tabSettings').addEventListener('click', () => showTab('settings'));
function showTab(which) {
  const t = which === 'training';
  $('#tabTraining').classList.toggle('active', t);
  $('#tabSettings').classList.toggle('active', !t);
  $('#panelTraining').classList.toggle('hidden', !t);
  $('#panelSettings').classList.toggle('hidden', t);
}

function showView(name) {
  $('#viewSetup').classList.toggle('hidden', name !== 'setup');
  $('#viewWorkout').classList.toggle('hidden', name !== 'workout');
  document.querySelector('.tabs').classList.toggle('hidden', name === 'workout');
}

// ---- Mode selection ----
$$('.mode-btn').forEach((btn) => btn.addEventListener('click', () => {
  const mode = btn.dataset.mode;
  config = loadProfile(mode);
  renderSetup();
}));

function setActiveMode() {
  $$('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === config.mode));
}

// ---- Steppers / editor ----
$$('[data-step]').forEach((btn) => btn.addEventListener('click', () => {
  const [field, deltaStr] = btn.dataset.step.split(':');
  const delta = parseInt(deltaStr, 10);
  applyDelta(field, delta);
}));

function applyDelta(field, delta) {
  const limits = {
    prep: [0, 600], work: [1, 3600], rest: [0, 600], restCycles: [0, 600], rounds: [1, 99], cycles: [1, 99],
  };
  const map = { prep: 'prepSeconds', work: 'workSeconds', rest: 'restSeconds', restCycles: 'restBetweenCyclesSeconds', rounds: 'rounds', cycles: 'cycles' };
  const key = map[field];
  const [min, max] = limits[field];
  config = normalizeConfig({ ...config, [key]: (config[key] || 0) + delta });
  config[key] = Math.max(min, Math.min(max, config[key]));
  if (field === 'work' && config.workSeconds < 1) config.workSeconds = 1;
  config = saveConfig(config);
  renderSetup();
}

$$('[data-edit]').forEach((btn) => btn.addEventListener('click', () => openTimeDialog(btn.dataset.edit)));

function openTimeDialog(field) {
  const map = { prep: ['prepSeconds', 'Preparación', 0, 600], work: ['workSeconds', 'Trabajo', 1, 3600], rest: ['restSeconds', 'Descanso', 0, 600], restCycles: ['restBetweenCyclesSeconds', 'Descanso entre ciclos', 0, 600] };
  const [key, title, minS, maxS] = map[field];
  const dlg = $('#timeDialog');
  $('#dlgTitle').textContent = title;
  const { minutes, seconds } = splitSeconds(config[key]);
  $('#dlgMin').value = minutes;
  $('#dlgSec').value = seconds;
  $('#dlgError').textContent = '';
  const updatePreview = () => {
    const s = toSeconds($('#dlgMin').value, $('#dlgSec').value);
    $('#dlgPreview').textContent = formatMinSec(s);
    if (s < minS || s > maxS) $('#dlgError').textContent = `Rango: ${formatMinSec(minS)} a ${formatMinSec(maxS)}`;
    else $('#dlgError').textContent = '';
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
    if (s < minS || s > maxS) { e.preventDefault(); $('#dlgError').textContent = `Rango: ${formatMinSec(minS)} a ${formatMinSec(maxS)}`; return; }
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
  $('#summaryMain').textContent = `Duración total: ${formatDurationLabel(total)}`;
  const parts = [];
  parts.push(`${config.cycles} ciclo${config.cycles !== 1 ? 's' : ''}`);
  parts.push(`${config.rounds} ronda${config.rounds !== 1 ? 's' : ''}`);
  parts.push(`trabajo ${formatMinSec(config.workSeconds)}`);
  if (config.restSeconds > 0 && config.rounds > 1) parts.push(`descanso ${formatMinSec(config.restSeconds)}`);
  $('#summaryDetail').textContent = parts.join(' · ');
  const warn = $('#summaryWarn');
  if (config.cycles > 1 && config.restBetweenCyclesSeconds === 0) {
    warn.textContent = 'Aviso: varios ciclos sin descanso entre ciclos.';
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }
  renderSettings();
  renderCoachBadge();
}

function renderCoachBadge() {
  const b = $('#headerBadge');
  if (settings.voiceEnabled) {
    const s = CoachStyle[settings.coachStyle] || CoachStyle.TRAINER;
    b.textContent = s.label;
    b.classList.remove('hidden');
  } else {
    b.classList.add('hidden');
  }
}

// ---- Settings ----
function bindSettings() {
  const bindCheck = (id, key) => $(id).addEventListener('change', (e) => { settings[key] = e.target.checked; persistSettings(); if (key === 'voiceEnabled') { applyCoachSettings(); renderCoachBadge(); } });
  bindCheck('#setSound', 'soundEnabled');
  bindCheck('#setCountdown', 'countdownBeeps');
  bindCheck('#setStartTone', 'startTone');
  bindCheck('#setWake', 'keepScreenOn');
  bindCheck('#setVibrate', 'vibration');
  bindCheck('#setVoice', 'voiceEnabled');
  $('#setVolume').addEventListener('input', (e) => { settings.volume = (+e.target.value) / 100; $('#setVolumeOut').textContent = `${e.target.value}%`; persistSettings(); });
  $('#setCoachVol').addEventListener('input', (e) => { settings.coachVoiceVolume = (+e.target.value) / 100; $('#setCoachVolOut').textContent = `${e.target.value}%`; persistSettings(); applyCoachSettings(); });
  $('#setCoachStyle').addEventListener('change', (e) => { settings.coachStyle = e.target.value; persistSettings(); applyCoachSettings(); renderCoachBadge(); });
  $('#testBeepBtn').addEventListener('click', async () => { await unlockAudio(); Beeps.test(settings.volume); });
  $('#testVoiceBtn').addEventListener('click', async () => { await unlockAudio(); await coach.unlock(); coach.playTest(settings.coachStyle); });
  // Hide vibration toggle if unsupported
  if (!('vibrate' in navigator)) $('#rowVibrate').classList.add('hidden');
  // Background hint useful on mobile generally
  $('#iosHint').classList.remove('hidden');
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
$('#btnSkip').addEventListener('click', () => { if (engine) { engine.skip(); tick(true); renderWorkout(); } });
$('#btnStop').addEventListener('click', stopWorkout);

async function startWorkout() {
  config = saveConfig(config);
  settings = saveSettings(settings);
  applyCoachSettings();
  logLines = [];
  lastPhaseKey = null;
  lastSecondPulse = -1;
  await unlockAudio();
  await coach.unlock();
  if (settings.keepScreenOn) await requestWakeLock(true);
  engine = new TimerEngine(config, () => Date.now(), onAnnounce);
  engine.start();
  showView('workout');
  renderWorkout();
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => tick(false), 100);
  tick(true);
}

function onAnnounce(event) {
  if (!event) return;
  // Log always (state context)
  const msg = announceLabel(event);
  if (msg) { logLines.push(msg); if (logLines.length > 8) logLines.shift(); }
  if (resyncing) return;
  // Voice
  if (settings.voiceEnabled) coach.playEvent(event.type);
}

function announceLabel(e) {
  switch (e.type) {
    case 'SessionStarting': return 'Comienza la sesión';
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
  if (engine.isRunning) { engine.pause(); }
  else { engine.resume(); }
  renderWorkout();
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

function tick(forceRender) {
  if (!engine) return;
  const events = engine.tick();
  for (const ev of events) handleEngineEvent(ev);
  // detect phase change (e.g., skip) for UI state key
  const seg = engine.currentSegment;
  if (seg) {
    const key = `${engine.index}:${seg.type}`;
    if (key !== lastPhaseKey) {
      lastPhaseKey = key;
    }
  }
  if (engine.isFinished) {
    renderWorkout();
    if (timerId) { clearInterval(timerId); timerId = null; }
    releaseWakeLock();
    return;
  }
  if (forceRender !== false) renderWorkout();
}

function handleEngineEvent(ev) {
  if (resyncing) return; // don't blast audio for missed time
  if (!settings.soundEnabled) return;
  if (ev.type === 'Countdown' && settings.countdownBeeps) Beeps.countdown(settings.volume);
  else if (ev.type === 'HalfTime') Beeps.halfway(settings.volume);
  else if (ev.type === 'SegmentChanged') {
    const seg = ev.segment;
    if (seg.type === PhaseType.WORK && settings.startTone) Beeps.workStart(settings.volume);
    else if (seg.type === PhaseType.REST || seg.type === PhaseType.REST_BETWEEN_CYCLES) Beeps.restStart(settings.volume);
    maybeVibrate();
  } else if (ev.type === 'Finished') {
    Beeps.finished(settings.volume);
    maybeVibrate();
  }
}

function maybeVibrate() {
  if (resyncing) return;
  if (settings.vibration && navigator.vibrate) { try { navigator.vibrate(120); } catch {} }
}

const PHASE_LABEL = {
  PREPARATION: 'PREPARACIÓN',
  WORK: 'TRABAJO',
  REST: 'DESCANSO',
  REST_BETWEEN_CYCLES: 'DESCANSO ENTRE CICLOS',
  FINISHED: 'FINALIZADO',
};

function renderWorkout() {
  if (!engine) return;
  const seg = engine.currentSegment;
  const root = $('#workoutRoot');
  const phaseType = engine.isFinished ? 'FINISHED' : (seg ? seg.type : 'FINISHED');
  root.className = `workout phase-${phaseType}`;
  $('#wkPhase').textContent = PHASE_LABEL[phaseType] || phaseType;
  const remSec = Math.ceil(engine.remainingMs() / 1000);
  $('#wkTime').textContent = formatClock(remSec);
  // pulse in last 3 seconds
  const pulse = engine.isRunning && remSec >= 1 && remSec <= 3 && !engine.isFinished;
  const t = $('#wkTime');
  if (pulse && remSec !== lastSecondPulse) { lastSecondPulse = remSec; t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse'); }
  if (!pulse) { lastSecondPulse = -1; t.classList.remove('pulse'); }

  if (engine.isFinished) {
    $('#wkCounter').textContent = '¡Buen trabajo!';
    $('#wkNext').textContent = '';
  } else if (seg) {
    if (seg.type === PhaseType.PREPARATION) $('#wkCounter').textContent = `Preparación · ${seg.totalCycles} ciclo${seg.totalCycles !== 1 ? 's' : ''} · ${seg.totalRounds} rondas`;
    else $('#wkCounter').textContent = `Ciclo ${seg.cycle}/${seg.totalCycles} · Ronda ${seg.round}/${seg.totalRounds}`;
    const next = engine.segments[engine.index + 1];
    $('#wkNext').textContent = next ? `Siguiente: ${PHASE_LABEL[next.type] || next.type}` : '';
  }
  $('#wkLog').textContent = logLines.slice(-2).join(' · ');

  const circ = 2 * Math.PI * 96;
  const prog = engine.isFinished ? 1 : engine.progress();
  $('#wkRing').style.strokeDasharray = String(circ);
  $('#wkRing').style.strokeDashoffset = String(circ * (1 - prog));

  $('#btnToggle').textContent = engine.isRunning ? 'Pausar' : 'Reanudar';
  $('#btnToggle').disabled = engine.isFinished;
  $('#btnSkip').disabled = engine.isFinished;
}

// ---- Visibility/resume (Firefox: recalc from timestamps) ----
function resyncFromBackground() {
  if (!engine) return;
  resyncing = true;
  try {
    coach.clearQueueKeepCurrent();
    tick(true); // advances engine by real elapsed time; announcements suppressed by resyncing
  } finally {
    resyncing = false;
  }
  // Announce current phase once, quietly helpful, no burst.
  if (engine && !engine.isFinished && engine.currentSegment && settings.voiceEnabled) {
    const seg = engine.currentSegment;
    if (seg.type === PhaseType.WORK) coach.playEvent('WorkStarted');
    else if (seg.type === PhaseType.REST || seg.type === PhaseType.REST_BETWEEN_CYCLES) coach.playEvent('RestStarted');
  }
  renderWorkout();
  if (settings.keepScreenOn) requestWakeLock(true);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') resyncFromBackground();
});
window.addEventListener('pageshow', () => resyncFromBackground());

// ---- Wake lock reacquire ----
setupWakeLockAutoReacquire(() => !!engine && !engine.isFinished && settings.keepScreenOn);

// ---- SW registration ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ---- init ----
bindSettings();
renderSetup();
showView('setup');
showTab('training');
