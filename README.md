# Find4U - אתר מוצרים מומלצים וחמים 🛍️

אתר מודרני ואלגנטי למציאת מוצרים איכותיים במחירים הטובים ביותר. האתר כולל מערכת ניהול מתקדמת, SEO מותאם אישית, ועיצוב רספונסיבי.

## ✨ תכונות עיקריות

### 🎯 מוצרים מומלצים
- **סקשן ייעודי למוצרים מומלצים** - רק מוצרים שהועלו ידנית דרך האדמין
- **גלילה אלגנטית** - כפתורי גלילה יפים עם אנימציות חלקות
- **עיצוב מודרני** - כרטיסי מוצרים עם אפקטים ויזואליים מתקדמים

### 🔥 מוצרים חמים
- **מוצרים פופולריים** - מוצרים עם הכי הרבה לייקים וקליקים
- **עדכון אוטומטי** - מערכת שמעדכנת את המוצרים החמים באופן אוטומטי

### 🔄 AliExpress Integration
- **מוצרים מקטגוריות שונות** - כל לחיצה מביאה מוצר מקטגוריה אחרת
- **10 קטגוריות שונות**: אלקטרוניקה, אופנה, בית, צעצועים, ספורט, יופי, רכב, גינה, מטבח, משרד
- **סנכרון חכם** - מערכת שמביאה מוצרים איכותיים בלבד

### 📱 עיצוב רספונסיבי
- **תמיכה מלאה במובייל** - עיצוב מותאם לכל הגדלי מסך
- **PWA מוכן** - אפשרות להתקנה כאפליקציה
- **ביצועים מהירים** - אופטימיזציה מלאה לטעינה מהירה

### 🔍 SEO מתקדם
- **Meta tags מותאמים** - לכל דף יש meta tags ייחודיים
- **Structured Data** - Schema.org markup למוצרים
- **Sitemap אוטומטי** - מפת אתר לעדכון מנועי החיפוש
- **Robots.txt** - הנחיות למנועי החיפוש
- **Open Graph** - שיתוף מושלם ברשתות חברתיות

## 🚀 התקנה והרצה

### דרישות מקדימות
- Node.js 16+ 
- npm או yarn

### התקנה
```bash
# שכפול הפרויקט
git clone https://github.com/your-username/find4u.git
cd find4u

# התקנת תלויות
npm install

# הגדרת משתני סביבה
cp .env.example .env.local
# ערוך את .env.local עם הפרטים שלך

# הרצת השרת בפיתוח
npm run dev
```

### בנייה לייצור
```bash
# בניית הפרויקט
npm run build

# הרצה בייצור
npm start
```

## 📁 מבנה הפרויקט

```
find4u/
├── components/          # רכיבי React
│   ├── Header.js       # כותרת האתר
│   ├── HotProducts.js  # מוצרים חמים
│   └── RecommendedProducts.js # מוצרים מומלצים
├── pages/              # דפי Next.js
│   ├── index.js        # דף הבית
│   ├── admin.js        # דף אדמין
│   └── product/[id].js # דף מוצר
├── styles/             # קבצי CSS
│   ├── globals.css     # סגנונות גלובליים
│   └── RecommendedProducts.module.css
├── lib/                # ספריות ופונקציות
│   ├── sync-products.js # סנכרון AliExpress
│   └── hot-products.js  # ניהול מוצרים חמים
├── public/             # קבצים סטטיים
│   ├── sitemap.xml     # מפת אתר
│   ├── robots.txt      # הנחיות למנועי חיפוש
│   └── manifest.json   # PWA manifest
└── firebase/           # הגדרות Firebase
```

## 🛠️ שימוש במערכת האדמין

### כניסה לאדמין
1. גש ל-`/admin`
2. התחבר עם המייל: `asafg999@gmail.com`

### הוספת מוצרים ידנית
1. בחר בטאב "טופס מוצר"
2. מלא את פרטי המוצר
3. העלה תמונות
4. לחץ על "הוסף מוצר"

