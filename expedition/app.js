import { game as configuredGame } from './game-config.js';
import { acceptsAnswer, distanceMeters, isAtDestination, initialProgress, isValidProgress, validateGame } from './game-core.js';

const app = document.querySelector('#app');
const preview = new URLSearchParams(location.search).get('preview');
const isPreview = ['dialogue', 'quest', 'finale'].includes(preview);
const sampleStep = {
  id: 'apercu', kind: preview === 'finale' ? 'finale' : 'quest',
  title: preview === 'finale' ? 'Le dernier rendez-vous' : 'La première piste',
  image: './scenes/intro_still.png', instruction: 'Retrouve le lieu évoqué par Esquie.',
  destination: { latitude: 0, longitude: 0, radiusMeters: 10 },
  answers: ['lumière'], hint: 'Elle éclaire le chemin, même dans l’obscurité.',
  prompt: 'Qu’as-tu découvert ?', video: './scenes/intro_b.mp4',
  firstVideo: './scenes/intro_a.mp4', secondVideo: './scenes/intro_b.mp4',
  speaker: 'Roxane', choice: 'Je suis prête !',
};
const game = isPreview ? { ...configuredGame, steps: preview === 'dialogue' ? [] : [sampleStep] } : configuredGame;
const storageKey = `${game.id}:progress`;
let storageAvailable = true;
let progress = restoreProgress();
let replaying = false;
let muted = false;
let watchId = null;
let trackingRequested = false;
let distance = null;
let accuracy = null;
let locationMessage = 'Laisse Esquie te guider.';

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function restoreProgress() {
  if (isPreview) return { phase: preview === 'dialogue' ? 'intro-dialogue' : 'travel', stepIndex: 0, arrived: false };
  let raw;
  try {
    raw = localStorage.getItem(storageKey);
  } catch { storageAvailable = false; return initialProgress(); }
  try {
    const saved = JSON.parse(raw);
    return isValidProgress(saved, game.steps) ? saved : initialProgress();
  } catch { return initialProgress(); }
}

function saveProgress() {
  if (isPreview) return;
  try { localStorage.setItem(storageKey, JSON.stringify(progress)); }
  catch { storageAvailable = false; }
}

function transition(phase, updates = {}) {
  progress = { ...progress, ...updates, phase };
  replaying = false;
  saveProgress();
  render();
}

function nextStep() {
  const index = progress.phase === 'intro-b' ? 0 : progress.stepIndex + 1;
  distance = accuracy = null;
  locationMessage = 'Laisse Esquie te guider.';
  transition(index < game.steps.length ? 'travel' : 'complete', { stepIndex: index, arrived: false });
}

function currentStep() { return game.steps[progress.stepIndex]; }
function isVideoPhase() { return ['intro-a', 'intro-b', 'quest-video', 'final-a', 'final-b'].includes(progress.phase) || replaying; }
function isIntro() { return progress.phase.startsWith('intro') || progress.phase === 'welcome' || !game.steps.length; }
function imagePath() { return isIntro() ? game.intro.image : currentStep()?.image || game.steps.at(-1)?.image || game.intro.image; }
function videoPath() {
  if (replaying) return progress.phase === 'intro-dialogue' ? game.intro.firstVideo : currentStep().firstVideo;
  return ({ 'intro-a': game.intro.firstVideo, 'intro-b': game.intro.secondVideo,
    'quest-video': currentStep()?.video, 'final-a': currentStep()?.firstVideo, 'final-b': currentStep()?.secondVideo })[progress.phase];
}

function button(text, id, secondary = false) {
  return `<button id="${id}" class="${secondary ? 'quiet-button' : 'choice-button'}" type="button"><span class="choice-star" aria-hidden="true">✦</span><span>${escape(text)}</span><span class="choice-arrow" aria-hidden="true">›</span></button>`;
}

function dialogPanel(speaker, choice) {
  return `<p class="eyebrow">Dialogue</p><h1 class="speaker">${escape(speaker)}<span class="speaker-colon">:</span></h1>
    <div class="dialogue-frame">${button(choice, 'dialogue-choice')}</div>
    <p class="panel-note">Choisis ta réponse pour continuer.</p>${button('Réécouter Esquie', 'replay', true)}`;
}

