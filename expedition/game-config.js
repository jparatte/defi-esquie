// All paths are relative: this also works under a GitHub Pages repository URL.
export const game = {
  // Fresh save for the GPS-gated field test; the previous intro save stays intact.
  id: 'roxane-expedition-v2',
  title: 'L’expédition de Roxane',
  start: {
    latitude: 46.39684880936414,
    longitude: 6.922843310544531,
    radiusMeters: 10,
  },
  intro: {
    title: 'Une rencontre avec Esquie',
    image: './scenes/intro_still.png',
    firstVideo: './scenes/intro_a.mp4',
    secondVideo: './scenes/intro_b.mp4',
    speaker: 'Roxane',
    choice: 'Mais je dois chercher quoi exactement ?',
  },
  // Add your real steps here. See README.md for complete quest/finale examples.
  // Until then, the supplied intro ends with an “À suivre” screen.
  steps: [],
};
