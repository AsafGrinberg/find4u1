"use strict";

/**
 * script.js
 * ---------------------------------------------------------------
 * כותב את מה שנשמע בריל — עברית מדוברת, לא הקראה של דף מוצר.
 *
 * המבנה (6–7 משפטים, כמו פרסומת UGC טובה):
 *   1. hook   — מצב מוכר בשאלה, בשנייה הראשונה
 *   2. pain   — מה זה עולה להם עכשיו (זמן / עצבים / כסף)
 *   3. reveal — מה הפיתרון, במשפט אחד שבו ברור מה המוצר
 *   4. 2–3 יתרונות אמיתיים, כל אחד משפט שלם שעומד לבד
 *   5. cta    — תגובה עם מילת מפתח, ולינק לרכישה
 *
 * למה לפי "משפחת מוצר" ולא לפי מילות מפתח בודדות:
 * בגרסה הקודמת כל מילה מהכותרת של המוכר בחרה משפט, ולכן שמן אתרי קיבל
 * הוק של "הבית מתלכלך מהר מדי" (כי בכותרת היה "clean"), ואזיקוני ניילון
 * קיבלו הוק של "נשארתם בלי סוללה" (כי בכותרת היה "cable"). עכשיו לכל
 * משפחה יש *ליבת מוצר* — המילה שמגדירה את המוצר עצמו — והמשפחה נבחרת
 * רק כשהיא מופיעה בשם העברי של המוצר, או בליבה של הכותרת. אחרת הסרטון
 * יוצא כללי, וזה עדיף על סרטון מגוחך.
 *
 * כללים שנשמרים כאן:
 *   • הסרטון מוכר את המוצר נטו. אין בקריינות דירוג, מספר מכירות,
 *     ביקורות או מחיר — המחיר וההנחה כבר כתובים על המסך.
 *   • אין דחיפות מומצאת ואין מלאי מומצא.
 *   • כל יתרון מופיע רק במשפחות שבהן הוא באמת הגיוני (חיישן תנועה
 *     במנורה, לא ברובוט שואב; ציפוי קרמי במחבת, לא במטען).
 *   • משפט קצר, בלי פסיקים בכלל. מנוע הקראה עברי קורא רצף עם פסיק
 *     כמילה אחת ארוכה ("שעות, ולא" נשמע "שעותולם"), ולכן כל רעיון
 *     מקבל משפט משלו וההפסקה נעשתה בציר הזמן ולא בפסיק.
 *   • בלי מילים דו-משמעיות בלי ניקוד ("שכמה", "אתרי", "מרוכז"+"אז").
 *     קול עברי מנחש תנועות והדגש, ולכן המילה נשמעת אחרת לגמרי. עדיף
 *     ניסוח אחר מאשר מילה שהמנוע יקרא שגוי.
 *   • קצב 1.0. האצת Chirp 3 HD מעל 1.0 נשמעת מהירה ומצחיקה; את הקצב
 *     עושות ההפסקות שבין המשפטים.
 */

// קצב דיבור לכל סוג משפט. 1.0 = הקצב הטבעי של הקול.
const RATES = {
  hook: 1.0,
  pain: 0.97,
  reveal: 1.0,
  feature: 1.0,
  cta: 1.0,
};

// הפסקה אחרי המשפט (מתורגמת לפריימים ב-timeline.js).
const GAPS_MS = {
  hook: 200,
  pain: 260,
  reveal: 220,
  feature: 180,
  cta: 0,
};

