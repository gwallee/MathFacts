/* ==================================================================
   MATH FACTS — ALL SETTINGS LIVE IN THIS ONE FILE
   ------------------------------------------------------------------
   Edit this file on github.com (pencil icon), commit, and BOTH the
   quiz page and the parent dashboard pick the change up. Nothing else
   ever needs editing.

   The one thing you MUST fill in is SCRIPT_URL (see README step 2).
   ================================================================== */

window.MATH_CONFIG = {

  /* --- the only required setting --------------------------------- */

  // The Apps Script web app address. Paste the URL that ends in /exec
  // between the quotes. Until you do, the quiz still works but cannot
  // send scores.
  SCRIPT_URL: '',


  /* --- who is practising ----------------------------------------- */

  STUDENT_NAME: 'Caleb',


  /* --- the quiz --------------------------------------------------- */

  MIN_FACTOR: 3,                 // smallest number used (3 = no ×2 problems)
  MAX_FACTOR: 12,                // largest number used (never above 12)
  PROBLEMS_PER_SESSION: 20,      // problems in one session
  SECONDS_PER_PROBLEM: 8,        // countdown per problem; running out = a miss

  SHOW_CORRECT_ON_MISS: true,    // flash "7 × 8 = 56" after a wrong answer
  FEEDBACK_MS_CORRECT: 450,      // how long the green "Yes!" stays up
  FEEDBACK_MS_WRONG: 1700,       // how long the red correction stays up

  MAX_ANSWER_DIGITS: 3,
  AVOID_IMMEDIATE_REPEAT: true,  // never ask the identical fact twice in a row
  KEEP_SCREEN_AWAKE: true,       // hold the screen on during a session
  SEND_TIMEOUT_MS: 12000,        // give up on the upload after this many ms


  /* --- the parent dashboard --------------------------------------- */

  TROUBLE_WINDOW: 10,            // "missed in X of the last 10 sessions"
  TROUBLE_MIN_SESSIONS: 2,       // appear as a trouble fact only at 2+ sessions
                                 // (so a single stumble stays noise)
  TREAT_COMMUTATIVE_AS_SAME: true, // 7×9 and 9×7 count as the same fact
  TREND_SESSIONS: 20,            // points plotted on the trend charts
  RECENT_SESSIONS_SHOWN: 12,     // rows in the recent-session list
  WEEKS_SHOWN: 8                 // bars in the sessions-per-week chart

};
