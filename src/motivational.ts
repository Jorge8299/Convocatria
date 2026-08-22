export const FOOTBALL_PHRASES = [
  "Primero personas, después jugadores, siempre equipo.",
  "La actitud también juega el partido.",
  "El resultado dura un día; lo aprendido, toda la temporada.",
  "Nadie gana solo y nadie pierde solo.",
  "Cada entrenamiento cuenta, incluso cuando no sale perfecto.",
  "Los buenos compañeros hacen mejores jugadores.",
  "Hoy no buscamos ser perfectos; buscamos ser mejores que ayer.",
  "El balón corre más rápido cuando el equipo piensa unido.",
  "Disfruta, aprende y compite. En ese orden.",
  "La mejor victoria es ver cómo el equipo sigue creciendo.",
  "El esfuerzo de hoy será la confianza de mañana.",
  "Jugar bien también es animar, escuchar y respetar.",
  "No tengas miedo a fallar; ten ganas de volver a intentarlo.",
  "Cuando ayudas a un compañero, todo el equipo mejora.",
  "Entrena con ilusión, juega con valentía y termina con una sonrisa.",
];

export const randomFootballPhrase = () =>
  FOOTBALL_PHRASES[Math.floor(Math.random() * FOOTBALL_PHRASES.length)];
