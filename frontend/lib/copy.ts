// Centralized funny copy for the app. Random pickers below stay deterministic
// per session so the UI doesn't flicker on re-render.

export const EMPTY_HINTS = [
  'Drop a selfie. The committee is bored.',
  "Feed the algorithm. It hasn't eaten today.",
  'Show your face. We promise* to be gentle. (*we don’t)',
  "Click camera. Discover yourself, painfully.",
  "Take the photo. The truth is fine. Probably.",
  'A selfie. Now. The judges grow restless.',
  'Insert face. Receive verdict. Cope optional.',
  'No photo, no chopped score. Easy math.',
  'Step into the booth. The mirror has notes.',
  "We can't roast what we can't see.",
] as const;

export const ERROR_PREFIXES = [
  'The committee threw a tantrum',
  'Something went sideways',
  'The roast oven misfired',
  'Algorithm tripped on a wire',
  'A judge fainted',
  'Server briefly forgot how to be mean',
  "Couldn't reach the chopped hotline",
  'Network ate the homework',
  "It's not you, it's mostly you, but also us",
  'A small disaster, nothing serious',
] as const;

export const SUCCESS_QUIPS = [
  'The verdict has been served.',
  'Receipts: printed.',
  'Brace yourself.',
  'Truth delivered, free of charge.',
  'No refunds.',
  'Closing arguments below.',
  'Filed under: brutal honesty.',
  'The committee has spoken.',
] as const;

export const RETRY_LABELS = [
  'Round two, brave soul',
  'Try another (we dare you)',
  'Re-feed the algorithm',
  'Swap the evidence',
  'New angle, same fate',
  'Once more, for science',
] as const;

export const SUBTITLES = [
  'For entertainment purposes only.',
  'Not therapy. Definitely not therapy.',
  'A face-rating party trick. Do not take it home.',
  'Roasts assembled by an AI with too much free time.',
  'Mostly accurate. Sometimes mean. Always for fun.',
] as const;

export const PROBE_OK = [
  'Connected. The committee is reachable.',
  "Online. The judges are warming up.",
  'Server says hi (begrudgingly).',
  'Link established. May god help you.',
] as const;

export const PROBE_FAIL = [
  "Server didn't pick up.",
  'Nobody home at the chopped hotline.',
  'Could not reach the verdict desk.',
  'The committee is ghosting you.',
] as const;

export const ABOUT_LINES = [
  'For entertainment purposes only. The model is a public face-attractiveness classifier with strong opinions and no manners. None of this means anything. Probably.',
  'A toy. A meme. A face-shaped Rorschach test. Take none of it personally. Or all of it. Up to you.',
  "We trained nothing. We tuned nothing. We just point a borrowed model at your face and giggle. Don't @ us.",
] as const;

export const pickRandom = <T>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];
