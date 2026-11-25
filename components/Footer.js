import Link from 'next/link';

const LINKS = [
  { href: '/about', label: 'אודות Find4U' },
  { href: '/how-it-works', label: 'איך זה עובד' },
  { href: '/shipping-returns', label: 'משלוחים והחזרות' },
  { href: '/affiliate-disclosure', label: 'גילוי נאות' },
  { href: '/alerts', label: 'התראות ירידת מחיר' },
  { href: '/privacy', label: 'מדיניות פרטיות' },
  { href: '/data-deletion', label: 'מחיקת נתונים' },
];

export default function Footer() {
  return (
    <footer className="site-footer" dir="rtl">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <strong>Find4U</strong>
          <p>
            מוצרים נבחרים מאליאקספרס במקום אחד, עם דירוג גבוה ומכירות אמיתיות.
          </p>
        </div>

        <nav className="site-footer-links" aria-label="מידע על האתר">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="site-footer-note">
          Find4U משתתפת בתוכנית השותפים של AliExpress. ייתכן שנקבל עמלה על
          רכישה שתבצעו דרכנו — המחיר שלכם לא משתנה. הרכישה עצמה מתבצעת באתר
          AliExpress, בכפוף לתנאיו.
        </p>

        <p className="site-footer-copy">
          © {new Date().getFullYear()} Find4U · כל הזכויות שמורות
        </p>
      </div>
    </footer>
  );
}
