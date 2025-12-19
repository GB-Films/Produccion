# ProdBoard (static)

## Deploy en GitHub Pages
1) Subí estos archivos a un repo.
2) Repo > Settings > Pages.
3) "Deploy from a branch" y elegí `main` / `(root)` y Save. (Docs oficiales)  
   - Ver "Publishing from a branch" en GitHub Pages.  

## JSONBin
- Read: GET https://api.jsonbin.io/v3/b/<BIN_ID>/latest
- Update: PUT https://api.jsonbin.io/v3/b/<BIN_ID>
Headers: X-Access-Key (recomendado) o X-Master-Key, + Content-Type: application/json para PUT.

En la app: Sync/Ajustes -> pegás BIN ID + Access Key -> Probar conexión -> Pull/Push.
