// pages/_document.js


import Document, { Html, Head, Main, NextScript } from 'next/document';

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="he" dir="rtl">
        <Head>
          <link
            rel="stylesheet"
            href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
            integrity="sha512-wu2VqzU0m4KFbRYAn3QjURWaPKnnynY3f0Ir+SC3ZJ1GipgkctcKPr41Md9t1KHLz3A4T8k2iE0Q8BPf5r3Knw=="
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
