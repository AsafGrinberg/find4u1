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

const {EXTRA_FAMILIES, GLOSSARY} = require("./taxonomy");
const {familyHint} = require("./vocabulary");

// קצב דיבור לכל סוג משפט (speakingRate של Google).
// 1.0 הוא הקצב של קריין רגוע; ריל מכירה צריך 1.2 ומעלה — אחרת הוא נשמע
// כמו הקראת טקסט ולא כמו מישהי שמדברת איתכם.
const RATES = {
  hook: 1.25,
  pain: 1.2,
  reveal: 1.2,
  feature: 1.18,
  cta: 1.25,
};

// הפסקה אחרי המשפט (מתורגמת לפריימים ב-timeline.js).
// קצרה: ריל מכירה זורם ולא נותן לשקט להרוג את הקצב.
const GAPS_MS = {
  hook: 120,
  pain: 140,
  reveal: 130,
  feature: 100,
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
    // קודם כל פנס של כלי רכב: שם "פנס" לבדו הוא לא בהכרח מנורה בבית,
    // ובלבול כזה הוציא סרטון של פנס אופנוע עם קריינות של מנורת לילה.
    id: "vehicle-light",
    core: /פנס.{0,14}(אופניים|אופנוע|קורקינט|קסדה|רחפן|רכב|טסלה)|פנס (אחורי|קדמי)|אור (אחורי|קדמי) ל(אופניים|אופנוע|רכב)|(bike|bicycle|motorcycle|scooter|car|drone) ?(light|tail ?light|lamp)|rear ?light/i,
    re: /אופניים|אופנוע|קורקינט|קסדה|רחפן|bicycle|motorcycle|scooter/i,
    hook: [
      "מי עוד נוסע בלילה בלי שאף אחד רואה אותו?",
      "כמה פעמים יצאתם לדרך והרכבים לא שמו לב אליכם?",
    ],
    pain: [
      "אור קטן שלא רואים אותו בכלל.",
      "ובדרך חשוכה זה מרגיש ממש מסוכן.",
    ],
    reveal: [
      "זה פנס שמתלבש על הכלי בקליק אחד.",
      "והוא מאיר למרחק בלי שום חיבור מסובך.",
    ],
    keyword: "פנס",
  },
  {
    id: "light",
    core: /מנור|נור[הי]|תאורה|תאורת|פרוז'קטור|night ?light|\blamp\b|light ?bulb/i,
    re: /\bled\b/i,
    hook: [
      "מי עוד קם בלילה לחפש את המתג?",
      "כמה פעמים בלילה אתם מחפשים את המתג?",
    ],
    pain: [
      "מגששים בחושך לאורך הקיר.",
      "וכל התעסקות כזאת מעירה אתכם לגמרי.",
    ],
    // האור נדלק בלחיצה — לא ממציאים חיישן שלא הוזכר במוצר. את עניין
    // החיישן מוסיפה הפיצ'ר "motion" רק כשהמוצר באמת כזה.
    reveal: [
      "זה אור קטן שמתחבר בלי חוטים ובלי מתקין.",
      "והוא נדלק בלחיצה אחת.",
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
    // מיטה לחתול או לכלב. חייבת לבוא לפני sleep: שם המילה "כרית" לבדה
    // תפסה מיטת חתול והקריינות דיברה על שמיכה לאנשים.
    id: "pet-bed",
    // "מיטה עגולה לחתולים" — שם התואר בין המילה "מיטה" לבעל החיים, ולכן
    // לא מחפשים רצף מדויק אלא עד 30 תווים ביניהם.
    core: /מיט[הת][^.!?|]{0,30}(חתול|כלב|חיות מחמד)|pet ?bed|cat ?bed|dog ?bed|cat ?(house|nest|cave)|dog ?(house|bed|cave)|(cat|dog) (sofa|mat)/i,
    hook: [
      "חיית המחמד שלכם ישנה בכל מקום חוץ מהמיטה שלה?",
      "החתול שלכם מעדיף את הרצפה על המיטה שקניתם לו?",
    ],
    pain: [
      "המיטה הקודמת שקועה ולא נוחה.",
      "ולכן היא בוחרת את הספה או את הרצפה הקרה.",
    ],
    reveal: [
      "זו מיטה רכה ועמוקה שחיית המחמד נכנסת אליה לבד.",
      "והקצוות הגבוהים נותנים לה תחושה מוגנת.",
    ],
    keyword: "מיטה",
  },
  {
    // שאר מוצרי חיות מחמד: צעצוע, רצועה, קערה, מכרסם.
    id: "pet",
    // (?!\s*\d) — כדי ש"CAT 6 cable" (כבל רשת) לא יהפוך למוצר לחתולים.
    core: /\bpet\b|\bcats?\b(?!\s*\d)|\bdogs?\b(?!\s*\d)|puppy|kitten|לחתול|לכלב|חתול|כלב|חיות מחמד|dog ?(toy|leash|harness|bowl|collar)|cat ?(toy|scratcher|tree|tunnel)/i,
    hook: [
      "חיית המחמד שלכם משתעממת כשהיא לבד בבית?",
      "החתול או הכלב שלכם מחפשים מה לעשות כל היום?",
    ],
    pain: [
      "היא מפרקת את הספה במקום את הצעצוע.",
      "ואין לה שום דבר שמעסיק אותה באמת.",
    ],
    reveal: [
      "זה אביזר קטן שהופך לה את היום להרבה יותר מעניין.",
      "והיא חוזרת אליו שוב ושוב.",
    ],
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
    // מצלמה או מנטר לתינוק הם קודם כל מצלמה. בלי זה מוצר שמסווג "לתינוק"
    // קיבל קריינות של משמרות לילה והתעוררויות, במקום מה שהמוצר עושה.
    not: /מצלמ|מנטר|מוניטור|monitor|camera|בייבימוניטור/i,
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
  // המילון הרחב (כל קטגוריות אליאקספרס) מגיע מ-taxonomy.js.
  ...EXTRA_FAMILIES,
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
  // החיישן הוא הסיפור של המוצר — הוא נבדק ראשון, אחרת הוא נחתך מהתסריט
  // בגלל תקרת שלושת היתרונות.
  {
    id: "motion",
    only: ["light"],
    re: /motion|pir|sensor|חיישן|תנועה|חיישנית/i,
    speech: [
      "הוא נדלק לבד ברגע שהוא מרגיש תנועה.",
      "ונכבה לבד כשאין תנועה בחדר.",
    ],
  },
  {
    id: "flashing",
    only: ["vehicle-light"],
    re: /flashing|blink|flash|מהבהב|הבהוב/i,
    speech: ["ויש מצב מהבהב שמושך את העין בכביש."],
  },
  {
    // שבעה צבעים הם הסיפור השני של המוצר — לפני שהיתרונות הכלליים
    // (סוללה, קומפקטי) תופסים את שלושת המקומות.
    id: "colors",
    only: ["light", "vehicle-light"],
    re: /7 ?colou?r|7 ?צבע|שבעה צבעים|rgb|multicolou?r|צבעים/i,
    speech: [
      "ואפשר להחליף בין הצבעים בלחיצה.",
      "כל פעם צבע אחר.",
    ],
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
    // הסוללה היא הסיפור רק במוצרים שבאמת חיים ממנה. במצלמה או במנטר זו
    // שורה טכנית שלא אומרת כלום, והיא נשמעה כמו קריינות של מוצר אחר.
    only: [
      "power",
      "audio",
      "stand",
      "vehicle-light",
      "light",
      "grooming",
      "massage",
      "computer",
      "clock",
      "phone-accessory",
    ],
    exclude: ["aroma", "kitchen", "organizer", "toys"],
    re: /rechargeable|battery|סוללה|נטען|נטענת|chargeable|usb|טעינה מהירה|fast.?charg|quick.?charg/i,
    speech: [
      "הסוללה נטענת בכבל רגיל.",
      "אז אין עוד סוללות שנגמרות באמצע.",
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
    only: ["light", "vehicle-light"],
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
    only: ["sleep", "baby", "beauty", "clean", "pet-bed", "pet"],
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
  // פנס של כלי רכב הוא "פנס", לא "מנורה" — הלקוח מגיב את המילה הנכונה.
  {
    re: /פנס.{0,14}(אופניים|אופנוע|קורקינט|קסדה|רחפן|רכב)|(bike|motorcycle|car|drone) ?light|rear ?light/i,
    word: "פנס",
  },
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

// תרגום המילים האנגליות מהכותרת של המוכר, כי לרוב דווקא שם כתוב מה
// המוצר באמת עושה ("night vision", "two way audio") והשם העברי הוא קיצור.
const GLOSSARY_ENTRIES = Object.entries(GLOSSARY).map(([term, hebrew]) => ({
  re: new RegExp(
    `(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`,
    "i"
  ),
  hebrew,
}));

function expandEnglish(text) {
  const value = String(text || "");
  if (!value) return "";
  const found = [];
  for (const entry of GLOSSARY_ENTRIES) {
    if (entry.re.test(value)) found.push(...entry.hebrew);
  }
  return found.length ? [...new Set(found)].join(" ") : "";
}

function haystack(product) {
  return [
    product.sourceTitle,
    expandEnglish(product.sourceTitle),
    product.name,
    product.sourceCategory,
    product.category,
    product.sourceDescription,
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
    expandEnglish(product.sourceTitle),
    product.sourceCategory,
    product.category,
  ]
    .filter(Boolean)
    .join(" | ");

  // `not` חוסם משפחה שהמילים שלה מופיעות במוצר אבל הן לא מה שהוא. למשל
  // מנטר תינוק עם הקטגוריה "לתינוק" — הוא לא מוצר תינוק, הוא מצלמה.
  const usable = (family) =>
    !(
      family.not &&
      (family.not.test(name) || family.not.test(title))
    );

  const byCore = FAMILIES.find((family) => usable(family) && family.core.test(name));
  if (byCore) return byCore;

  const byLoose = FAMILIES.find(
    (family) => usable(family) && family.re && family.re.test(name)
  );
  if (byLoose) return byLoose;

  const byTitle = FAMILIES.find(
    (family) => usable(family) && family.core.test(title)
  );
  if (byTitle) return byTitle;

  // מה שנלמד מאלפי כותרות אמיתיות של אליאקספרס (corpus/vocabulary.json).
  const hint = familyHint(haystack(product));
  if (hint) {
    const family = FAMILIES.find(
      (item) => item.id === hint.family && usable(item)
    );
    if (family) return family;
  }

  return GENERIC_FAMILY;
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

// קריינות ארוכה בהרבה מסרטון המוצר מחייבת לחזור על אותה תנועה שוב ושוב —
// זה מה שנראה כמו עריכה מקוטעת. לכן מספר המשפטים נגזר מאורך הסרטון.
const SENTENCE_SECONDS = 2.3;

/**
 * מקצר תסריט כשהוא ארוך מהסרטון: קודם מוותרים על משפט כאב כפול, אחר כך
 * על יתרון נוסף, ורק בסוף על גילוי כפול. ההוק, הגילוי הראשון והיתרון
 * הראשון (הם מה שהמוצר נמכר בו) והקריאה לפעולה נשארים תמיד.
 */
function fitSentences(sentences, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return sentences;
  const list = [...sentences];

  const dropOne = (predicate) => {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (predicate(list[i], i)) {
        list.splice(i, 1);
        return true;
      }
    }
    return false;
  };

  while (list.length > limit) {
    const dropped =
      dropOne(
        (sentence, index) =>
          sentence.role === "pain" &&
          list.findIndex((item) => item.role === "pain") !== index
      ) ||
      dropOne(
        (sentence, index) =>
          sentence.role === "feature" &&
          list.findIndex((item) => item.role === "feature") !== index
      ) ||
      dropOne(
        (sentence, index) =>
          sentence.role === "reveal" &&
          list.findIndex((item) => item.role === "reveal") !== index
      );
    if (!dropped) break;
  }

  return list;
}

/**
 * שם המוצר כפי שאומרים אותו בקריינות: עד שישה מילים, בעברית אם אפשר,
 * בלי מירכאות ובלי סימני פיסוק בסוף. null אם אין מה לקרוא.
 */
function productNameForSpeech(product) {
  const words = String(product.name || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/["'״׳]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const hebrew = words.filter((word) => /[\u0590-\u05FF]/.test(word));
  const chosen = (hebrew.length >= 2 ? hebrew : words).slice(0, 6);
  const text = chosen.join(" ").replace(/[.,:;!?\-–—]+$/g, "").trim();

  return text || null;
}

/**
 * מחזיר {keyword, family, sentences} — כל משפט עם role, rate ו-gapAfterMs.
 * המשפטים עצמם הם גם הקריינות וגם הכתוביות (ציטוט מדויק).
 * options.maxSentences — תקרה שנגזרת מאורך סרטון המוצר.
 */
function buildScript(product, options = {}) {
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

  // כשאין משפחה מתאימה, המשפחה הכללית מדברת על "המוצר הזה" בלי לומר מה הוא,
  // וזה מה שנשמע כאילו הקריינות לא קשורה לסרטון. כאן המוצר נקרא בשמו.
  const named = family.id === GENERIC_FAMILY.id ? productNameForSpeech(product) : null;
  if (named) {
    add("reveal", [`זה ${named}.`, "והוא עושה את העבודה במקומכם בלי מאמץ."]);
  } else {
    add("reveal", family.reveal);
  }

  features.forEach((feature) => add("feature", feature.speech));
  // תסריט של ארבעה משפטים נגמר לפני שהספקתם למכור: סוגרים ביתרון אמיתי.
  if (features.length < 2) add("feature", SHIPPING_BENEFIT);

  const keyword = family.keyword || commentKeyword(product);
  // בלי שם הרשת בקריינות: מנוע ההקראה הוגה "אליאקספרס" במבטא
  // אנגלי, וזה מה שהרג את הסרטונים. המיתוג כבר על המסך.
  add("cta", [`תגיבו ${keyword}.`, "ואשלח לכם לינק לרכישה ישירות."]);

  const fitted = fitSentences(sentences, options.maxSentences);

  return {
    keyword,
    family: family.id,
    sentences: fitted.map((sentence, index) => ({
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
  expandEnglish,
  GLOSSARY,
  RATES,
  GAPS_MS,
  formatShekels,
  commentKeyword,
  shekelsSpeech,
  productFeatures,
  familyFor,
  painFor: familyFor,
  fitSentences,
  SENTENCE_SECONDS,
  FAMILIES,
  FEATURES,
  KEYWORDS,
  SHIPPING_BENEFIT,
};
