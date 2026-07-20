// =====================================================================
// CONFIGURACIÓN DE FIREBASE
// =====================================================================
// 1. Andá a https://console.firebase.google.com y creá un proyecto.
// 2. Dentro del proyecto: "Agregar app" → ícono </> (Web).
// 3. Copiá el objeto "firebaseConfig" que te muestra y pegalo abajo,
//    reemplazando estos valores de ejemplo.
// 4. Habilitá en el menú lateral:
//      - Authentication → Sign-in method → Email/contraseña → activar
//      - Firestore Database → Crear base de datos → modo producción
//      - Storage → Comenzar
// 5. Creá tu usuario administrador en Authentication → Users → "Agregar usuario"
//    (ese email/contraseña son los que vas a usar en "Entrar como administrador")
// 6. Copiá las reglas de seguridad que están en README.md dentro de
//    Firestore → Reglas, y de Storage → Reglas.
// =====================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

export const firebaseConfig = {
  apiKey: "AIzaSyBLqOPTbQUzmJseDkGgHViTTmDhwyWPgzs",
  authDomain: "ferena-79931.firebaseapp.com",
  projectId: "ferena-79931",
  storageBucket: "ferena-79931.firebasestorage.app",
  messagingSenderId: "350752373475",
  appId: "1:350752373475:web:9f0edfea75d8c4431663d6"
};

export const firebaseApp = initializeApp(firebaseConfig);