### סנכרון AliExpress
1. בחר בטאב "המוצרים"
2. לחץ על "🔄 סנכרון AliExpress"
3. המערכת תביא מוצר אחד מכל קטגוריה

### ניהול מוצרים חמים
- **הוספת מוצרים חמים**: לחץ על "🔥 Add 5 Hot Products"
- **מחיקת מוצרים חמים**: לחץ על "🗑️ Clear Hot Products"

## 🎨 עיצוב ומותג

### צבעים
- **ראשי**: `#667eea` (כחול-סגול)
- **משני**: `#764ba2` (סגול)
- **רקע**: `#f5f7fa` (אפור בהיר)

### טיפוגרפיה
- **גופן ראשי**: Heebo (Google Fonts)
- **משקלים**: 300-900

### אנימציות
- **Fade In Up**: כניסת אלמנטים
- **Hover Effects**: אפקטים בריחוף
- **Smooth Transitions**: מעברים חלקים

## 🔧 הגדרות טכניות

### Firebase
הפרויקט משתמש ב-Firebase עבור:
- **Authentication**: התחברות משתמשים
- **Firestore**: מסד נתונים
- **Storage**: אחסון תמונות

### Cloudinary
- **אחסון תמונות**: תמונות מוצרים
- **אופטימיזציה**: דחיסה אוטומטית

### SEO
- **Meta Tags**: לכל דף יש meta tags ייחודיים
- **Structured Data**: Schema.org markup
- **Sitemap**: מפת אתר אוטומטית
- **Robots.txt**: הנחיות למנועי חיפוש

## 📊 ביצועים

### אופטימיזציות
- **Image Optimization**: Next.js Image component
- **Code Splitting**: חלוקה אוטומטית של הקוד
- **Lazy Loading**: טעינה עצלה של תמונות
- **Bundle Optimization**: אופטימיזציה של החבילות

### מדדי ביצועים
- **First Contentful Paint**: < 1.5s
- **Largest Contentful Paint**: < 2.5s
- **Cumulative Layout Shift**: < 0.1

## 🔒 אבטחה

### הגנות
- **XSS Protection**: הגנה מפני XSS
- **CSRF Protection**: הגנה מפני CSRF
- **Content Security Policy**: מדיניות אבטחת תוכן
- **Input Validation**: אימות קלט

### הרשאות
- **Admin Access**: רק למשתמשים מורשים
- **File Upload**: הגבלת סוגי קבצים
- **API Rate Limiting**: הגבלת בקשות

## 📱 PWA Features

### התקנה
- **Add to Home Screen**: התקנה כאפליקציה
- **Offline Support**: תמיכה במצב לא מקוון
- **Push Notifications**: התראות (עתידי)

### Manifest
- **App Name**: Find4U
- **Theme Color**: #667eea
- **Display Mode**: standalone

## 🚀 פריסה

### Vercel (מומלץ)
```bash
npm install -g vercel
vercel
```

### Netlify
```bash
npm run build
# העלה את תיקיית .next
```

### Firebase Hosting
```bash
npm run build
firebase deploy
```

## 🤝 תרומה לפרויקט

1. Fork את הפרויקט
2. צור branch חדש (`git checkout -b feature/amazing-feature`)
3. Commit את השינויים (`git commit -m 'Add amazing feature'`)
4. Push ל-branch (`git push origin feature/amazing-feature`)
5. פתח Pull Request

## 📄 רישיון

פרויקט זה מוגן תחת רישיון MIT. ראה קובץ `LICENSE` לפרטים.

## 📞 תמיכה

- **אימייל**: support@find4u.co.il
- **GitHub Issues**: [דווח על באג](https://github.com/your-username/find4u/issues)
- **דוקומנטציה**: [קרא עוד](https://docs.find4u.co.il)

## 🙏 תודות

- **Next.js** - Framework מושלם
- **Firebase** - Backend אמין
- **Cloudinary** - אחסון תמונות
- **Heebo Font** - טיפוגרפיה יפה

---

**Find4U** - האתר המוביל למציאת מוצרים איכותיים במחירים הטובים ביותר! 🎉
