// Centralized funny copy for the app. Random pickers below stay deterministic
// per session so the UI doesn't flicker on re-render.

export const EMPTY_HINTS = [
  'Drop a selfie. The committee is bored and hungry.',
  "Feed the algorithm. It hasn't eaten since your last identity crisis.",
  "Show your face. We pinky-promise to be gentle. (we won't be.)",
  'Click camera. Discover yourself. Cope quietly.',
  "Take the photo. The truth is fine. Probably. Bring tissues.",
  'A selfie. Now. The judges are pre-judging in silence.',
  'Insert face. Receive verdict. Therapy sold separately.',
  'No photo, no chopped score. Easy math even for you.',
  'Step into the booth. The mirror has been holding back for years.',
  "We can't roast what we can't see. Don't make us beg.",
  "Front camera. Best lighting. Last chance to lie to yourself.",
  "Open the camera. The aura readings need a baseline.",
] as const;

export const ERROR_PREFIXES = [
  'The committee threw a tantrum',
  'Something went sideways and so did your jawline',
  'The roast oven misfired',
  'Algorithm tripped on a wire',
  'A judge fainted upon seeing the input',
  'Server briefly forgot how to be mean',
  "Couldn't reach the chopped hotline",
  'Network ate the homework',
  "It's not you, it's mostly you, but also us",
  'A small disaster, nothing serious',
  'The model unionized and went on strike',
  'A roast got stuck in the chimney',
  'The intern dropped the verdict',
  'Heat death of the universe (small batch)',
] as const;

export const SUCCESS_QUIPS = [
  'The verdict has been served. Cold.',
  'Receipts: printed in triplicate.',
  'Brace yourself. Then maybe brace again.',
  'Truth delivered, free of charge. (Charges may apply emotionally.)',
  'No refunds. No exchanges. No second opinions worth trusting.',
  'Closing arguments below. Defense rests. Defense should rest.',
  'Filed under: brutal honesty.',
  'The committee has spoken. Loudly. Possibly with a megaphone.',
  'Sealed, signed, and sent to your group chat.',
  'A masterpiece of unsolicited feedback.',
  "Notarized. Don't ask by whom.",
  'Ratified by the chopped congress.',
] as const;

export const RETRY_LABELS = [
  'Round two, brave soul',
  'Try another (we dare you, double dare)',
  'Re-feed the algorithm',
  'Swap the evidence',
  'New angle, same fate',
  'Once more, for science (and humiliation)',
  'Give it another shot, hero',
  'Maybe this one is the one',
  "It can't get worse. (It can.)",
  'Submit a different felony',
] as const;

export const SUBTITLES = [
  'For entertainment purposes only. Therapy purposes optional.',
  'Not therapy. Definitely not therapy. Possibly the opposite.',
  'A face-rating party trick. Do not bring home to parents.',
  'Roasts assembled by an AI with too much free time and zero manners.',
  'Mostly accurate. Sometimes mean. Always for fun. Cope responsibly.',
  'Powered by spite, vibes, and a tiny neural network.',
  'A toy. A meme. A face-shaped mistake detector.',
  'Side effects may include sudden self-awareness.',
  "We're not saying you asked for this — but you opened the app.",
] as const;

export const PROBE_OK = [
  'Connected. The committee is reachable and warming up the knives.',
  'Online. The judges are stretching.',
  'Server says hi (begrudgingly).',
  'Link established. May god help you.',
  'Pipeline open. Insults inbound.',
  "Server's awake. Bad news travels fast.",
] as const;

export const PROBE_FAIL = [
  "Server didn't pick up. It's screening calls.",
  'Nobody home at the chopped hotline.',
  'Could not reach the verdict desk.',
  'The committee is ghosting you.',
  'Server claimed to be in a meeting. Sus.',
  'Connection failed. Truth temporarily unavailable.',
] as const;

export const VERDICT_BADGES = [
  'court-admissible',
  'peer-reviewed',
  'notarized',
  'FDA-approved',
  'blessed by the committee',
  'SOC 2 compliant roast',
  'gluten-free judgment',
  'scientifically dubious',
  "doctor's note attached",
  'verified on the blockchain',
  'inspected by №7',
  'union-approved',
  'rated E for everyone',
  'organic, free-range cope',
  'limited edition',
  'lab-tested, mom-approved',
  'kosher slander',
  'forensically incontestable',
  'TÜV-zertifiziert',
  'mil-spec roast',
] as const;

export const DAILY_DISCLAIMERS = [
  'No faces were spared in the making of this score.',
  'Side effects may include sudden eye contact with mirrors.',
  'The committee is not responsible for emotional damage.',
  'This app does not constitute medical, dental, or aesthetic advice.',
  'Past performance is no guarantee of future chopped-ness.',
  'For ages 13+ or whoever is ready for the truth.',
  'In case of severe roast, hydrate and touch grass.',
  'Results not valid in jurisdictions that prohibit fun.',
  'Your selfie agreed to these terms when you took it.',
  'May contain traces of brutal honesty.',
  "Operator's manual: take it on the chin, like the chin.",
  'If symptoms persist longer than four hours, consult a stylist.',
  'This is not a courtroom. The committee just acts like one.',
] as const;

export const TITLE_EASTER_EGG_LINES = [
  'Chef mode unlocked. The roasts are now julienned.',
  "You're behind the counter now. Knife emoji granted.",
  'Welcome to the kitchen. Mind the lighting.',
  "You found the secret. Don't tell anyone, especially the lighting.",
  'Knife sharpened. Roasts will arrive bone-in.',
] as const;

export const ABOUT_LINES = [
  'For entertainment purposes only. The model is a public face-attractiveness classifier with strong opinions and no manners. None of this means anything. Probably.',
  'A toy. A meme. A face-shaped Rorschach test. Take none of it personally. Or all of it. Up to you.',
  "We trained nothing. We tuned nothing. We just point a borrowed model at your face and giggle. Don't @ us.",
  "Built on caffeine, spite, and a Hugging Face checkpoint. Don't bring it to court.",
] as const;

export const pickRandom = <T>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];