// ---------------------------------------------------------------------
// משפחות מוצרים.
//   core — מה שמגדיר את המוצר (לפי זה נבחרת המשפחה)
//   re   — התאמה רחבה, רק כשאין ליבה בשם
// ---------------------------------------------------------------------
const FAMILIES = [
  {
    id: "aroma",
    core: /שמן אתרי|שמנים אתריים|essential oil|ארומה|diffuser|מפזר ריח|נר ריחני|scented candle|peppermint|lavender|eucalyptus/i,
    re: /אתרי|מנטה|לבנדר|aromatherapy/i,
    hook: [
      "הבית שלכם מריח סגור גם אחרי שמאווררים?",
      "נמאס לכם שהריח הטוב נעלם אחרי חמש דקות?",
    ],
    pain: [
      "ספריי מחזיק חמש דקות בלבד.",
      "ונר נגמר עוד לפני שמרגישים את הריח.",
    ],
    reveal: ["זה שמן טבעי ומרוכז.", "כמה טיפות ממנו ממלאות חדר שלם."],
    keyword: "שמן",
  },
  {
    id: "light",
    core: /מנור|פנס|נור[הי]|תאורה|תאורת|פרוז'קטור|night ?light|\blamp\b|light ?bulb/i,
    re: /\bled\b/i,
    hook: [
      "מי עוד קם בלילה לחפש את המתג?",
      "כמה פעמים בלילה אתם מחפשים את המתג?",
    ],
    pain: [
      "מגששים בחושך לאורך הקיר.",
      "וכל התעסקות כזאת מעירה אתכם לגמרי.",
    ],
    reveal: [
      "מנורה קטנה שנדלקת לבד ברגע שאתם נכנסים.",
      "והיא נכבה לבד כשיוצאים.",
    ],
    keyword: "מנורה",
  },
  {
    id: "switch",
    core: /מתג|שקע חכם|switch|smart plug/i,
    re: /\bplug\b/i,
    hook: "כמה פעמים ביום אתם קמים לכבות אור?",
    pain: [
      "יורדים מהספה ומכבים חדר אחד.",
      "ואז מגלים שעוד אור דולק במטבח.",
    ],
    reveal: "מתג חכם שאפשר לכבות מהטלפון בלי לקום מהמקום.",
    keyword: "מתג",
  },
  {
    id: "air",
    core: /מטהר|מסנן אוויר|מכשיר אדים|air purifier|humidifier|hepa/i,
    hook: "מרגישים שהאוויר בבית כבד?",
    pain: ["אבק על המדפים כל יומיים.", "וריח סגור שלא יוצא מהחדר."],
    reveal:
      "מטהר אוויר קטן שמסנן אבק ופרוות ומחזיר אוויר נקי לחדר.",
    keyword: "מטהר",
  },
  {
    id: "clean",
    core: /שואב|vacuum cleaner|window vacuum|מכונת ניקוי|steam cleaner|\bmop\b/i,
    hook: ["כמה זמן הולך לכם על ניקוי הבית?", "הבית מתלכלך מהר מדי?"],
    pain: ["שעה שלמה של שאיבה.", "ואחרי יומיים שוב אבק על הרצפה."],
    reveal:
      "שואב קטן וחזק שמגיע לכל פינה בלי להוציא את השואב הגדול.",
    keyword: "שואב",
  },
  {
    id: "kitchen",
    core: /בלנדר|מעבד מזון|קוצץ|מטבח|סיר|מחבת|קומקום|טוסטר|מכונת קפה|blender|chopper|air fryer|kitchen|coffee maker/i,
    hook: "כמה זמן הולך לכם על חיתוך ירקות?",
    pain: ["הכול ידני ועל קרש קטן.", "ותוך חמש דקות כבר נמאס."],
    reveal: "מכשיר קטן שמקצר את כל העבודה הזאת לדקה.",
  },
  {
    id: "organizer",
    core: /מאסף כבלים|ניהול כבלים|אזיקון|אזיקוני|רצועות כבלים|cable (organizer|ties|management|straps)|zip ties/i,
    hook: "כל הכבלים שלכם בבלגן אחד גדול?",
    pain: [
      "מחפשים את הכבל הנכון בין עשרה אחרים.",
      "וזה לוקח חמש דקות כל פעם.",
    ],
    reveal: "ערכה קטנה שמסדרת את כל הכבלים והבלגן נעלם מהשולחן.",
    keyword: "כבלים",
  },
  {
    id: "grooming",
    core: /מכונת גילוח|גילוח|מספרה|מחליק שיער|מסלסל|trimmer|shaver|razor|grooming/i,
    hook: "הגילוח שלכם לוקח יותר מדי זמן?",
    pain: ["עוברים על אותו מקום שוב ושוב.", "ובסוף נשאר עור אדום."],
    reveal: "מכונה קטנה שמגלחת חלק בלי קצף ובלי מים.",
    keyword: "גילוח",
  },
  {
    id: "massage",
    core: /אקדח פאשיה|מסאז'ר|מסאז|massage gun|fascia|percussion massager/i,
    hook: "השרירים שלכם תפוסים בסוף יום עבודה?",
    pain: ["מנסים לשחרר אותם עם היד.", "וזה כואב ולא באמת עוזר."],
    reveal: "מסאז'ר קטן שמשחרר את השרירים בשתי דקות.",
    keyword: "מסאז'",
  },
  {
    id: "audio",
    core: /אוזניות|רמקול|headphone|earbud|speaker|soundbar/i,
    hook: "הרעש מסביב הורס לכם את המוזיקה?",
    pain: "מגבירים את הווליום וזה רק מוסיף עוד רעש.",
    reveal: "אוזניות קטנות שנשמעות חזק גם כשהרעש מסביב גדול.",
    keyword: "אוזניות",
  },
  {
    id: "stand",
    core: /מעמד|מחזיק טלפון|תושבת טלפון|phone holder|tablet stand|\bstand\b|tripod|חצובה/i,
    hook: "כמה פעמים הטלפון נפל לכם באמצע צילום?",
    pain: [
      "מחזיקים אותו ביד ומחפשים זווית.",
      "ואף פעם זה לא יוצא ישר.",
    ],
    reveal: "מעמד קטן שמחזיק את הטלפון בזווית שנוחה לכם.",
    keyword: "מעמד",
  },
  {
    id: "power",
    core: /מטען|סוללה ניידת|power ?bank|charger|כבל טעינה|charging cable/i,
    hook: "שוב נשארתם בלי סוללה באמצע היום?",
    pain: [
      "הכבל מתפרק בתיק.",
      "והמטען שקניתם כבר לא מחזיק חצי שעה.",
    ],
    reveal: "מטען קטן ומהיר שמחזיק לכל היום.",
    keyword: "מטען",
  },
  {
    id: "sleep",
    core: /שמיכ|כרית|מזרן|מצעים|blanket|pillow|mattress|bedding/i,
    hook: "אתם מתעוררים באמצע הלילה בלי סיבה?",
    pain: ["מסתובבים במיטה חצי שעה.", "וקמים בבוקר עייפים יותר."],
    reveal: "שמיכה קלה שמחזיקה אתכם חמים כל הלילה בלי להזיע.",
  },
  {
    id: "car",
    core: /מחזיק לרכב|תושבת לרכב|מובייל לרכב|car (phone )?(holder|mount)|phone mount|car charger/i,
    re: /רכב|\bcar\b|אופניים/i,
    hook: "כל נסיעה מחדש אתם מחפשים איפה לשים את הטלפון?",
    pain: [
      "הוא מחליק ונופל בין הכיסאות.",
      "ואתם מחפשים אותו בפקק.",
    ],
    reveal: "מחזיק קטן שמתלבש על הרכב ומחזיק את הטלפון במקום.",
    keyword: "רכב",
  },
  {
    id: "beauty",
    core: /טיפוח|קרם|סרום|מסכה|ציפורן|מסאז לפנים|beauty|skin care|serum|face cream/i,
    re: /שיער|פנים|עור|skin|hair/i,
    hook: "כל בוקר אותה התעסקות מול המראה?",
    pain: ["עוד מוצר שניסיתם ועוד הבטחה.", "ושום דבר לא נשאר."],
    reveal: "טיפול אחד קצר בלי תור ובלי מחיר של מכון.",
  },
  {
    id: "fitness",
    core: /כושר|משקולת|יוגה|fitness|dumbbell|yoga|gym equipment/i,
    re: /אימון|ספורט|sport|gym/i,
    hook: "האימון נשאר בצד כל השבוע?",
    pain: [
      "בסוף יום אין כוח לנסוע לחדר כושר.",
      "וזה נדחה שוב לשבוע הבא.",
    ],
    reveal: "ציוד קטן שאפשר לעשות איתו אימון שלם בבית.",
  },
  {
    id: "baby",
    core: /תינוק|פעוט|ילדים|baby|toddler|kids/i,
    hook: "הלילה שלכם נראה כמו משמרת?",
    pain: ["מתעוררים כל שעה.", "וקמים בבוקר גמורים."],
    reveal: "מוצר קטן שמקל על הלילות בלי שתצטרכו לקום כל שעה.",
  },
  {
    id: "toys",
    core: /צעצוע|פאזל|\btoy\b|puzzle|lego/i,
    re: /משחק|game/i,
    hook: "הילדים משתעממים תוך חמש דקות?",
    pain: "קונים עוד צעצוע והוא נזרק לפינה אחרי יומיים.",
    reveal: "משחק קטן שהם חוזרים אליו שוב ושוב.",
    keyword: "משחק",
  },
];

