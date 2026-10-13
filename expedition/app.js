import { game as configuredGame } from './game-config.js?v=5';
import { acceptsAnswer, distanceMeters, isAtDestination, initialProgress, isValidProgress, validateGame } from './game-core.js?v=5';

const app = document.querySelector('#app');
const params = new URLSearchParams(location.search);
const isDevelopment = params.get('dev') === '1';
const preview = params.get('preview');
const usesSample = ['dialogue', 'quest', 'finale'].includes(preview);
const isPreview = usesSample || ['briefing', 'step1', 'step2'].includes(preview);
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
const game = usesSample ? { ...configuredGame, steps: preview === 'dialogue' ? [] : [sampleStep] } : configuredGame;
const storageKey = `${game.id}${isDevelopment ? ':development' : ''}:progress`;
let storageAvailable = true;
let progress = restoreProgress();
let replaying = false;
let muted = false;
let watchId = null;
let trackingGeneration = 0;
let trackingRequested = false;
let distance = null;
let accuracy = null;
let locationMessage = 'Laisse Esquie te guider.';

function escape(text) {
  return String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function restoreProgress() {
  if (isPreview) return { phase: preview === 'dialogue' ? 'intro-dialogue' : preview === 'briefing' ? 'intro-briefing' : 'travel', stepIndex: preview === 'step2' ? 1 : 0, arrived: false };
  let raw;
  try {
    raw = localStorage.getItem(storageKey);
  } catch { storageAvailable = false; return initialProgress(); }
  try {
    const saved = JSON.parse(raw);
    // Continue from the former end when new steps are appended to the story.
    if (saved?.phase === 'complete' && Number.isInteger(saved.stepIndex) && saved.stepIndex > 0 && saved.stepIndex < game.steps.length && typeof saved.arrived === 'boolean') {
      return { phase: 'travel', stepIndex: saved.stepIndex, arrived: false };
    }
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
  const index = ['intro-b', 'intro-briefing'].includes(progress.phase) ? 0 : progress.stepIndex + 1;
  distance = accuracy = null;
  locationMessage = 'Laisse Esquie te guider.';
  transition(index < game.steps.length ? 'travel' : 'complete', { stepIndex: index, arrived: false });
}

function currentStep() { return game.steps[progress.stepIndex]; }
function isStarting() { return !isDevelopment && progress.phase === 'welcome' && Boolean(game.start); }
function needsLocation() { return !isDevelopment && (isStarting() || (progress.phase === 'travel' && Boolean(currentStep()?.destination))); }
function arrivalRequired() { return isStarting() || currentStep()?.requireArrival !== false; }
function hasFinale() { return game.steps.at(-1)?.kind === 'finale'; }
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
    case 'welcome': return `<p class="eyebrow">Prologue</p><h1>Une rencontre<br>avec Esquie</h1><p class="panel-copy">${isStarting() ? 'Retrouve Esquie au point de départ.' : 'Roxane, ton expédition commence ici.'}</p>${isStarting() ? '<div id="location-area"></div><div id="start-area"></div>' : `<div class="dialogue-frame">${button('Commencer l’expédition', 'begin')}</div><p class="panel-note">Installe-toi un instant et active le son.</p>`}`;
    case 'intro-dialogue': return dialogPanel(game.intro.speaker, game.intro.choice);
    case 'intro-briefing': return `<p class="eyebrow">Dialogue</p><h1 class="speaker">${escape(game.intro.briefing.speaker)} :</h1><p class="panel-copy">${escape(game.intro.briefing.text)}</p><h2 class="speaker">${escape(game.intro.briefing.replySpeaker)} :</h2><div class="dialogue-frame">${button(game.intro.briefing.choice, 'briefing-choice')}</div>`;
    case 'final-dialogue': return dialogPanel(currentStep().speaker || 'Roxane', currentStep().choice);
    case 'quest-success': return `<p class="eyebrow">Indice retrouvé</p><h1 class="speaker">Esquie :</h1><p class="panel-copy">${escape(currentStep().successMessage)}</p><div class="dialogue-frame">${button('Continuer', 'success-continue')}</div>`;
    case 'travel': {
      const dialogueReady = currentStep().dialogue && (isDevelopment || progress.arrived || !arrivalRequired());
      return `<p class="eyebrow">${currentStep().kind === 'finale' ? 'Dernière destination' : dialogueReady ? 'Dialogue' : 'En chemin'}</p><h1>${escape(currentStep().title)}</h1>${dialogueReady ? '' : `<p class="panel-copy instruction">${escape(currentStep().instruction)}</p>`}
        <div id="location-area"></div><div id="answer-area"></div>`;
    }
    case 'complete': return `<p class="eyebrow">${hasFinale() ? 'Épilogue' : 'À suivre'}</p><h1>${hasFinale() ? 'L’expédition s’achève.' : 'À suivre…'}</h1><p class="panel-copy">${hasFinale() ? 'Tu es arrivée au bout du voyage, Roxane.' : 'La prochaine rencontre t’attend.'}</p><div class="end-ornament" aria-hidden="true">✧</div>`;
  }
}