function panelContent() {
  if (isVideoPhase()) return `<p class="eyebrow">${replaying ? 'Souvenir' : 'Esquie'}</p><h1>Écoute…</h1><p class="panel-copy">Esquie a quelque chose à te dire.</p>
    <div class="playback"><button id="play-toggle" class="playback-button" type="button">Lire la vidéo</button><span id="video-time" class="time">0:00</span></div>
    <div class="video-track" aria-hidden="true"><span id="video-progress"></span></div>
    <p id="media-status" class="panel-note" role="status">La suite apparaîtra à la fin de la vidéo.</p>`;
  switch (progress.phase) {
    case 'welcome': return `<p class="eyebrow">Prologue</p><h1>Une rencontre<br>avec Esquie</h1><p class="panel-copy">Roxane, ton expédition commence ici.</p><div class="dialogue-frame">${button('Commencer l’expédition', 'begin')}</div><p class="panel-note">Installe-toi un instant et active le son.</p>`;
    case 'intro-dialogue': return dialogPanel(game.intro.speaker, game.intro.choice);
    case 'final-dialogue': return dialogPanel(currentStep().speaker || 'Roxane', currentStep().choice);
    case 'travel': return `<p class="eyebrow">${currentStep().kind === 'finale' ? 'Dernière destination' : 'En chemin'}</p><h1>${escape(currentStep().title)}</h1><p class="panel-copy instruction">${escape(currentStep().instruction)}</p>
      <div id="location-area"></div><div id="answer-area"></div>`;
    case 'complete': return `<p class="eyebrow">${game.steps.length ? 'Épilogue' : 'Prologue terminé'}</p><h1>${game.steps.length ? 'L’expédition s’achève.' : 'À suivre…'}</h1><p class="panel-copy">${game.steps.length ? 'Tu es arrivée au bout du voyage, Roxane.' : 'La prochaine rencontre t’attend.'}</p><div class="end-ornament" aria-hidden="true">✧</div>`;
  }
}

function render() {
  stopTracking();
  const chapter = isIntro() ? 'Prologue' : progress.phase === 'complete' ? 'Épilogue' : `Étape ${String(progress.stepIndex + 1).padStart(2, '0')}`;
  const title = isIntro() ? game.intro.title : currentStep()?.title || 'Le bout du voyage';
  app.innerHTML = `${isPreview ? '<div class="preview-bar">Aperçu · aucune progression enregistrée <a href="./">Quitter</a></div>' : ''}
    <section class="scene" aria-label="Scène avec Esquie">
      <img class="scene-image ${isVideoPhase() ? 'video-backdrop' : ''}" src="${escape(imagePath())}" alt="${escape(isIntro() ? 'Esquie t’attend, son masque doré tourné vers toi.' : currentStep()?.imageAlt || 'Illustration de la prochaine rencontre.')}">
      <div class="scene-shade"></div>
      <header class="masthead"><p>${escape(game.title)}</p><button id="sound" class="sound-button" type="button" aria-label="${muted ? 'Activer le son' : 'Couper le son'}" aria-pressed="${muted}">${soundIcon()}</button></header>
      <div class="scene-caption"><span class="chapter">${escape(chapter)}</span><span class="scene-title">${escape(title)}</span></div>
      ${isVideoPhase() ? '<video id="scene-video" playsinline preload="auto" aria-label="Vidéo d’Esquie"></video><button id="video-start" class="video-start" type="button" aria-label="Lire la vidéo"><span aria-hidden="true">▷</span> Écouter Esquie</button>' : ''}
    </section>
    <section class="interaction" aria-label="Dialogue et expédition"><div class="panel-topline" aria-hidden="true"><span></span><i>✦</i><span></span></div>
      <div class="panel-content">${panelContent()}</div>
      <footer class="panel-footer"><div class="journey-mark" aria-hidden="true">${progressMarkers()}</div><button id="restart" class="text-button" type="button">Recommencer</button></footer><div id="restart-confirmation"></div>
      ${!storageAvailable && !isPreview ? '<p class="storage-note" role="status">La sauvegarde est indisponible. Garde cette page ouverte pendant le voyage.</p>' : ''}
    </section>`;
  document.querySelector('#begin')?.addEventListener('click', () => transition('intro-a'));
  document.querySelector('#dialogue-choice')?.addEventListener('click', () => transition(progress.phase === 'intro-dialogue' ? 'intro-b' : 'final-b'));
  document.querySelector('#replay')?.addEventListener('click', () => { replaying = true; render(); });
  document.querySelector('#sound').addEventListener('click', () => {
    muted = !muted;
    const video = document.querySelector('#scene-video');
    if (video) video.muted = muted;
    const sound = document.querySelector('#sound');
    sound.innerHTML = soundIcon();
    sound.setAttribute('aria-label', muted ? 'Activer le son' : 'Couper le son');
    sound.setAttribute('aria-pressed', muted);
  });
  document.querySelector('#restart').addEventListener('click', () => {
    const confirmation = document.querySelector('#restart-confirmation');
    confirmation.innerHTML = '<div class="restart-confirmation"><p>Recommencer l’expédition depuis le début ?</p><div><button id="restart-cancel" class="playback-button" type="button">Annuler</button><button id="restart-accept" class="playback-button" type="button">Oui, recommencer</button></div></div>';
    document.querySelector('#restart-cancel').addEventListener('click', () => {
      confirmation.innerHTML = ''; document.querySelector('#restart').focus();
    });
    document.querySelector('#restart-accept').addEventListener('click', () => {
      trackingRequested = false; distance = accuracy = null;
      transition('welcome', { stepIndex: 0, arrived: false });
    });
    document.querySelector('#restart-cancel').focus();
  });
  if (isVideoPhase()) attachVideo();
  if (progress.phase === 'travel') { renderTravel(); if (trackingRequested && !isPreview && !progress.arrived) startTracking(); }
}

function soundIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${muted ? '<path d="m17 9 5 6m0-6-5 6"/>' : '<path d="M17 8q5 4 0 8M19 5q8 7 0 14"/>'}</svg>`;
}

function progressMarkers() {
  const count = game.steps.length + 1;
  const current = progress.phase === 'complete' ? count : isIntro() ? 0 : progress.stepIndex + 1;
  return Array.from({ length: count }, (_, i) => `<span class="${i <= current ? 'lit' : ''}">◇</span>`).join('<i></i>');
}

function attachVideo() {
  const video = document.querySelector('#scene-video');
  const overlay = document.querySelector('#video-start');
  const toggle = document.querySelector('#play-toggle');
  video.src = videoPath();
  video.muted = muted;
  async function play() {
    if (video.error) video.load();
    try { await video.play(); }
    catch { if (video.isConnected) { overlay.hidden = false; toggle.textContent = 'Lire la vidéo'; } }
  }
  overlay.addEventListener('click', play);
  toggle.addEventListener('click', () => video.paused ? play() : video.pause());
  video.addEventListener('playing', () => { overlay.hidden = true; toggle.textContent = 'Mettre en pause'; document.querySelector('#media-status').textContent = 'La suite apparaîtra à la fin de la vidéo.'; });
  video.addEventListener('pause', () => { if (!video.ended) { overlay.hidden = false; toggle.textContent = 'Reprendre la vidéo'; } });
  video.addEventListener('timeupdate', () => {
    const time = Math.floor(video.currentTime);
    document.querySelector('#video-time').textContent = `${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')}`;
    document.querySelector('#video-progress').style.width = `${video.duration ? video.currentTime / video.duration * 100 : 0}%`;
  });
  video.addEventListener('error', () => {
    document.querySelector('#media-status').textContent = 'La vidéo n’a pas pu être chargée. Vérifie ta connexion, puis réessaie.';
    overlay.hidden = false;
    overlay.textContent = 'Réessayer';
  });
  video.addEventListener('ended', () => {
    if (replaying) { replaying = false; render(); return; }
    if (progress.phase === 'intro-a') transition('intro-dialogue');
    else if (progress.phase === 'final-a') transition('final-dialogue');
    else nextStep();
  });
  play();
}