// כשהכותרת לא מספקת התאמה: עדיין סרטון עם מבנה מכירתי, בלי להמציא עובדה.
const GENERIC_FAMILY = {
  id: "generic",
  hook: [
    "כל פעם מחדש אתם מסתדרים עם מה שיש?",
    "יש מוצר קטן שהופך את השגרה הזאת לקלה.",
  ],
  pain: ["פתרון מאולתר וחצי עבודה.", "ובסוף מתעצבים ומנסים שוב מחר."],
  reveal: "המוצר הזה עושה את זה במקומכם בלי מאמץ ובלי התעסקות.",
};

// ---------------------------------------------------------------------
// יתרונות: מזהים מאפיין אמיתי של המוצר ומנסחים אותו כמשפט מדובר שלם.
//   only    — המשפחות שבהן היתרון הגיוני (בלעדיו הוא יכול להישמע מגוחך)
//   group   — לא לספר את אותו הדבר פעמיים ("נטען" ו-"USB")
// ---------------------------------------------------------------------
const FEATURES = [
  {
    id: "silent",
    only: ["audio", "air", "clean", "baby"],
    re: /silent|quiet|noise.?cancel|noise.?reduc|שקט|דממה|בלי רעש/i,
    speech: "שקט מספיק כדי להפעיל ליד מי שכבר נרדם.",
  },
  {
    id: "wireless",
    group: "power",
    re: /wireless|אלחוטי|ללא חוט/i,
    speech: [
      "בלי כבלים בכלל.",
      "אז נגמרה כל ההתעסקות עם שקע.",
    ],
  },
  {
    id: "power",
    group: "power",
    exclude: ["aroma", "kitchen", "organizer", "toys"],
    re: /rechargeable|battery|סוללה|נטען|נטענת|chargeable|usb|טעינה מהירה|fast.?charg|quick.?charg/i,
    speech: [
      "הסוללה נטענת בכבל רגיל.",
      "אז נגמרו הסוללות שנגמרות באמצע.",
    ],
  },
  {
    id: "waterproof",
    re: /waterproof|water.?resistant|עמיד למים|עמידה למים/i,
    speech: "עמיד למים אז גם גשם לא מפריע.",
  },
  {
    id: "nonstick",
    only: ["kitchen"],
    re: /non.?stick|אנטי.?דביק/i,
    speech: ["שום דבר לא נדבק.", "ושטיפה אחת והוא כמו חדש."],
  },
  {
    id: "stainless",
    only: ["kitchen"],
    re: /stainless|נירוסטה/i,
    speech: "מנירוסטה אמיתית ולא פלסטיק שמתקלף אחרי חודש.",
  },
  {
    id: "vacuum",
    only: ["clean"],
    re: /vacuum|יניקה|שואב/i,
    speech: "יניקה אמיתית ולא כמו אלה שמפזרות את הלכלוך.",
  },
  {
    id: "hepa",
    only: ["air", "clean"],
    re: /hepa|filter|מסנן|סינון/i,
    speech: "המסנן מחזיק את האבק בפנים והאוויר יוצא נקי.",
  },
  {
    id: "aroma",
    only: ["aroma"],
    re: /essential oil|שמן אתרי|aroma|peppermint|lavender|מנטה|לבנדר/i,
    speech: [
      "הריח נשאר באוויר שעות ארוכות.",
      "והוא לא נעלם כמו ספריי.",
    ],
  },
  {
    id: "concentrated",
    only: ["aroma"],
    re: /100%|pure|טהור|מרוכז|concentrated/i,
    speech: "בקבוק אחד קטן מחזיק לכם חודשים.",
  },
  {
    id: "heat",
    only: ["kitchen"],
    re: /heat|חימום|מתחמם/i,
    speech: ["מתחמם מהר ושומר על החום.", "והוא לא מתקרר אחרי דקה."],
  },
  {
    id: "adjustable",
    re: /adjustable|מתכוונן|כיוונון/i,
    speech: ["מתכוונן למידה שלכם.", "אז הוא יושב בדיוק במקום."],
  },
  {
    id: "foldable",
    re: /foldable|folding|מתקפל|קיפול/i,
    speech: "מתקפל ונכנס לתיק גם כשאין מקום בכלל.",
  },
  {
    id: "portable",
    re: /portable|\bmini\b|compact|נייד|קומפקטי|מיני/i,
    speech: "קטן וקל ונכנס לכל תיק.",
  },
  {
    id: "led",
    only: ["light"],
    re: /\bled\b|תאורת/i,
    speech: "התאורה חזקה וברורה גם כשחושך מסביב.",
  },
  {
    id: "magnetic",
    re: /magnetic|מגנט/i,
    speech: "נתפס בקליק אחד בלי ברגים ובלי להתעצבן.",
  },
  {
    id: "silicone",
    only: ["kitchen", "beauty", "baby"],
    re: /silicone|סיליקון/i,
    speech: "הסיליקון גמיש ולא נסדק גם אחרי שנה.",
  },
  {
    id: "ceramic",
    only: ["kitchen", "beauty"],
    re: /ceramic|קרמי/i,
    speech: "הציפוי הקרמי לא נשרף ולא משאיר ריח אחרי השימוש.",
  },
  {
    id: "leather",
    re: /leather|עור אמיתי|עור טבעי/i,
    speech: "העור אמיתי ונראה טוב גם אחרי שנה של שימוש.",
  },
  {
    id: "solar",
    only: ["light"],
    re: /solar|סולארי/i,
    speech: "נטען מהשמש בלי חשמל ובלי עוד הוצאה.",
  },
  {
    id: "remote",
    re: /\bremote\b|שלט/i,
    speech: ["מגיע עם שלט.", "אז לא קמים מהספה בשביל כל שינוי קטן."],
  },
  {
    id: "washable",
    only: ["sleep", "baby", "beauty", "clean"],
    re: /washable|נשטף|כיבוס|לכיבוס/i,
    speech: "נכנס לכיבוס רגיל ויוצא משם כמו חדש.",
  },
  {
    id: "set",
    re: /set of|\d+\s*(pcs|pieces)|יחידות|ערכה|סט של/i,
    speech: "ערכה שלמה בקופסה אחת ולא כל חלק בנפרד.",
  },
  {
    id: "smart",
    re: /smart|חכם|חכמה/i,
    speech: "עובד לבד בלי שום התעסקות.",
  },
  {
    id: "professional",
    re: /\bpro(fessional)?\b|מקצועי/i,
    speech: "הרמה מקצועית ולא משהו תחליפי.",
  },
];

