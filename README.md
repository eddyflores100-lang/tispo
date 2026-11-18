# Tispo
Catálogo editorial de ropa americana en español. Primera selección con fotos de referencia, fichas, filtros y favoritos en el navegador. El asesor de estilo en Cloudflare Workers usa el catálogo para recomendar combinaciones y explicar cómo medir prendas.

## Desarrollo y publicación
Sirve public/ con un servidor HTTP para revisar la tienda. Ejecuta `node --test worker/test.mjs` con Node 22. Publica el Worker y los archivos de public/ con `npx wrangler deploy`. Para GitHub Pages, selecciona GitHub Actions como origen. El flujo en .github/workflows/pages.yml publica public/ al actualizar main. El agente permite el origen eddyflores100-lang.github.io.

## Colección
Edita public/catalog.json y public/photos.json para introducir el inventario real. La edición de apertura muestra fotografías ilustrativas. Los guardados son locales. No se ofrecen reservas, cobros ni stock hasta que la marca confirme las condiciones comerciales.

## Referencias
Buck Mason, portada y lookbook (https://www.buckmason.com/men), y Taylor Stitch, clasificación y fichas (https://www.taylorstitch.com/collections/mens-new-arrivals). Diseño y textos de Tispo. Fotografía de referencia en Unsplash: hero photo-1516257984-b1b4d707412e, chaqueta photo-1543076447-215ad9ba6923, jeans photo-1576995853123-5a10305d93c0, camiseta photo-1521572163474-6864f9cf17ab y detalle photo-1542272604-787c3835535d.
