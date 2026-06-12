# Firebase setup

## Datos que necesito

Pasame estos valores de Firebase Console > Project settings > Your apps > Web app:

- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

Con eso se completa `js/firebase-config.js`.

## Firestore

La app usa esta estructura:

```text
production_projects/{projectId}
production_projects/{projectId}/data/core
production_projects/{projectId}/data/script
```

El documento `core` guarda plan, crew, dias y configuracion general. El documento `script` guarda escenas y guion procesado para evitar un unico documento demasiado grande.

## Reglas

El archivo `firebase.rules` deja leer/escribir solo a usuarios autenticados. Para usarlo sin pantalla de login, activa Firebase Authentication > Anonymous.

Para una instalacion privada real conviene cambiar a email/password con lista de usuarios autorizados. El password de edicion de la app solo bloquea botones en el cliente; no es seguridad de backend.

## Modo local

Si `js/firebase-config.js` no tiene config, la app funciona igual en local. Los proyectos creados en ese modo quedan en `localStorage` y se muestran como `(local)`.
