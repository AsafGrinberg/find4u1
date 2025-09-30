// פס תחתון עם אייקונים לרשתות חברתיות
import React from 'react';

const socialLinks = [
  {
    href: 'https://www.tiktok.com/@find4u_il',
    label: 'TikTok',
    svg: (
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none"><path d="M33 6v28a9 9 0 11-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M33 6c1.5 4.5 6 7.5 10 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
    )
  },
  {
    href: 'https://www.instagram.com/find4u_il/#/',
    label: 'Instagram',
    svg: (
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none"><rect x="8" y="8" width="32" height="32" rx="10" stroke="currentColor" strokeWidth="3"/><circle cx="24" cy="24" r="7" stroke="currentColor" strokeWidth="3"/><circle cx="33" cy="15" r="2" fill="currentColor"/></svg>
    )
  },
  {
    href: 'https://www.facebook.com/Find4UShopping/',
    label: 'Facebook',
    svg: (
      <svg width="28" height="28" viewBox="0 0 48 48" fill="none"><rect x="8" y="8" width="32" height="32" rx="16" stroke="currentColor" strokeWidth="3"/><path d="M28 18h-3a2 2 0 00-2 2v4h5l-1 5h-4v9h-5v-9h-3v-5h3v-3a6 6 0 016-6h3v5z" fill="currentColor"/></svg>
    )
  }
];

export default function SocialBar({ dark, inline }) {
  return (
    <div style={{
      width: inline ? 'auto' : '100%',
      position: inline ? 'static' : 'fixed',
      bottom: inline ? undefined : 0,
      left: inline ? undefined : 0,
      zIndex: 100,
      background: dark ? '#23243a' : '#fff',
      borderTop: !inline && (dark ? '1px solid #444' : '1px solid #e1e5e9'),
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
  padding: !inline ? '10px 0' : '10px 0', // רווח פנימי רגיל
      boxShadow: !inline ? (dark ? '0 -2px 8px rgba(0,0,0,0.3)' : '0 -2px 8px rgba(0,0,0,0.08)') : undefined
    }}>
      {socialLinks.map(link => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          style={{
            margin: '0 14px',
            color: dark ? '#eee' : '#333',
            transition: 'color 0.2s',
            display: 'inline-block'
          }}
        >
          {link.svg}
        </a>
      ))}
    </div>
  );
}
