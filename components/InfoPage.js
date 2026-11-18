import Head from 'next/head';
import Link from 'next/link';
import { SITE_URL } from '../lib/urls';

// מסגרת משותפת לעמודי האמון: כותרת, תוכן ומקטעים.
export default function InfoPage({ title, description, intro, sections = [], path }) {
  const url = `${SITE_URL}${path || '/'}`;

  return (
    <>
      <Head>
        <title>{`${title} — Find4U`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={description} />
        <meta property="og:title" content={`${title} — Find4U`} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <link rel="canonical" href={url} />
      </Head>

      <main dir="rtl">
        <div className="page-shell">
          <nav className="breadcrumb-row" aria-label="ניווט">
            <Link href="/">בית</Link>
            <span aria-hidden="true">/</span>
            <span>{title}</span>
          </nav>

          <article className="info-page">
            <h1 className="info-title">{title}</h1>
            {intro ? <p className="info-intro">{intro}</p> : null}

            {sections.map((section) => (
              <section key={section.heading} className="info-section">
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}

            <p className="info-cta">
              <Link href="/">חזרה לכל המוצרים ←</Link>
            </p>
          </article>
        </div>
      </main>
    </>
  );
}
