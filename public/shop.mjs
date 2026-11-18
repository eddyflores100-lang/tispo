export const API = 'https://tispo.eddyflores100.workers.dev';
export const normalize = value => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const money = value => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD',minimumFractionDigits:value % 100 ? 2 : 0,maximumFractionDigits:2}).format(value / 100);
export const imagePath = id => './img/productos/' + id + '.webp';
export const variantKey = (id,size) => id + '/' + size;
export const labels = {recibido:'Pedido recibido',oferta:'Precio final disponible',confirmado:'Pedido confirmado',despachado:'En camino',entregado:'Entregado',cancelado:'Cancelado'};
export function variantMap(rows) {
  return new Map(rows.map(v => [variantKey(v.producto,v.talla),v]));
}
export function categoryFit(category) {
  if (['Jeans','Pantalones','Faldas'].includes(category)) return 'Mide la cintura de una prenda similar, extendida y abotonada, de lado a lado. En un pantalón mide también la entrepierna. Las tallas numéricas son referencias de cintura en pulgadas.';
  if (category === 'Chaquetas') return 'Mide una chaqueta que te quede bien, de axila a axila y de hombro a hombro. Deja espacio para la capa que sueles llevar debajo.';
  return 'Extiende una prenda que te quede bien y mide de axila a axila. Mide también desde el hombro hasta el bajo. El ajuste puede variar según la referencia.';
}
export function unitFor(product, row) {
  return row && row.unidades > 0 ? row.precio : product.base;
}
export function searchable(product) {
  return normalize([product.name,product.department,product.category,product.color,product.cut,product.description].join(' '));
}
