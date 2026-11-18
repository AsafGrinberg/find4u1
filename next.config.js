/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    // התמונות מגיעות מכמה שרתי CDN של אליאקספרס, ולכן מאשרים כל דומיין https.
    // התמונות מוגשות מ-Vercel כאופטימיזציה (WebP/AVIF) ולא נטענות כמו שהן.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
        pathname: '/**',
      },
    ],
  },
};
