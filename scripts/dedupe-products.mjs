#!/usr/bin/env node
// scripts/dedupe-products.mjs
// ---------------------------------------------------------------------------
// ניקוי כפילויות של מוצרים ב-Firestore.
//
// אותו דגם שנשאב מכמה מוכרים (VGR 353, למשל) נשמר כמה פעמים. הסקריפט מאתר
// את הקבוצות לפי אותה לוגיקה של האתר (lib/dedupe.mjs), משאיר עותק אחד עם
// המחיר הזול ביותר והביקורות הטובות ביותר, וארכב את האחרים ב-deletedProducts
// לפני שהוא מוחק אותם מ-products (כך שאפשר לשחזר).
//
// הרצה:
//   node scripts/dedupe-products.mjs                 # בדיקה בלבד, בלי כתיבה
//   node scripts/dedupe-products.mjs --json          # גם כותב תוכנית ל-video/out/dedupe-plan.json
//   node scripts/dedupe-products.mjs --apply         # מיזוג + מחיקת הכפילויות
//   node scripts/dedupe-products.mjs --apply --reset-videos
//                                                    # גם מאפס videoPublishedAt בכל המוצרים
//
// קריאה עובדת בלי הרשאות (ה-REST הציבורי). --apply דורש service account:
//   FIREBASE_SERVICE_ACCOUNT_FILE=video/serviceAccount.json
//   או FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

import { duplicateGroups, mergeCopies, priceOf, ratingOf, salesOf } from '../lib/dedupe.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin מותקן ב-video/, שם גם שאר כלי הפרסום.
const require = createRequire(path.join(ROOT, 'video', 'package.json'));

const PROJECT_ID = 'find4u-il-aefd0';
const API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  'AIzaSyCwpXCeGMYK10KvU8JJ5uES5DJSG0Sq6jU';
const PAGE_SIZE = 300;

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const WRITE_JSON = args.has('--json') || APPLY;
const RESET_VIDEOS = args.has('--reset-videos');

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
  if (admin.apps.length) return admin.firestore();

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
  return admin.firestore();
}

// השדות שנכתבים לעותק שנשאר. הזהות (id, slug, link, price, image) נשארת שלו.
function mergedFields(merged) {
  const fields = {
    rating: merged.rating,
    sales: merged.sales,
    gallery: merged.gallery || [],
    dedupeMergedAt: merged.dedupeMergedAt,
    mergedFrom: merged.mergedFrom || [],
  };
  if (merged.reviews != null) fields.reviews = merged.reviews;
  if (merged.originalPrice != null) fields.originalPrice = merged.originalPrice;
  if (merged.videoUrl) fields.videoUrl = merged.videoUrl;
  return fields;
}

async function applyGroups(db, groups) {
  const admin = require('firebase-admin');
  const products = db.collection('products');
  const archive = db.collection('deletedProducts');

  let merged = 0;
  let removed = 0;

  for (const group of groups) {
    if (!group.duplicate) continue;

    const winner = group.winner;
    const losers = group.items.filter(
      (item) => String(item.id) !== String(winner.id)
    );
    if (!losers.length) continue;

    const batch = db.batch();

    batch.set(products.doc(winner.id), mergedFields(mergeCopies(group.items)), {
      merge: true,
    });

    losers.forEach((loser) => {
      batch.set(archive.doc(String(loser.id)), {
        ...loser,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        mergedInto: String(winner.id),
      });
      batch.delete(products.doc(String(loser.id)));
    });

    await batch.commit();
    merged += 1;
    removed += losers.length;
    console.log(
      `[dedupe] ${winner.name} — kept ${winner.id} (${winner.price} ₪), removed ${losers.length}`
    );
  }

  return { merged, removed };
}

