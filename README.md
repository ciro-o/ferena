# Ferena — sitio de catálogo

Sitio estático (HTML/CSS/JS puro, sin build) para mostrar el stock de Ferena.
Invitados ven el catálogo. El administrador entra con email y contraseña y
puede agregar, editar y borrar prendas con foto — se guarda en Firebase y
se ve al instante para todos los que entren.

No usa Firebase Storage (ese servicio pide tarjeta aunque no cobre dentro
de la cuota gratis). En cambio, cada foto se comprime en el navegador y se
guarda como texto dentro del mismo documento de Firestore — así todo queda
100% dentro del plan gratis "Spark", sin cargar ninguna tarjeta.

## Archivos

- `index.html` — estructura de la página
- `styles.css` — todo el diseño
- `app.js` — lógica: login, catálogo en tiempo real, alta/edición/borrado
- `firebase-config.js` — acá van tus claves de Firebase (ver paso 1)

## 1. Crear el proyecto de Firebase (una sola vez)

1. Entrá a https://console.firebase.google.com → **Agregar proyecto** → seguí los pasos (podés desactivar Google Analytics, no lo necesitás).
2. Dentro del proyecto, hacé clic en el ícono **</>** ("Agregar app" → Web) y registrá la app. Te va a mostrar un bloque `firebaseConfig = {...}`.
3. Copiá esos valores dentro de `firebase-config.js`, reemplazando los que dicen `TU_API_KEY`, `TU_PROYECTO`, etc.
4. En el menú lateral de Firebase, activá estos dos servicios:
   - **Authentication** → pestaña "Sign-in method" → habilitar **Email/contraseña**.
   - **Firestore Database** → "Crear base de datos" → modo producción → elegí una región (ej. `southamerica-east1`).

   (No hace falta activar Storage — las fotos se guardan comprimidas dentro de Firestore.)

## 2. Crear tu usuario administrador

En **Authentication → Users → "Agregar usuario"**, cargá el email y contraseña
que vas a usar vos (o quien administre) para entrar como Administrador en el
sitio. Podés crear más de uno si hay varios administradores.

## 3. Reglas de seguridad

Por defecto, "modo producción" bloquea todo. Tenés que pegar estas reglas
para que cualquiera pueda **leer** el catálogo, pero solo un administrador
logueado pueda **escribir**.

### Firestore → pestaña "Reglas"

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /productos/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /etiquetas/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

Guardá (Publicar).

## 4. Probar en tu computadora

No hace falta ningún servidor especial, pero los navegadores bloquean los
módulos de JS si abrís el `index.html` directo con doble clic. Usá un
servidor simple, por ejemplo con Python (ya viene instalado en la mayoría
de las PCs):

```
cd ferena
python3 -m http.server 8000
```

Y abrís `http://localhost:8000` en el navegador.

## 5. Subir a GitHub y publicar en Vercel

1. Creá un repo en GitHub y subí esta carpeta (`git init`, `git add .`, `git commit`, `git push`).
2. Entrá a https://vercel.com → **Add New Project** → importá el repo.
3. Como es HTML puro, Vercel lo detecta solo: dejá "Framework Preset" en
   **Other**, no hace falta build command ni output directory.
4. **Deploy**. Listo, te da una URL pública.

(También podés usar GitHub Pages: Settings → Pages → elegir la rama `main`
como fuente. Cualquiera de las dos opciones funciona, porque todo el sitio
son archivos estáticos — la parte dinámica la maneja Firebase.)

## Notas

- Las etiquetas ahora se organizan en 3 categorías fijas: **Talle, Marca y
  Tipo**. Al crear una etiqueta desde "Gestionar etiquetas" elegís a cuál
  categoría pertenece, y en el filtro del catálogo aparece un desplegable
  por cada categoría (solo se muestran las que ya tienen etiquetas
  cargadas).
- Cada prenda puede tener un "Link de compra" opcional (por ejemplo, tu
  WhatsApp, Instagram o Mercado Libre). Si lo cargás, aparece un botón
  "Comprar" en la tarjeta y en el detalle que abre ese link en una pestaña
  nueva. Si lo dejás vacío, no se muestra ningún botón.
- Las fotos se comprimen automáticamente en el navegador antes de guardarse
  (se achican a un ancho máximo razonable para catálogo). Si alguna imagen
  da error por "muy pesada", probá con una foto de menor resolución.
- El plan gratis de Firestore alcanza de sobra para un catálogo de
  indumentaria: 1GB de almacenamiento y una cuota diaria de lecturas/
  escrituras muy generosa para el tráfico de un sitio como este.
- Si en algún momento querés más de un administrador, sumá más usuarios en
  Authentication → Users; no hace falta tocar código.
- El botón "Cambiar rol" del header cierra la sesión de administrador (si
  había una) y vuelve a mostrar la pantalla de entrada.