// יתרון אחרון אמיתי, כשהמוצר לא מספק שני מאפיינים מזוהים.
const SHIPPING_BENEFIT = ["המשלוח מגיע לישראל.", "ישר עד הבית."];

// ---------------------------------------------------------------------
// מילת המפתח לתגובה. האוטומציה בתגובות מזהה אותה ושולחת לינק לרכישה,
// ולכן היא קצרה, בעברית, וקלה לזכור — לא שם המוצר המלא.
// ---------------------------------------------------------------------
const KEYWORDS = [
  { re: /שמן אתרי|שמנים אתריים|essential oil|aroma/i, word: "שמן" },
  { re: /מנור|פנס|נור[הי]|תאורה|\bled\b|\blamp\b|light/i, word: "מנורה" },
  { re: /מתג|switch/i, word: "מתג" },
  { re: /גילוח|shaver|razor|trimmer/i, word: "גילוח" },
  { re: /בלנדר|blender/i, word: "בלנדר" },
  { re: /שואב|vacuum/i, word: "שואב" },
  { re: /מטהר|hepa|air purifier/i, word: "מטהר" },
  { re: /אוזניות|headphone|earbud/i, word: "אוזניות" },
  { re: /רמקול|speaker/i, word: "רמקול" },
  { re: /שעון|watch/i, word: "שעון" },
  { re: /מעמד|stand|holder/i, word: "מעמד" },
  { re: /מטען|power ?bank|charger/i, word: "מטען" },
  { re: /כבל|cable/i, word: "כבלים" },
  { re: /מצלמה|camera/i, word: "מצלמה" },
  { re: /מיקרופון|microphone/i, word: "מיקרופון" },
  { re: /מאוורר|\bfan\b/i, word: "מאוורר" },
  { re: /מקרר|cooler/i, word: "מקרר" },
  { re: /תיק|\bbag\b/i, word: "תיק" },
  { re: /נעל|shoe|sneaker/i, word: "נעל" },
  { re: /שמיכ|blanket/i, word: "שמיכה" },
  { re: /כרית|pillow/i, word: "כרית" },
  { re: /מסאז|massage/i, word: "מסאז'" },
];

