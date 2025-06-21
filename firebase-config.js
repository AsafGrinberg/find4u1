// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyD6o0oDX5ahIw-7E0tUy76ImJDCFWbv4x8",
  authDomain: "find4u-il.firebaseapp.com",
  projectId: "find4u-il",
  storageBucket: "find4u-il.appspot.com",
  messagingSenderId: "1063243167726",
  appId: "1:1063243167726:web:16a8bbaf73ed8181e680ff",
  measurementId: "G-SYR49CZGZZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

export { auth, provider };
