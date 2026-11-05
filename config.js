/* =====================================================================
   RESEARCHER CONFIGURATION — this is the only file you need to edit.
   ---------------------------------------------------------------------
   • Keep the punctuation exactly as it is (quotes, commas, brackets).
   • Text inside 'single quotes' can be changed freely. If your text
     needs an apostrophe, write it as \'  (example: 'you\'ll').
   • After editing, upload this file again to your site (see SETUP.md).
   ===================================================================== */

window.STUDY_CONFIG = {

  /* A short name for this study. Changing it makes every browser start
     fresh (old in-progress sessions on a device are ignored), so only
     change it between data-collection rounds, never in the middle. */
  studyId: 'music-pref-2026',

  /* Paste your Google Apps Script "Web app URL" here (ends in /exec). */
  backendUrl: 'https://script.google.com/macros/s/AKfycbwMSHaaIAvwkaoOUFZk2ZVU4OmihRBG4oTaS6-o4pZT3eTFpxjo2aTIW1yCaqoxsIVypg/exec',

  /* true = the whole site runs as a demo with placeholder sounds and
     NOTHING is sent to Google Sheets. You can also open any copy of the
     site with ?demo=1 at the end of the address to get the demo. */
  demoMode: false,

  /* Playback rules */
  maxPlays: 2,                 // plays allowed per clip
  audioStartTimeoutMs: 15000,  // a click that hasn't started audio after this long counts as a failed load (not a play)
  maxLoadFailures: 3,          // after this many failed loads, the clip is marked unavailable and the participant may continue

  /* ---------------- Text shown to participants ---------------- */
  text: {
    title: 'Music Listening Study',
    intro: [
      'In this study you will hear 30 pairs of 20-second music clips. For each pair, tell us which clip you prefer and by how much.',
      'It takes about 25–40 minutes. Please use headphones and find a quiet place.'
    ],
    rules: [
      'Each clip can be played at most TWO times. A play counter is shown under each clip.',
      'You must listen to each clip all the way through at least once before answering. The second play is optional.',
      'Clips always start from the beginning and cannot be paused, skipped, or rewound.',
      'Only one clip plays at a time.',
      'Once you submit an answer you cannot go back or change it.',
      'No names or emails are collected. You will get an anonymous ID.',
      'If you accidentally close or refresh the page, reopen it on the same device and browser to continue where you left off.'
    ],
    agree: 'I have read the instructions and I\'m using headphones (recommended).',
    startButton: 'Start the study',
    progress: 'Song {n} of {total}',
    question: 'Which clip do you prefer, and by how much?',
    noPreferenceButton: 'No preference',
    submitButton: 'Submit and continue',
    thanksTitle: 'Thank you!',
    thanksBody: 'All of your responses have been saved. You can close this page now.'
  },

  /* The five labeled points on the slider. Values must stay -100, -50, 0, 50, 100. */
  sliderLabels: [
    { value: -100, text: 'Strongly prefer A' },
    { value:  -50, text: 'Somewhat prefer A' },
    { value:    0, text: 'No preference' },
    { value:   50, text: 'Somewhat prefer B' },
    { value:  100, text: 'Strongly prefer B' }
  ],

  /* ---------------- The 30 song pairs ----------------
     id       : your ID for the song (saved in the data; never shown to participants)
     original : location of the original recording
     ai       : location of the AI-generated version
     The audio files have random names on purpose so nothing reveals which
     clip is which. clip_map.csv (kept outside the site) lists what each file is. */
  songs: [
    { id: 'APT', original: 'audio/d0fe7a1e.mp3', ai: 'audio/606ee8ac.mp3' },
    { id: 'BACK_TO_FRIENDS', original: 'audio/9c13d7e7.mp3', ai: 'audio/10f04396.mp3' },
    { id: 'BAILE_INOLVIDABLE', original: 'audio/a23830f6.mp3', ai: 'audio/cf4c78da.mp3' },
    { id: 'BEAUTIFUL_THINGS', original: 'audio/dde2b7b6.mp3', ai: 'audio/544b1634.mp3' },
    { id: 'BIRDS_OF_A_FEATHER', original: 'audio/65d959d4.mp3', ai: 'audio/b6e09f30.mp3' },
    { id: 'BLACK_LIPSTICK', original: 'audio/297d95cd.mp3', ai: 'audio/c0732740.mp3' },
    { id: 'BUNNY_IS_A_RIDER', original: 'audio/b057db79.mp3', ai: 'audio/805ab734.mp3' },
    { id: 'CAN_I_CALL_YOU_ROSE', original: 'audio/e7d3bb4e.mp3', ai: 'audio/9514363d.mp3' },
    { id: 'CHAERI', original: 'audio/d6552b73.mp3', ai: 'audio/4a1f9735.mp3' },
    { id: 'CHOSEN_TO_DESERVE', original: 'audio/8e2dea41.mp3', ai: 'audio/4aae0b8b.mp3' },
    { id: 'CONCRETE_OVER_WATER', original: 'audio/8c8c8b56.mp3', ai: 'audio/2eed0066.mp3' },
    { id: 'DIE_WITH_A_SMILE', original: 'audio/bcad4fac.mp3', ai: 'audio/27636247.mp3' },
    { id: 'DTMF', original: 'audio/db35cf6e.mp3', ai: 'audio/59a839f1.mp3' },
    { id: 'ESPRESSO', original: 'audio/db30ba58.mp3', ai: 'audio/22118e97.mp3' },
    { id: 'FOR_GRANTED', original: 'audio/4620705f.mp3', ai: 'audio/be207251.mp3' },
    { id: 'GIRLFRIEND', original: 'audio/d02c7a35.mp3', ai: 'audio/75c903b7.mp3' },
    { id: 'GOLDEN', original: 'audio/0104504a.mp3', ai: 'audio/ab08bd61.mp3' },
    { id: 'HOMESWITCHER', original: 'audio/cef53980.mp3', ai: 'audio/40c1c1d8.mp3' },
    { id: 'LUTHER', original: 'audio/fa0a26fc.mp3', ai: 'audio/ce20a74e.mp3' },
    { id: 'NINA', original: 'audio/08834ba9.mp3', ai: 'audio/c50605f0.mp3' },
    { id: 'ORDINARY', original: 'audio/ae193151.mp3', ai: 'audio/729c0a82.mp3' },
    { id: 'PIXEL_AFFECTION', original: 'audio/97ebde0a.mp3', ai: 'audio/f2deb0db.mp3' },
    { id: 'PORCELAIN', original: 'audio/768fafb8.mp3', ai: 'audio/b9262b8e.mp3' },
    { id: 'SAILOR_SONG', original: 'audio/4e129d68.mp3', ai: 'audio/637bc84a.mp3' },
    { id: 'SINK_INTO_THE_FLOOR', original: 'audio/1da9ba38.mp3', ai: 'audio/27df162a.mp3' },
    { id: 'SPOILED_LITTLE_BRAT', original: 'audio/4fc7a00a.mp3', ai: 'audio/c4644643.mp3' },
    { id: 'THATS_SO_TRUE', original: 'audio/2c0f0592.mp3', ai: 'audio/fed76557.mp3' },
    { id: 'THY_MISSION', original: 'audio/be8e28d7.mp3', ai: 'audio/93eaedaa.mp3' },
    { id: 'TIMELESS', original: 'audio/832145f2.mp3', ai: 'audio/c42fb58b.mp3' },
    { id: 'WILDFLOWER', original: 'audio/29681a29.mp3', ai: 'audio/b95eec19.mp3' }
  ]
};
