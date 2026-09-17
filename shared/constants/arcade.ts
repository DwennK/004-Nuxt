export const arcadeGames = [
  {
    value: 'wordle',
    label: 'Mot mystère',
    short: 'WORD',
    icon: 'i-lucide-spell-check',
    color: 'success',
    category: 'Mots',
    rhythm: '3 min',
    accent: '#b9f28b',
    description: 'Six essais. Un mot. À toi de lire entre les lettres.',
    rules:
      'Vert : bonne place. Jaune : bonne lettre, autre place. Gris : absente. Une lettre répétée ne compte que le nombre de fois où elle existe dans le mot.',
    controls: ['Clavier ou touches à l’écran', 'Entrée pour valider']
  },
  {
    value: 'higher',
    label: 'Plus ou moins',
    short: '±',
    icon: 'i-lucide-binary',
    color: 'info',
    category: 'Puzzle',
    rhythm: '1 min',
    accent: '#91d8f7',
    description: 'Un nombre se cache entre 1 et 100. Réduis le champ.',
    rules:
      'Tu disposes de huit essais. Chaque réponse resserre l’intervalle possible. Un nombre déjà éliminé ne coûte pas de tentative.',
    controls: ['Saisis un nombre entier', 'Entrée pour valider']
  },
  {
    value: 'tic',
    label: 'Morpion',
    short: 'X/O',
    icon: 'i-lucide-grid-3x3',
    color: 'warning',
    category: 'Stratégie',
    rhythm: '1 min',
    accent: '#f4c67e',
    description: 'Trois symboles alignés. Zéro place pour l’erreur.',
    rules:
      'Tu joues les croix, l’IA les cercles. Aligne trois symboles horizontalement, verticalement ou en diagonale. En mode Expert, l’IA joue sans faute.',
    controls: ['Choisis une case libre', 'Attends le tour de l’IA']
  },
  {
    value: 'aim',
    label: 'Précision',
    short: 'AIM',
    icon: 'i-lucide-crosshair',
    color: 'error',
    category: 'Réflexes',
    rhythm: '30 s',
    accent: '#ff9a89',
    description: 'Quinze cibles. Chaque mouvement compte.',
    rules:
      'Lance le chrono puis touche les quinze cibles, qui rétrécissent progressivement. Les appuis hors cible comptent comme des erreurs. La mesure se fait dès l’appui.',
    controls: ['Souris ou toucher', '15 cibles à atteindre']
  },
  {
    value: 'reflex',
    label: 'Réflexe',
    short: 'MS',
    icon: 'i-lucide-zap',
    color: 'primary',
    category: 'Réflexes',
    rhythm: '10 s',
    accent: '#d5fb70',
    description: 'Le vert s’allume. À quelle vitesse réagis-tu ?',
    rules:
      'Appuie pour lancer une manche. Attends le signal vert, puis appuie immédiatement. Un appui anticipé annule la manche. Compare tes cinq derniers temps.',
    controls: ['Appui souris ou tactile', 'Entrée ou Espace sur la zone']
  },
  {
    value: 'snake',
    label: 'Snake',
    short: 'SNAKE',
    icon: 'i-lucide-route',
    color: 'success',
    category: 'Réflexes',
    rhythm: '3 min',
    accent: '#91e6b0',
    description: 'Prends de la longueur. Garde une sortie.',
    rules:
      'Chaque fruit vaut dix points. La vitesse augmente tous les trois fruits. Évite les murs et ton propre corps. La partie se met en pause si tu quittes la fenêtre.',
    controls: ['Flèches, ZQSD ou WASD', 'Glisser ou pavé directionnel', 'Espace pour la pause']
  },
  {
    value: 'tiles',
    label: '2048',
    short: '2048',
    icon: 'i-lucide-layout-grid',
    color: 'warning',
    category: 'Puzzle',
    rhythm: '5 min',
    accent: '#f5c783',
    description: 'Deux deviennent quatre. Jusqu’où iras-tu ?',
    rules:
      'Deux tuiles identiques fusionnent une fois par mouvement. Une nouvelle tuile apparaît uniquement si le plateau a changé. Tu peux annuler le dernier coup et continuer après 2048.',
    controls: ['Flèches, ZQSD ou WASD', 'Glisser sur le plateau', 'Un coup annulable']
  },
  {
    value: 'connect',
    label: 'Puissance 4',
    short: 'FOUR',
    icon: 'i-lucide-circle-dot',
    color: 'error',
    category: 'Stratégie',
    rhythm: '2 min',
    accent: '#c3acff',
    description: 'Construis ta ligne. Déjoue la sienne.',
    rules:
      'Tes disques sont mauves, ceux de l’IA sont dorés. Aligne quatre disques dans une direction. Toute la colonne est cliquable. L’IA gagne, bloque et évite les pièges immédiats.',
    controls: ['Appuie sur une colonne', 'Quatre disques pour gagner']
  },
  {
    value: 'mines',
    label: 'Démineur',
    short: 'MINES',
    icon: 'i-lucide-bomb',
    color: 'info',
    category: 'Puzzle',
    rhythm: '4 min',
    accent: '#95d9e5',
    description: 'Dix mines. Une seule certitude : ton premier pas.',
    rules:
      'Les chiffres indiquent les mines voisines. Le premier clic et ses voisins sont protégés. Si le bon nombre de drapeaux entoure un chiffre, appuie sur ce chiffre pour ouvrir ses voisins. Un mauvais drapeau peut faire exploser une mine.',
    controls: [
      'Clic : ouvrir · clic droit : drapeau',
      'Mode drapeau sur mobile',
      'Appui sur un chiffre : ouvrir autour'
    ]
  },
  {
    value: 'memory',
    label: 'Mémoire',
    short: 'MATCH',
    icon: 'i-lucide-brain',
    color: 'info',
    category: 'Puzzle',
    rhythm: '2 min',
    accent: '#e9a7d2',
    description: 'Seize cartes. Huit paires. Fais confiance à ta mémoire.',
    rules:
      'Retourne deux cartes par coup. Les paires restent visibles, les erreurs se retournent après un instant. Enchaîne les paires pour allonger ta série et tente de finir en huit coups.',
    controls: ['Deux cartes par coup', 'Huit paires à retrouver']
  }
] as const

export type ArcadeGameId = (typeof arcadeGames)[number]['value']
