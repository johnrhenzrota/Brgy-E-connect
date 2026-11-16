import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBXEG_f9X05oxvtLHU_bVQPqZqN4sqI0y8",
  authDomain: "e-brgyconnect-fefa7.firebaseapp.com",
  projectId: "e-brgyconnect-fefa7",
  storageBucket: "e-brgyconnect-fefa7.firebasestorage.app",
  messagingSenderId: "998689052183",
  appId: "1:998689052183:web:3fca73019711c944fb2e52",
  measurementId: "G-HNVTK253PX"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);