// מילים שלא הופכות למילת מפתח (תואר/מידה/מילה דקדוקית מהתרגום).
const KEYWORD_STOP = new Set([
  "יחידה",
  "יחידות",
  "מקורי",
  "מקורית",
  "איכותי",
  "איכותית",
  "מקצועי",
  "מקצועית",
  "חדש",
  "חדשה",
  "גדול",
  "גדולה",
  "קטן",
  "קטנה",
  "מכונת",
  "מכונה",
  "מכשיר",
  "מוצר",
  "אביזר",
  "אביזרים",
  "סט",
  "ערכה",
  "ערכת",
  "צבע",
  "דגם",
  "מידה",
  "מידות",
  "מסוג",
  "עבור",
  "עם",
  "של",
  "את",
  "או",
  "גם",
  "לכל",
  "בית",
]);

// ---------------------------------------------------------------------
// עזרים
// ---------------------------------------------------------------------
function one(value) {
  return Array.isArray(value)
    ? value[Math.floor(Math.random() * value.length)]
    : value;
}

function formatShekels(value) {
  if (value === null || value === undefined) return "";
  return `${Number(value).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ₪`;
}

function haystack(product) {
  return [
    product.sourceTitle,
    product.name,
    product.sourceCategory,
    product.category,
  ]
    .filter(Boolean)
    .join(" | ");
}

