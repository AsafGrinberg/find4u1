import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  query,      // ✅ הוספה
  where       // ✅ הוספה
} from "firebase/firestore";

import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged
} from "firebase/auth";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCwpXCeGMYK10KvU8JJ5uES5DJSG0Sq6jU",
  authDomain: "find4u-il-aefd0.firebaseapp.com",
  projectId: "find4u-il-aefd0",
  storageBucket: "find4u-il-aefd0.appspot.com",
  messagingSenderId: "387851265240",
  appId: "1:387851265240:web:ff3692945470dcab31a3ad"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ✅ רק שורת export אחת
export {
  db,
  auth,
  provider,
  onAuthStateChanged,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  query,      // ✅ הוספה
  where       // ✅ הוספה
};

