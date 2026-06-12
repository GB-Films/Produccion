// Firebase client config for GB Production Board.
// Fill these values from Firebase Console > Project settings > Your apps > Web app.
// The app works in local-only mode until apiKey/projectId/appId are configured.
window.GB_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "produccion-pdr.firebaseapp.com",
  projectId: "produccion-pdr",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

window.GB_FIREBASE_COLLECTION = "production_projects";

// Enable this only if Firebase Authentication > Anonymous sign-in is enabled
// and your Firestore rules require request.auth != null.
window.GB_FIREBASE_OPTIONS = {
  useAnonymousAuth: true
};
