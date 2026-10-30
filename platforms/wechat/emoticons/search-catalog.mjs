/** Boundary: local built-in title/English/token search only; never contacts the online sticker service. */
export function searchCatalog(items, query = '') {
  const term = String(query).trim().normalize('NFC').toLocaleLowerCase().slice(0, 80);
  return items.filter(item => !term || [item.title, item.english, item.token]
    .some(value => value.toLocaleLowerCase().includes(term))).map(item => ({ ...item }));
}
