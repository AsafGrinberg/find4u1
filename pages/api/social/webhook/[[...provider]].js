// pages/api/social/webhook/[[...provider]].js
//
// נקודת הכניסה של ה-webhook באתר (Vercel). כל הלוגיקה ב-lib/social/webhook.js.
// ה-bodyParser כבוי בכוונה: חתימת X-Hub-Signature-256 של מטא מחושבת על
// הגוף הגולמי, ולכן אסור ש-Next יפענח אותו קודם.

import webhook from "../../../../lib/social/webhook";

export const config = {
  api: {bodyParser: false},
};

export default async function handler(req, res) {
  await webhook.handle(req, res);
}
