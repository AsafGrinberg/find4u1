# Webhook לרשתות — Find4U

שער אחד שמקבל אירועים מכל הרשתות. מטא (פייסבוק + אינסטגרם) מחוברת ועובדת היום;
יוטיוב, טיקטוק ו-X מחוברים ברמת הנתיב ומחכים להרשאות/מפתחות.

```
כתובת                        רשת
/api/social/webhook          מטא — פייסבוק ואינסטגרם
/api/social/webhook/youtube  יוטיוב (WebSub)
/api/social/webhook/tiktok   טיקטוק  (לא מחובר)
/api/social/webhook/x        X       (לא מחובר)
```

## מה מטא שולחת, ומה קורה

| אירוע | מאיפה | מה ה-webhook עושה |
| --- | --- | --- |
| `feed` (comment/add) | פייסבוק — תגובה על פוסט/ריל | עונה בתגובה עם הלינק הקצר + Private Reply עם פרטי המוצר |
| `comments` | אינסטגרם — תגובה על מדיה | אותו דבר (בתגובה וב-DM) |
| `messages` | Messenger / Direct | עונה מיד בהודעה: הלינק לאתר + חתימת הרשתות |

עונים לתגובה רק כשהיא נראית כמו בקשה (לינק / מחיר / "אפשר" / "רוצה"…) —
בדיוק אותו `REQUEST` שהסריקה כל חצי שעה משתמשת בו (`lib/social/replies.js`).
להודעות פרטיות עונים תמיד: זו השיחה שהבודק של מטא מנהל.

הסריקה כל חצי שעה (`scripts/reply-social.js`) נשארת כגיבוי. היא מדלגת על תגובה
שכבר נרשמה ב-`answeredComments`, ולכן אין תשובה כפולה.

## חיבור בפועל (פעם אחת)

1. **Vercel → Settings → Environment Variables** (Production + Preview):

   | משתנה | ערך |
   | --- | --- |
   | `META_WEBHOOK_VERIFY_TOKEN` | מחרוזת אקראית שתבחרו (למשל `find4u-wh-2026`) |
   | `FB_APP_SECRET` | App Dashboard → App settings → Basic → App secret |
   | `FB_PAGE_ID` / `FB_PAGE_ACCESS_TOKEN` | כמו ב-GitHub Actions |
   | `IG_USER_ID` / `IG_ACCESS_TOKEN` | כמו ב-GitHub Actions |
   | `FIREBASE_SERVICE_ACCOUNT` | *(רשות)* ה-JSON של חשבון השירות — רק כדי לרשום תגובות שטופלו |
   | `SITE_URL` | `https://find4u.vercel.app` |

   בלי `FIREBASE_SERVICE_ACCOUNT` ה-webhook עדיין עונה; הוא רק לא מסמן
   `answeredComments`, ואז הסריקה עלולה לענות שוב לאותה תגובה אחרי חצי שעה.
   אם ה-JSON מסתבך בהדבקה, אפשר להדביק אותו ב-base64.

2. **App Dashboard → Messenger → Settings → Webhooks**
   - Callback URL: `https://find4u.vercel.app/api/social/webhook`
   - Verify token: אותו `META_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to: `messages`, `messaging_postbacks`, `message_reactions`

3. **App Dashboard → Instagram → Webhooks**
   - אותה כתובת ואותו verify token
   - Subscribe to: `comments`, `messages`

4. **App Dashboard → Webhooks → Page**
   - Subscribe to: `feed`

5. לחיצה על **Verify and save** — מטא קוראת ל-GET עם ה-challenge, והנתיב
   מחזיר אותו כמו שהוא. אם זה נכשל: ה-verify token שגוי או שהמשתנה לא נטען
   (צריך Redeploy אחרי הוספת משתני סביבה ב-Vercel).

## בדיקה בלי לחכות למישהו

```bash
# אימות הכתובת (GET) — אמור להחזיר את הספרות של challenge
curl -i "https://find4u.vercel.app/api/social/webhook?hub.mode=subscribe&hub.verify_token=<TOKEN>&hub.challenge=12345"
```

POST אמיתי חייב להיחתם; בלי חתימה הוא מוחזר 401. לבדיקה מקומית מותר
`SOCIAL_WEBHOOK_INSECURE=1`, ואסור להפעיל אותו ב-Production.

## הוספת רשת חדשה

1. קובץ ב-`lib/social/providers/<name>.js` עם `verify(req, res)` ו-`receive({raw, headers})`.
2. שורה ב-`PROVIDERS` וב-`ALIASES` ב-`lib/social/webhook.js`.
3. אם צריך נוסח חדש — הוא נכנס ל-`lib/social/replies.js`, לא לספק עצמו.

אין צורך לשנות את ה-API route, את איתור המוצר או את רישום התגובות.

### מגבלות אמיתיות של הרשתות האחרות

- **יוטיוב**: WebSub דוחפת *סרטון חדש*, לא תגובות. מענה לתגובות נשאר בסריקה
  (`youtube-comment replies`), כי אין API לדחיפת תגובות.
- **טיקטוק**: ל-API יש webhooks, אבל אין אירוע "תגובה חדשה"; מענה לתגובות
  דורש סריקה.
- **X**: Account Activity API במסלול בתשלום; אירועים ברמת חשבון, לא תגובות על פוסט.