/**
 * המשפחה נבחרת קודם כל לפי ליבת המוצר בשם העברי (המתורגם והמדויק),
 * אחר כך לפי התאמה רחבה בשם, ורק בסוף לפי הליבה שבכותרת המוכר.
 * אין נפילה ל"כל מילה שמתאימה" — עדיף תסריט כללי מתסריט שגוי.
 */
function familyFor(product) {
  const name = String(product.name || "");
  const title = [
    product.sourceTitle,
    product.sourceCategory,
    product.category,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    FAMILIES.find((family) => family.core.test(name)) ||
    FAMILIES.find((family) => family.re && family.re.test(name)) ||
    FAMILIES.find((family) => family.core.test(title)) ||
    GENERIC_FAMILY
  );
}

function productFeatures(product, limit = 3, options = {}) {
  const text = haystack(product);
  const family = options.family || familyFor(product);
  const found = [];
  const groups = new Set();

  for (const feature of FEATURES) {
    if (found.length >= limit) break;
    if (feature.only && !feature.only.includes(family.id)) continue;
    if (feature.exclude && feature.exclude.includes(family.id)) continue;
    if (feature.group && groups.has(feature.group)) continue;
    if (!feature.re.test(text)) continue;
    found.push(feature);
    if (feature.group) groups.add(feature.group);
  }

  return found;
}

/**
 * מחיר במילים, כמו שאומרים אותו: "מאה ושמונה עשרה שקלים" ואם יש
 * אגורות — "מאה ושמונה עשרה שקלים וארבעים וחמש אגורות".
 */
function shekelsSpeech(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const shekels = Math.floor(amount + 1e-9);
  const agorot = Math.round((amount - shekels) * 100);
  const {numberToHebrew} = require("./hebrew-numbers");
  const base = shekels === 1 ? "שקל אחד" : `${numberToHebrew(shekels)} שקלים`;
  if (!agorot) return base;
  return `${base} ו${numberToHebrew(agorot, "feminine")} אגורות`;
}