// מאפס את סימון "כבר יצא עליו ריל", כך שכל המוצרים חוזרים לתור.
async function resetVideoFlags(db, products) {
  const admin = require('firebase-admin');
  const flagged = products.filter(
    (product) => product.videoPublishedAt || product.videoPublished
  );
  console.log(
    `[reset] ${flagged.length} products marked as published (out of ${products.length})`
  );
  if (!flagged.length) return 0;

  for (let start = 0; start < flagged.length; start += 400) {
    const batch = db.batch();
    flagged.slice(start, start + 400).forEach((product) => {
      batch.update(db.collection('products').doc(product.id), {
        videoPublishedAt: admin.firestore.FieldValue.delete(),
        videoPublished: admin.firestore.FieldValue.delete(),
        videoPublishedFile: admin.firestore.FieldValue.delete(),
        videoPublishedUrl: admin.firestore.FieldValue.delete(),
        videoChannels: admin.firestore.FieldValue.delete(),
      });
    });
    await batch.commit();
  }

  console.log(`[reset] cleared the published flag on ${flagged.length} products`);
  return flagged.length;
}

// ---- דיווח ----------------------------------------------------------------

function money(value) {
  return Number.isFinite(value) ? `${value} ₪` : '—';
}

function describe(product) {
  const parts = [
    money(priceOf(product)),
    `${ratingOf(product) || '—'}★`,
    `${salesOf(product) || 0} sold`,
  ];
  return `${String(product.name || '').slice(0, 70)} [${product.id}] ${parts.join(' · ')}`;
}

function printGroups(groups, total) {
  const duplicates = groups.filter((group) => group.duplicate);
  const extraCopies = duplicates.reduce((sum, group) => sum + group.items.length - 1, 0);

  console.log(`products in Firestore: ${total}`);
  console.log(`duplicate groups: ${duplicates.length}`);
  console.log(`extra copies that would be merged: ${extraCopies}`);
  console.log(`products after cleanup: ${total - extraCopies}`);

  duplicates.slice(0, 40).forEach((group) => {
    console.log('');
    console.log(`• ${group.items.length} copies`);
    console.log(`  keep: ${describe(group.winner)}`);
    group.items
      .filter((item) => String(item.id) !== String(group.winner.id))
      .forEach((item) => console.log(`  drop: ${describe(item)}`));
  });

  if (duplicates.length > 40) {
    console.log(`\n…and ${duplicates.length - 40} more groups (see the JSON plan)`);
  }
}

// ---- Main -----------------------------------------------------------------

async function main() {
  const products = await readProducts();
  const groups = duplicateGroups(products);
  printGroups(groups, products.length);

  const duplicates = groups.filter((group) => group.duplicate);

  if (WRITE_JSON) {
    const planFile = path.join(ROOT, 'video', 'out', 'dedupe-plan.json');
    fs.mkdirSync(path.dirname(planFile), { recursive: true });
    fs.writeFileSync(
      planFile,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          totalProducts: products.length,
          duplicateGroups: duplicates.map((group) => ({
            winner: {
              id: group.winner.id,
              name: group.winner.name,
              price: group.winner.price,
            },
            duplicates: group.items
              .filter((item) => String(item.id) !== String(group.winner.id))
              .map((item) => ({ id: item.id, name: item.name, price: item.price })),
          })),
        },
        null,
        2
      )
    );
    console.log(`\nplan written to ${path.relative(ROOT, planFile)}`);
  }

  if (!APPLY) {
    console.log(
      '\ndry run — nothing was written. To merge and delete the duplicates:\n' +
        '  FIREBASE_SERVICE_ACCOUNT_FILE=video/serviceAccount.json node scripts/dedupe-products.mjs --apply'
    );
    return;
  }

  if (!duplicates.length && !RESET_VIDEOS) {
    console.log('\nnothing to do.');
    return;
  }

  const db = initFirebase();
  if (duplicates.length) await applyGroups(db, duplicates);
  if (RESET_VIDEOS) await resetVideoFlags(db, products);
  console.log('\ndone.');
}

main().catch((error) => {
  console.error('[dedupe] failed:', error.message);
  process.exit(1);
});