function renderTravel() {
  updateLocationUI();
  const area = document.querySelector('#answer-area');
  if (!progress.arrived) {
    area.innerHTML = '<p class="locked-note"><span aria-hidden="true">◇</span> Le dialogue se dévoilera à ton arrivée.</p>';
    return;
  }
  if (currentStep().kind === 'finale') { transition('final-a'); return; }
  area.innerHTML = `<form id="answer-form" class="answer-form"><label for="answer" class="speaker">Roxane<span class="speaker-colon">:</span></label><div class="answer-frame"><label class="answer-prompt" for="answer">${escape(currentStep().prompt || 'Qu’as-tu découvert ?')}</label><input id="answer" name="answer" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="go" placeholder="Ta réponse…" required aria-describedby="answer-feedback"><button class="answer-submit" aria-label="Valider ma réponse" type="submit">↗</button></div><p id="answer-feedback" class="feedback" role="status" aria-live="polite"></p></form>`;
  document.querySelector('#answer-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = document.querySelector('#answer');
    if (acceptsAnswer(input.value, currentStep().answers)) transition('quest-video');
    else {
      document.querySelector('#answer-feedback').textContent = `Pas tout à fait… ${currentStep().hint}`;
      input.setAttribute('aria-invalid', 'true');
    }
  });
  document.querySelector('#answer').addEventListener('input', event => event.target.removeAttribute('aria-invalid'));
}

function updateLocationUI() {
  const area = document.querySelector('#location-area');
  if (!area) return;
  const proximity = distance === null ? 'Un peu plus près…' : distance < 1000 ? `À ${Math.round(distance)} m` : `À ${(distance / 1000).toFixed(1).replace('.', ',')} km`;
  area.innerHTML = `<div class="distance-hud"><span class="hud-diamond" aria-hidden="true">✧</span><div><strong>${progress.arrived ? 'Tu es arrivée' : proximity}</strong><p>${progress.arrived ? 'La piste est à portée de main.' : escape(locationMessage)}</p>${accuracy !== null && !progress.arrived ? `<small>Précision GPS : ± ${Math.round(accuracy)} m</small>` : ''}</div></div>
    ${!progress.arrived && (isPreview || watchId === null) ? button(isPreview ? 'Simuler l’arrivée' : 'Activer la localisation', 'locate', true) : ''}`;
  document.querySelector('#locate')?.addEventListener('click', () => {
    if (isPreview) { transition('travel', { arrived: true }); return; }
    trackingRequested = true; startTracking();
  });
}

function startTracking() {
  if (watchId !== null || progress.phase !== 'travel' || progress.arrived || document.hidden) return;
  if (!navigator.geolocation || !window.isSecureContext) {
    locationMessage = 'La localisation est indisponible dans ce navigateur.'; updateLocationUI(); return;
  }
  locationMessage = 'À la recherche de ta position…';
  watchId = navigator.geolocation.watchPosition(position => {
    if (progress.phase !== 'travel' || progress.arrived) return;
    if (Date.now() - position.timestamp > 30000) { locationMessage = 'Ta position est ancienne. Recherche en cours…'; updateLocationUI(); return; }
    const destination = currentStep().destination;
    distance = distanceMeters(position.coords, destination);
    accuracy = position.coords.accuracy;
    locationMessage = 'De ta prochaine rencontre';
    if (isAtDestination(position.coords, destination)) transition('travel', { arrived: true });
    else updateLocationUI();
  }, error => {
    stopTracking();
    locationMessage = error.code === 1 ? 'Autorise la localisation dans ton navigateur pour poursuivre.' : 'Ta position est introuvable. Réessaie dans un instant.';
    updateLocationUI();
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  updateLocationUI();
}

function stopTracking() {
  if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
  watchId = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopTracking(); document.querySelector('#scene-video')?.pause(); }
  else if (trackingRequested && !isPreview && progress.phase === 'travel' && !progress.arrived) startTracking();
});

const configErrors = validateGame(game);
if (configErrors.length) {
  app.innerHTML = `<section class="interaction"><h1>L’expédition se prépare.</h1><p>${escape(configErrors.join(' '))}</p></section>`;
} else render();