// מילת המפתח שהלקוח מתבקש להגיב בה (גם על המסך וגם בקריינות).
function commentKeyword(product) {
  const text = haystack(product);
  const hit = KEYWORDS.find((item) => item.re.test(text));
  if (hit) return hit.word;

  // נפילה לאחור: המילה העברית המשמעותית הראשונה בשם ("שמן אתרי" → "שמן"),
  // ולא מספר, דגם, או תואר כמו "יחידה" / "מקורי" / "מכונת".
  const words = String(product.name || "")
    .replace(/["'״׳]/g, " ")
    .split(/\s+/)
    .filter((word) => /^[\u0590-\u05FF]{3,}$/.test(word))
    .filter((word) => !KEYWORD_STOP.has(word));
  return words[0] || "מוצר";
}

// ---------------------------------------------------------------------
// בונים את המשפטים
// ---------------------------------------------------------------------

/**
 * מחזיר {keyword, family, sentences} — כל משפט עם role, rate ו-gapAfterMs.
 * המשפטים עצמם הם גם הקריינות וגם הכתוביות (ציטוט מדויק).
 */
function buildScript(product) {
  const family = familyFor(product);
  const features = productFeatures(product, 3, {family});
  const sentences = [];

  // משפט אחד או כמה: כל רעיון נאמר במשפט נפרד, ומקבל את ההפסקה שלו.
  const add = (role, value) => {
    for (const speech of Array.isArray(value) ? value : [value]) {
      sentences.push({
        role,
        speech: String(speech).replace(/\s+/g, " ").trim(),
        rate: RATES[role] || 1,
        gapAfterMs: GAPS_MS[role] || 0,
      });
    }
  };

  add("hook", one(family.hook));
  add("pain", family.pain);
  add("reveal", family.reveal);

  features.forEach((feature) => add("feature", feature.speech));
  // תסריט של ארבעה משפטים נגמר לפני שהספקתם למכור: סוגרים ביתרון אמיתי.
  if (features.length < 2) add("feature", SHIPPING_BENEFIT);

  const keyword = family.keyword || commentKeyword(product);
  add("cta", [
    `תגיבו ${keyword}.`,
    "ואשלח לכם לינק לרכישה מאליאקספרס.",
  ]);

  return {
    keyword,
    family: family.id,
    sentences: sentences.map((sentence, index) => ({
      ...sentence,
      id: index + 1,
      text: sentence.speech,
    })),
  };
}

function speechText(sentences) {
  return sentences
    .map((item) => item.speech.replace(/[.!\s]+$/, ""))
    .join(". ")
    .concat(".");
}

// כיתוב לפוסט באינסטגרם / טלגרם.
function captionText(product, sentences, site, keyword) {
  const lines = [sentences[0] ? sentences[0].speech : product.name, ""];

  lines.push(`🛍️ ${product.name}`);

  const priceLine =
    product.originalPrice &&
    Number(product.originalPrice) > Number(product.price)
      ? `${formatShekels(product.price)} במקום ${formatShekels(
          product.originalPrice
        )}`
      : `${formatShekels(product.price)} בלבד`;
  lines.push(`💰 ${priceLine}`);

  if (product.discount) lines.push(`🔥 ${Math.round(product.discount)}% הנחה`);

  lines.push("");
  lines.push("🚚 משלוח לישראל");
  lines.push(
    `💬 תגיבו ${keyword || commentKeyword(product)} ואני שולח לכם לינק לרכישה`
  );
  lines.push("");
  lines.push(
    "#find4u #דילים #קניות_אונליין #עליאקספרס #מוצרים_מומלצים #שופינג"
  );

  return lines.join("\n");
}

module.exports = {
  buildScript,
  speechText,
  captionText,
  formatShekels,
  commentKeyword,
  shekelsSpeech,
  productFeatures,
  familyFor,
  painFor: familyFor,
  FAMILIES,
  FEATURES,
  KEYWORDS,
  SHIPPING_BENEFIT,
};
