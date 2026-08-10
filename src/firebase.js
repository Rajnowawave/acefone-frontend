// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";


//Production Level 
const firebaseConfig = {
  apiKey: "AIzaSyA1Upb9-sjnw2Ay3HF7QhA7nD7J8CXeJs0",
  authDomain: "acefonecalling.firebaseapp.com",
  projectId: "acefonecalling",
  storageBucket: "acefonecalling.firebasestorage.app",
  messagingSenderId: "28245273807",
  appId: "1:28245273807:web:2344f04d928dfd01189bba",
  measurementId: "G-BFR0P3KQ8K"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const functions = getFunctions(app);
export const auth = getAuth(app);
export const storage = getStorage(app);