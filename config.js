/* ==================================================================
   MATH FACTS — SETUP FILE
   ------------------------------------------------------------------
   The one thing you MUST fill in is SCRIPT_URL (see README step 2).

   Note what changed in v1.1: each kid's practice settings (range,
   number of problems, seconds per problem) are NO LONGER edited here.
   They live in the Google Sheet and you change them on the parent
   dashboard, which means you can retune the timer from your phone
   without touching code.

   The STUDENTS block below is only a fallback — used before the app
   has ever reached the network, and to seed the Sheet the first time
   the script runs.
   ================================================================== */

window.MATH_CONFIG = {

  /* --- the only required setting --------------------------------- */

  // The Apps Script web app address. Paste the URL that ends in /exec
  // between the quotes. Until you do, the quiz still works but cannot
  // send scores and cannot pick up dashboard settings.
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyfRXckmyLa3X-2yskiLYY0mdN1k-O3mi579G2AsOMwuLD2cHHw8fbW6I19DfmthMwEUw/exec',


  /* --- who practices ---------------------------------------------- */
  /* Each kid gets their own link:                                     */
  /*   .../MathFacts/?student=caleb                                    */
  /*   .../MathFacts/?student=ellie                                    */
  /* Opening the plain URL shows a "who's practicing?" picker.         */
  /* To add a third kid, add a key here AND on the dashboard.          */

  STUDENTS: {
    caleb: {
      name: 'Caleb',
      minFactor: 3,            // no ×2 problems
      maxFactor: 12,
      problemsPerSession: 20,
      secondsPerProblem: 12
    },
    ellie: {
      name: 'Ellie',
      minFactor: 1,
      maxFactor: 2,
      problemsPerSession: 1,
      secondsPerProblem: 20
    },
    daniel: {
      name: 'Daniel',
      minFactor: 2,
      maxFactor: 12,
      problemsPerSession: 20,
      secondsPerProblem: 14
    }
  },


  /* --- quiz behavior (same for everyone) -------------------------- */

  SHOW_CORRECT_ON_MISS: true,    // flash "7 × 8 = 56" after a wrong answer
  FEEDBACK_MS_CORRECT: 450,      // how long the green "Yes!" stays up
  FEEDBACK_MS_WRONG: 1700,       // how long the red correction stays up

  MAX_ANSWER_DIGITS: 3,
  AVOID_IMMEDIATE_REPEAT: true,  // never ask the identical fact twice in a row
  KEEP_SCREEN_AWAKE: true,       // hold the screen on during a session
  SEND_TIMEOUT_MS: 12000,        // give up on the upload after this many ms


  /* --- the parent dashboard ---------------------------------------- */

  TROUBLE_WINDOW: 10,            // "missed in X of the last 10 sessions"
  TROUBLE_MIN_SESSIONS: 2,       // appear as a trouble fact only at 2+ sessions
                                 // (so a single stumble stays noise)
  TREAT_COMMUTATIVE_AS_SAME: true, // 7×9 and 9×7 count as the same fact
  TREND_SESSIONS: 20,            // points plotted on the trend charts
  RECENT_SESSIONS_SHOWN: 12,     // rows in the recent-session list
  WEEKS_SHOWN: 8                 // bars in the sessions-per-week chart

};
