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
    briefing: {
      speaker: 'Esquie',
      text: "Afin de trouver ce que tu cherches, j'ai laissé quatre indices que tu devras retrouver et assembler.",
      replySpeaker: 'Roxane',
      choice: "C'est parti !",
    },
  },
  steps: [
    {
      id: 'statue-prisonnier',
      kind: 'quest',
      title: 'Le premier indice',
      image: './scenes/intro_still.png',
      imageAlt: 'Esquie te guide vers le premier indice.',
      instruction: "Proche de toi, se trouve la statue d'un prisonnier, entouré d'un parterre de fleurs.",
      prompt: "De quand date l'arrivée de la statue dans la ville (en chiffres romains) ?",
      answers: ['MCMXXV'],
      successMessage: 'Bravo ! Tu as trouvé le premier indice.',
      errorMessage: 'Mauvaise réponse, tu veux un indice ?',
      hintMode: 'on-request',
      hint: '1900 vaut MCM',
      destination: {
        latitude: 46.39685537641124,
        longitude: 6.923038051324952,
        radiusMeters: 10,
      },
      requireArrival: false,
      distanceLabel: 'De la statue',
    },
  ],
};
