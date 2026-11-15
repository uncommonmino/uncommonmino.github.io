/**
 * Firebase v10+ Modular SDK Configuration
 * Production-ready for GitHub Pages Static Hosting.
 */

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================================
// 1. OWNER / ADMIN CONFIGURATION (UID LOCK)
// ============================================================================
// Zero personal email exposure. Copy your Firebase Auth UID from:
// Firebase Console -> Authentication -> Users tab -> "User UID" column.
export const ADMIN_UID = "vmPKKqhHjjbH4PbqVWFmSVoRkJp1";

// ============================================================================
// 2. FIREBASE PROJECT CONFIGURATION
// ============================================================================
// Replace the values below with your Firebase Console credentials:
// (Firebase Console -> Project Settings -> General -> Your apps -> Web app)
export const firebaseConfig = {
  apiKey: "AIzaSyB6EvPqA4Gc1DiciBG_4QgNo7umTDmG_Ic",
  authDomain: "mino-portfolio-7c02c.firebaseapp.com",
  projectId: "mino-portfolio-7c02c",
  storageBucket: "mino-portfolio-7c02c.firebasestorage.app",
  messagingSenderId: "786307589134",
  appId: "1:786307589134:web:e922f77b68923c86f8c85f"
};

// Check if Firebase credentials have been supplied
export const isConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== "YOUR_API_KEY_HERE" &&
  !firebaseConfig.apiKey.includes("YOUR_")
);

// Initialize Firebase
let app = null;
let auth = null;
let db = null;
let initError = null;

if (isConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.error("Firebase initialization failed:", err);
    initError = err.message || String(err);
  }
}

export {
  app,
  auth,
  db,
  initError,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
};

// ============================================================================
// 3. SEED / FALLBACK SAMPLE VIDEOS
// ============================================================================
// Clean empty array - ready for real user portfolio videos
export const DEFAULT_SAMPLE_VIDEOS = [];
export const FALLBACK_VIDEOS = [];


