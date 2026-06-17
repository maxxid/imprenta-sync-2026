let _shop = null;
let _shopId = null;

export function setShop(shop) {
  _shop = shop;
  _shopId = shop?.id || null;
}

export function getShop() {
  return _shop;
}

export function getShopId() {
  return _shopId;
}

export function isShopLoaded() {
  return _shop !== null;
}
