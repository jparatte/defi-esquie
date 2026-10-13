import { continuation } from './continuation-config.js?v=2';
import { phraseMatches, grantAccess } from './continuation-access.js';

const openButton = document.querySelector('#start-last-challenge');
const form = document.querySelector('#continuation-form');
const input = document.querySelector('#continuation-password');
const feedback = document.querySelector('#continuation-feedback');
const submit = document.querySelector('#continuation-submit');

openButton.addEventListener('click', () => {
  form.hidden = !form.hidden;
  openButton.setAttribute('aria-expanded', String(!form.hidden));
  if (!form.hidden) input.focus();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!continuation.passwordHash) {
    feedback.textContent = 'Le dernier défi se prépare. Reviens au moment du rendez-vous.';
    return;
  }
  submit.disabled = true;
  try {
    if (!await phraseMatches(input.value, continuation.passwordHash)) {
      feedback.textContent = 'Ce n’est pas le bon mot de passe. Esquie te le donnera au bon moment.';
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    if (!grantAccess(sessionStorage, continuation.passwordHash)) {
      feedback.textContent = 'Ton navigateur ne peut pas garder l’accès ouvert. Autorise le stockage du site, puis réessaie.';
      return;
    }
    location.assign(new URLSearchParams(location.search).get('dev') === '1' ? './expedition/?dev=1' : './expedition/');
  } catch {
    feedback.textContent = 'Impossible d’ouvrir le défi pour le moment. Réessaie depuis l’adresse HTTPS du site.';
  } finally { submit.disabled = false; }
});

input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); feedback.textContent = ''; });
