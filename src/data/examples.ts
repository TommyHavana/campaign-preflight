export const VALID_EXAMPLES = [
  'https://atelier.example/coleccion?utm_source=google&utm_medium=cpc&utm_campaign=invierno_2026',
  'https://atelier.example/novedades?utm_source=newsletter&utm_medium=email&utm_campaign=invierno_2026&utm_content=boton_principal',
].join('\n');

export const INVALID_EXAMPLES = [
  'https://atelier.example/coleccion?utm_source=instagram&utm_medium=paid_social&utm_campaign=Invierno_2026',
  'https://atelier.example/coleccion?utm_source=meta&utm_medium=paid_social',
  'http://atelier.example/coleccion?utm_source=linkedin&utm_medium=paid_social&utm_campaign=invierno_2026',
  'https://atelier.example/novedades?utm_source=newsletter&utm_medium=email&utm_campaign=invierno%202026',
].join('\n');

export const MIXED_EXAMPLES = `${VALID_EXAMPLES}\n${INVALID_EXAMPLES}`;
