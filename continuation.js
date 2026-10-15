// Keep the author’s GPS-free mode when entering from the landing page.
if (new URLSearchParams(location.search).get('dev') === '1') {
  document.querySelector('#start-last-challenge').href = './expedition/?dev=1';
}
