export function normalizeAnswer(value, { ignorePunctuation = false } = {}) {
  const normalized = String(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/\s/gu, '').toLocaleLowerCase('fr');
  return ignorePunctuation ? normalized.replace(/\p{P}/gu, '') : normalized;
}

export function acceptsAnswer(value, answers, options) {
  const normalized = normalizeAnswer(value, options);
  return normalized.length > 0 && answers.some(answer => normalizeAnswer(answer, options) === normalized);
}

export function distanceMeters(from, to) {
  const radians = degrees => degrees * Math.PI / 180;
  const latDelta = radians(to.latitude - from.latitude);
  const lonDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(from.latitude)) *
    Math.cos(radians(to.latitude)) * Math.sin(lonDelta / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function isAtDestination(position, destination) {
  return distanceMeters(position, destination) <= destination.radiusMeters;
}

export function initialProgress() {
  return { phase: 'welcome', stepIndex: 0, arrived: false };
}

export function isValidProgress(progress, steps) {
  if (!progress || !Number.isInteger(progress.stepIndex) || typeof progress.arrived !== 'boolean') return false;
  if (['welcome', 'intro-a', 'intro-dialogue', 'intro-b', 'intro-briefing'].includes(progress.phase)) return progress.stepIndex === 0;
  if (progress.phase === 'complete') return progress.stepIndex === steps.length;
  const step = steps[progress.stepIndex];
  if (!step) return false;
  if (progress.phase === 'travel') return true;
  if (progress.phase === 'quest-video') return step.kind === 'quest' && progress.arrived && Boolean(step.video);
  if (progress.phase === 'quest-success') return step.kind === 'quest' && progress.arrived && Boolean(step.successMessage);
  return ['final-a', 'final-dialogue', 'final-b'].includes(progress.phase) && step.kind === 'finale' && progress.arrived;
}

export function validateGame(config) {
  const errors = [];
  if (!config.id || !config.intro?.firstVideo || !config.intro?.secondVideo || !config.intro?.image || !config.intro?.choice) errors.push('Introduction incomplète.');
  if (config.start && !validDestination(config.start)) errors.push('Coordonnées ou rayon du point de départ invalides.');
  if (!Array.isArray(config.steps)) return [...errors, 'La liste des étapes est invalide.'];
  const ids = new Set();
  for (const [index, step] of config.steps.entries()) {
    if (!step.id || ids.has(step.id)) errors.push(`Étape ${index + 1} : identifiant absent ou dupliqué.`);
    ids.add(step.id);
    if (!step.title || !step.image || !step.instruction) errors.push(`Étape ${index + 1} : titre, image ou instruction manquants.`);
    const d = step.destination;
    if (!validDestination(d)) errors.push(`Étape ${index + 1} : coordonnées ou rayon invalides.`);
    if (step.kind === 'quest') {
      if (!Array.isArray(step.answers) || !step.answers.length || step.answers.some(a => typeof a !== 'string' || !normalizeAnswer(a)) || (!step.video && !step.successMessage) || !step.hint) errors.push(`Étape ${index + 1} : réponses, message de réussite ou indice manquants.`);
    } else if (step.kind === 'finale') {
      if (index !== config.steps.length - 1 || !step.firstVideo || !step.secondVideo || !step.choice) errors.push('Le final doit être la dernière étape et contenir deux vidéos et un dialogue.');
    } else errors.push(`Étape ${index + 1} : type inconnu.`);
  }
  return errors;
}

function validDestination(d) {
  return d && Number.isFinite(d.latitude) && Math.abs(d.latitude) <= 90 &&
    Number.isFinite(d.longitude) && Math.abs(d.longitude) <= 180 &&
    Number.isFinite(d.radiusMeters) && d.radiusMeters > 0;
}
