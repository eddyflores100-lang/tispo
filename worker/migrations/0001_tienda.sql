CREATE TABLE IF NOT EXISTS pedidos (
  referencia TEXT PRIMARY KEY,
  llave_hash TEXT NOT NULL UNIQUE,
  solicitud_hash TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('encargo','directo')),
  estado TEXT NOT NULL CHECK(estado IN ('recibido','oferta','confirmado','despachado','entregado','cancelado')),
  nombre TEXT NOT NULL,
  contacto TEXT NOT NULL,
  ciudad TEXT NOT NULL,
  direccion TEXT NOT NULL DEFAULT '',
  articulos TEXT NOT NULL CHECK(json_valid(articulos)),
  subtotal INTEGER NOT NULL CHECK(subtotal>=0),
  precio_final INTEGER,
  envio INTEGER,
  nota TEXT NOT NULL DEFAULT '',
  enlace_pago TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  prueba INTEGER NOT NULL DEFAULT 0,
  creado INTEGER NOT NULL DEFAULT(unixepoch())
);
CREATE INDEX IF NOT EXISTS pedidos_fecha ON pedidos(creado DESC);
CREATE INDEX IF NOT EXISTS pedidos_contacto ON pedidos(contacto, creado);
CREATE TABLE IF NOT EXISTS inventario (
  producto TEXT NOT NULL,
  talla TEXT NOT NULL,
  precio INTEGER NOT NULL CHECK(precio>0),
  unidades INTEGER NOT NULL CHECK(unidades>=0),
  PRIMARY KEY(producto,talla)
);
CREATE TABLE IF NOT EXISTS entrega (
  id INTEGER PRIMARY KEY CHECK(id=1),
  ciudad TEXT NOT NULL DEFAULT '',
  tarifa INTEGER NOT NULL DEFAULT 0 CHECK(tarifa>=0),
  habilitado INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO entrega(id) VALUES(1);
CREATE TABLE IF NOT EXISTS accesos_de_gestion (
  enlace_privado TEXT PRIMARY KEY,
  caduca INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sesiones_de_gestion (
  llave_hash TEXT PRIMARY KEY,
  caduca INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS reservar_directo AFTER INSERT ON pedidos
WHEN NEW.tipo='directo'
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM entrega WHERE id=1 AND habilitado=1
      AND ciudad=NEW.ciudad COLLATE NOCASE AND tarifa=NEW.envio
  ) THEN RAISE(ABORT,'entrega_cambio') END;
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM json_each(NEW.articulos) a
    LEFT JOIN inventario i ON i.producto=json_extract(a.value,'$.id') AND i.talla=json_extract(a.value,'$.size')
    WHERE i.producto IS NULL OR i.unidades<json_extract(a.value,'$.qty') OR i.precio<>json_extract(a.value,'$.unit')
  ) THEN RAISE(ABORT,'stock_cambio') END;
  UPDATE inventario SET unidades=unidades-(
    SELECT json_extract(a.value,'$.qty') FROM json_each(NEW.articulos) a
    WHERE producto=json_extract(a.value,'$.id') AND talla=json_extract(a.value,'$.size')
  ) WHERE EXISTS(SELECT 1 FROM json_each(NEW.articulos) a WHERE producto=json_extract(a.value,'$.id') AND talla=json_extract(a.value,'$.size'));
END;
CREATE TRIGGER IF NOT EXISTS devolver_stock AFTER UPDATE OF estado ON pedidos
WHEN OLD.tipo='directo' AND OLD.estado='confirmado' AND NEW.estado='cancelado'
BEGIN
  UPDATE inventario SET unidades=unidades+(
    SELECT json_extract(a.value,'$.qty') FROM json_each(NEW.articulos) a
    WHERE producto=json_extract(a.value,'$.id') AND talla=json_extract(a.value,'$.size')
  ) WHERE EXISTS(SELECT 1 FROM json_each(NEW.articulos) a WHERE producto=json_extract(a.value,'$.id') AND talla=json_extract(a.value,'$.size'));
END;
