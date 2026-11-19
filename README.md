# Tispo · Tienda de ropa americana

**[Abrir tienda](https://tispo.eddyflores100.workers.dev/)** · **[Acceso desde GitHub Pages](https://eddyflores100-lang.github.io/tispo/)** · **[Panel de gestión](https://tispo.eddyflores100.workers.dev/gestion.html)**

Tienda en español con doce referencias de lanzamiento, categorías, colecciones, búsqueda por color o corte, favoritos locales y compra rápida por talla. La bolsa conserva cantidades y variantes en el dispositivo. El asesor consulta el mismo catálogo que el escaparate.

## Comprar

1. El cliente elige las prendas y tallas. El checkout valida nombre, ciudad, contacto y bolsa. Cloudflare calcula los importes del lado del servidor y guarda el pedido en D1.
2. **Por encargo:** los precios iniciales son orientativos y las fotografías son referencias generadas. El comercio verifica disponibilidad, publica precio final y envío en el panel y avisa al cliente por su contacto. El comprador puede aceptar el total desde su comprobante privado. Opcionalmente el comercio facilita un enlace de pago propio. El sistema no recoge números de tarjeta ni marca como pagado un enlace abierto.
3. **Compra directa:** el comercio registra existencias y precio por talla y habilita contra entrega con ciudad y tarifa. Cuando toda la bolsa cumple esas condiciones, el checkout permite confirmar la compra. La reserva de stock y la creación del pedido son atómicas. Cancelar antes del despacho repone el stock. Esta modalidad se habilita únicamente con datos comerciales reales.
4. **Seguimiento:** el cliente conserva un enlace privado y puede consultar sus pedidos en ese dispositivo. Los pedidos no se publican en GitHub. La tienda no envía correos o mensajes de forma automática.

## Acceso del comercio

El panel solo autentica en el dominio del Worker. En Cloudflare → D1 → **tispo-pedidos** → **Explore Data**, abre la tabla **accesos_de_gestion** y visita el valor de **enlace_privado**. La activación consume el enlace y crea una sesión privada de 30 días en ese navegador. En caso de pérdida o para otro dispositivo, alguien con acceso administrativo a esa base puede ejecutar en su consola:

```sql
INSERT INTO accesos_de_gestion(enlace_privado,caduca)
VALUES ('https://tispo.eddyflores100.workers.dev/gestion.html#acceso=' || lower(hex(randomblob(24))), unixepoch()+86400);
```

Abre el enlace recién creado desde la tabla. Caduca en 24 horas. Mantén estos enlaces en el área privada de Cloudflare. El panel permite ver pedidos, publicar propuestas, actualizar despacho, registrar unidades por talla y configurar cobertura de pago contra entrega.

## Código y despliegue

- `public/`: tienda estática y panel. `public/catalog.json` contiene la selección base, las tallas de referencia y precios orientativos en centavos de USD. Las imágenes de campaña y producto son originales generadas para esta tienda.
- `worker/`: API de pedidos, asesor, gestión y migración D1. El comprador autentica el seguimiento con una llave aleatoria y el servidor guarda su hash. La gestión usa sesiones separadas. La base D1 queda restringida a la cuenta de Cloudflare.
- `node --test worker/test.mjs` con Node 24 ejecuta las pruebas con SQLite, incluidas idempotencia, stock, seguimiento, ofertas y controles de acceso.
- GitHub Actions prueba la tienda y publica el acceso de `pages/` al actualizar `main`. GitHub Pages conserva los enlaces anteriores y lleva al cliente a Cloudflare. La tienda comercial, sus imágenes, el checkout, el panel y la base de pedidos se sirven en Cloudflare. Para publicar en Cloudflare desde una sesión de Wrangler autorizada, ejecuta `npx wrangler d1 migrations apply tispo-pedidos --remote` y `npx wrangler deploy`. Los archivos del escaparate se despliegan junto al Worker mediante su binding ASSETS.
- Las licencias de las tipografías distribuidas se encuentran en `public/fonts/`.

## Referencias de compra

American Eagle Ecuador para categorías, talla y ordenación; Buck Mason para compra rápida en la colección. La identidad, la campaña y las fichas pertenecen al proyecto Tispo.
