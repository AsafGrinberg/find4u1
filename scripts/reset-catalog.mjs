#!/usr/bin/env node
// scripts/reset-catalog.mjs
// ---------------------------------------------------------------------------
// איפוס מלא של הקטלוג: מוחק את *כל* המוצרים מ-products.
//
// לפני כל מחיקה נשמר גיבוי כפול, כדי שתמיד אפשר יהיה לחזור אחורה:
//   1. קובץ מקומי: exports/catalog-backup-<תאריך>.json
//   2. ארכיון ב-Firestore: deletedProducts/<id> עם deletedAt ו-deletedReason
//
// הרצה:
//   node scripts/reset-catalog.mjs                 # בדיקה בלבד (dry run)
//   node scripts/reset-catalog.mjs --apply         # גיבוי, ארכיון ומחיקה
//   node scripts/reset-catalog.mjs --apply --keep-state
//                                                  # בלי לאפס את job_state
//
// קריאה עובדת בלי הרשאות (REST ציבורי). --apply דורש service account:
//   FIREBASE_SERVICE_ACCOUNT_FILE=video/serviceAccount.json
//   או FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin מותקן ב-video/, שם גם שאר כלי הפרסום.
const require = createRequire(path.join(ROOT, 'video', 'package.json'));

const PROJECT_ID = 'find4u-il-aefd0';
const API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  'AIzaSyCwpXCeGMYK10KvU8JJ5uES5DJSG0Sq6jU';
const PAGE_SIZE = 300;
const BATCH_SIZE = 400;

// התור של הפרסום ההורלי. אחרי איפוס הוא חייב להתחיל נקי, אחרת הבוט
// ממשיך לדלג על מוצרים שפורסמו לפני האיפוס.
const STATE_DOC = 'job_state/recommendedProducts';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const KEEP_STATE = args.has('--keep-state');

// ---- קריאה ----------------------------------------------------------------

function parseValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(parseValue);
  if ('mapValue' in value) return parseFields(value.mapValue.fields || {});
  return null;
}

function parseFields(fields) {
  const result = {};
  Object.entries(fields || {}).forEach(([key, value]) => {
    result[key] = parseValue(value);
  });
  return result;
}

async function readProducts() {
  const rows = [];
  let pageToken = null;

  do {
    const url =
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
      `/databases/(default)/documents/products?pageSize=${PAGE_SIZE}&key=${API_KEY}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Firestore read failed: ${response.status} ${await response.text()}`);
    }
    const json = await response.json();
    (json.documents || []).forEach((document) => {
      rows.push({
        id: document.name.split('/').pop(),
        ...parseFields(document.fields),
      });
    });
    pageToken = json.nextPageToken || null;
  } while (pageToken);

  return rows;
}

// ---- כתיבה ----------------------------------------------------------------

function initFirebase() {
  const admin = require('firebase-admin');
  if (admin.apps.length) return { admin, db: admin.firestore() };

  let credentials = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_FILE) {
    const file = path.resolve(ROOT, process.env.FIREBASE_SERVICE_ACCOUNT_FILE);
    credentials = JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  if (!credentials) {
    throw new Error(
      '--apply needs Firebase credentials: set FIREBASE_SERVICE_ACCOUNT_FILE ' +
        '(Firebase Console → Project settings → Service accounts → Generate new private key) ' +
        'or FIREBASE_SERVICE_ACCOUNT.'
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(credentials),
    projectId: credentials.project_id,
  });
  return { admin, db: admin.firestore() };
}

function writeBackup(products) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(ROOT, 'exports', `catalog-backup-${stamp}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      { createdAt: new Date().toISOString(), projectId: PROJECT_ID, products },
      null,
      2
    )
  );
  return `${path.relative(ROOT, file)} (${products.length} products)`;
}

async function wipe(db, admin, products) {
  const archive = db.collection('deletedProducts');
  const collection = db.collection('products');

  let removed = 0;
  for (let start = 0; start < products.length; start += BATCH_SIZE) {
    const slice = products.slice(start, start + BATCH_SIZE);
    const batch = db.batch();

    slice.forEach((product) => {
      const { id, ...data } = product;
      batch.set(archive.doc(String(id)), {
        ...data,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        deletedReason: 'catalog-reset',
      });
      batch.delete(collection.doc(String(id)));
    });

    await batch.commit();
    removed += slice.length;
    console.log(`[reset] archived and deleted ${removed}/${products.length}`);
  }

  return removed;
}

async function resetState(db, admin) {
  await db.doc(STATE_DOC).set(
    {
      recentAngles: [],
      recentTitleKeys: [],
      angleStats: {},
      lastAngle: admin.firestore.FieldValue.delete(),
      lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
      resetAt: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log('[reset] cleared the hourly job state (job_state/recommendedProducts)');
}

// ---- Main -----------------------------------------------------------------

async function main() {
  const products = await readProducts();
  console.log(`products in Firestore: ${products.length}`);

  if (!products.length) {
    console.log('catalog is already empty.');
    return;
  }

  products.slice(0, 10).forEach((product) => {
    console.log(`  • ${String(product.name || product.sourceTitle || '').slice(0, 60)} [${product.id}]`);
  });
  if (products.length > 10) console.log(`  …and ${products.length - 10} more`);

  if (!APPLY) {
    console.log(
      '\ndry run — nothing was written. To back up, archive and delete everything:\n' +
        '  FIREBASE_SERVICE_ACCOUNT_FILE=video/serviceAccount.json node scripts/reset-catalog.mjs --apply'
    );
    return;
  }

  // קודם גיבוי מקומי — רק אם הוא נכתב ממשיכים למחיקה.
  console.log(`[reset] backup written: ${writeBackup(products)}`);

  const { admin, db } = initFirebase();
  const removed = await wipe(db, admin, products);
  if (!KEEP_STATE) await resetState(db, admin);

  const left = await readProducts();
  console.log(`\n[reset] deleted ${removed} products, left in products: ${left.length}`);
  console.log('[reset] the old copies are in deletedProducts (deletedReason: catalog-reset)');
}

main().catch((error) => {
  console.error('[reset] failed:', error.message);
  process.exit(1);
});