function render() {
  stopTracking();
  const chapter = isIntro() ? 'Prologue' : progress.phase === 'complete' ? (hasFinale() ? 'Épilogue' : 'À suivre') : `Étape ${String(progress.stepIndex + 1).padStart(2, '0')}`;
  const title = isIntro() ? game.intro.title : currentStep()?.title || (hasFinale() ? 'Le bout du voyage' : 'La suite du voyage');
  app.innerHTML = `${isDevelopment ? '<div class="preview-bar">Développement · GPS désactivé <a href="./">Mode normal</a></div><nav class="dev-links" aria-label="Raccourcis de test"><a href="?dev=1&preview=briefing">Après l’intro</a><a href="?dev=1&preview=step1">Étape 1</a><a href="?dev=1&preview=step2">Étape 2</a></nav>' : isPreview ? '<div class="preview-bar">Aperçu · aucune progression enregistrée <a href="./">Quitter</a></div>' : ''}
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
  document.querySelector('#dialogue-choice')?.addEventListener('click', () => transition(progress.phase === 'intro-dialogue' ? 'intro-b' : 'final-b'));
  document.querySelector('#briefing-choice')?.addEventListener('click', nextStep);
  document.querySelector('#success-continue')?.addEventListener('click', () => currentStep().video ? transition('quest-video') : nextStep());
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
  if (isStarting()) renderWelcome();
  if (progress.phase === 'travel') renderTravel();
  document.querySelector('#begin')?.addEventListener('click', () => {
    if (game.start && !isDevelopment && !progress.arrived) return;
    transition('intro-a', { arrived: false });
  });
  if (needsLocation() && trackingRequested && !isPreview && (!progress.arrived || !arrivalRequired())) startTracking();
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
    else if (progress.phase === 'intro-b' && game.intro.briefing) transition('intro-briefing');
    else nextStep();
  });
  play();
}

function renderWelcome() {
  updateLocationUI();
  document.querySelector('#start-area').innerHTML = progress.arrived
    ? `<div class="dialogue-frame">${button('Commencer l’expédition', 'begin')}</div><p class="panel-note">Installe-toi un instant et active le son.</p>`
    : '<p class="locked-note"><span aria-hidden="true">◇</span> L’expédition débutera à ton arrivée.</p>';
}

function renderTravel() {
  if (!isDevelopment && currentStep().destination) updateLocationUI();
  const area = document.querySelector('#answer-area');
  if (!isDevelopment && arrivalRequired() && !currentStep().destination) {
    document.querySelector('#location-area').innerHTML = '<p class="panel-note">La prochaine rencontre se prépare.</p>';
    area.innerHTML = '<p class="locked-note">Le point de rendez-vous sera bientôt dévoilé.</p>';
    return;
  }
  if (!isDevelopment && arrivalRequired() && !progress.arrived) {
    area.innerHTML = '<p class="locked-note"><span aria-hidden="true">◇</span> Le dialogue se dévoilera à ton arrivée.</p>';
    return;
  }
  if (currentStep().kind === 'finale') { transition('final-a', { arrived: true }); return; }
  const dialogue = currentStep().dialogue;
  const dialogueContent = dialogue ? `<div class="quest-dialogue"><h2 class="speaker">${escape(dialogue.speaker || 'Esquie')} :</h2><p class="panel-copy">${escape(dialogue.text)}</p>${dialogue.quote ? `<figure class="quest-quote"><blockquote>${escape(dialogue.quote)}</blockquote><figcaption>${escape(dialogue.attribution)}</figcaption></figure>` : ''}</div>` : '';
  area.innerHTML = `${dialogueContent}<form id="answer-form" class="answer-form"><label for="answer" class="speaker">Roxane<span class="speaker-colon">:</span></label><div class="answer-frame"><label class="answer-prompt" for="answer">${escape(currentStep().prompt || 'Qu’as-tu découvert ?')}</label><input id="answer" name="answer" type="text" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="go" placeholder="Ta réponse…" required aria-describedby="answer-feedback quest-hint"><button class="answer-submit" aria-label="Valider ma réponse" type="submit">↗</button></div><p id="answer-feedback" class="feedback" role="status" aria-live="polite"></p><div id="hint-actions" class="hint-actions" hidden>${button('Oui', 'show-hint', true)}${button('Non', 'decline-hint', true)}</div><p id="quest-hint" class="feedback" role="status" aria-live="polite" hidden></p></form>`;
  document.querySelector('#answer-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = document.querySelector('#answer');
    if (acceptsAnswer(input.value, currentStep().answers, currentStep().answerOptions)) transition(currentStep().successMessage ? 'quest-success' : 'quest-video', { arrived: true });
    else {
      const requestHint = currentStep().hintMode === 'on-request';
      document.querySelector('#answer-feedback').textContent = requestHint ? currentStep().errorMessage || 'Mauvaise réponse, tu veux un indice ?' : `Pas tout à fait… ${currentStep().hint}`;
      document.querySelector('#hint-actions').hidden = !requestHint;
      document.querySelector('#quest-hint').hidden = true;
      input.setAttribute('aria-invalid', 'true');
    }
  });
  document.querySelector('#show-hint').addEventListener('click', () => {
    document.querySelector('#hint-actions').hidden = true;
    const hint = document.querySelector('#quest-hint');
    hint.textContent = currentStep().hint; hint.hidden = false;
  });
  document.querySelector('#decline-hint').addEventListener('click', () => {
    document.querySelector('#hint-actions').hidden = true;
    document.querySelector('#answer-feedback').textContent = '';
    document.querySelector('#answer').focus();
  });
  document.querySelector('#answer').addEventListener('input', event => event.target.removeAttribute('aria-invalid'));
}

function updateLocationUI() {
  const area = document.querySelector('#location-area');
  if (!area) return;
  const proximity = distance === null ? 'Position en attente' : distance < 1000 ? `À ${Math.round(distance)} m` : `À ${(distance / 1000).toFixed(1).replace('.', ',')} km`;
  const reached = progress.arrived && arrivalRequired();
  area.innerHTML = `<div class="distance-hud"><span class="hud-diamond" aria-hidden="true">✧</span><div><strong>${reached ? 'Tu es arrivée' : proximity}</strong><p>${reached ? (isStarting() ? 'Esquie t’attend ici.' : 'La piste est à portée de main.') : escape(locationMessage)}</p>${accuracy !== null && !reached ? `<small>Précision GPS : ± ${Math.round(accuracy)} m</small>` : ''}</div></div>
    ${!reached && (isPreview || watchId === null) ? button(isPreview ? 'Simuler l’arrivée' : 'Activer la localisation', 'locate', true) : ''}`;
  document.querySelector('#locate')?.addEventListener('click', () => {
    if (isPreview) { transition(progress.phase, { arrived: true }); return; }
    trackingRequested = true; startTracking();
  });
}

function startTracking() {
  if (watchId !== null || !needsLocation() || (progress.arrived && arrivalRequired()) || document.hidden) return;
  if (!navigator.geolocation || !window.isSecureContext) {
    locationMessage = 'La localisation est indisponible dans ce navigateur.'; updateLocationUI(); return;
  }
  locationMessage = 'À la recherche de ta position…';
  const generation = trackingGeneration;
  watchId = navigator.geolocation.watchPosition(position => {
    if (generation !== trackingGeneration || !needsLocation() || (progress.arrived && arrivalRequired())) return;
    if (Date.now() - position.timestamp > 30000) { locationMessage = 'Ta position est ancienne. Recherche en cours…'; updateLocationUI(); return; }
    const destination = isStarting() ? game.start : currentStep().destination;
    distance = distanceMeters(position.coords, destination);
    accuracy = position.coords.accuracy;
    locationMessage = isStarting() ? 'Du point de départ' : currentStep().distanceLabel || 'De ta prochaine rencontre';
    if (arrivalRequired() && isAtDestination(position.coords, destination)) transition(progress.phase, { arrived: true });
    else updateLocationUI();
  }, error => {
    if (generation !== trackingGeneration) return;
    stopTracking();
    locationMessage = error.code === 1 ? 'Autorise la localisation dans ton navigateur pour poursuivre.' : 'Ta position est introuvable. Réessaie dans un instant.';
    updateLocationUI();
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  updateLocationUI();
}

function stopTracking() {
  trackingGeneration++;
  if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
  watchId = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopTracking(); document.querySelector('#scene-video')?.pause(); }
  else if (trackingRequested && !isPreview && needsLocation() && (!progress.arrived || !arrivalRequired())) startTracking();
});

const configErrors = validateGame(game);
if (configErrors.length) {
  app.innerHTML = `<section class="interaction"><h1>L’expédition se prépare.</h1><p>${escape(configErrors.join(' '))}</p></section>`;
} else render();
