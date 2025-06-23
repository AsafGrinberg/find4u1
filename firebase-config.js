// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCwpXCeGMYK10KvU8JJ5uES5DJSG0Sq6jU",
  authDomain: "find4u-il-aefd0.firebaseapp.com",
  projectId: "find4u-il-aefd0",
  storageBucket: "find4u-il-aefd0.firebasestorage.app",
  messagingSenderId: "387851265240",
  appId: "1:387851265240:web:ff3692945470dcab31a3ad"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };
