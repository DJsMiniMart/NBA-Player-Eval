/* League salary numbers for the season, shared by the Trade Machine and the team pages.
   Update each July when the NBA announces the new figures. */
window.CAP_RULES = {
  season:       "2026-27",
  cap:          164961000,   // salary cap
  tax:          200428000,   // luxury tax line
  apron1:       209015000,   // first apron
  apron2:       221686000,   // second apron
  minPayroll:   148465000,   // minimum team salary
  bracket:      9096000,     // salary-matching amount (was $7.5M in 2023-24; rises with the cap)
  buffer:       250000,      // the "+ $250K" in salary matching
  cashLimit:    8495000,     // most cash a team can send (and, separately, receive) in trades this season
  rosterMax:    15,          // standard contracts (two-way players don't count)
  rosterMin:    14,
  firstDraft:   2027,        // the next draft
  yearsOut:     7,           // picks can be traded up to seven drafts out
  ntmle:        15044000,    // non-taxpayer mid-level exception
  tmle:         6064000,     // taxpayer mid-level exception
  roomMle:      9366000,     // room exception
  bae:          5477000,     // bi-annual exception
};
