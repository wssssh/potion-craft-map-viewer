const jsonCache = new Map();
const imageCache = new Map();
export function loadJson(name) {
  if (!jsonCache.has(name)) jsonCache.set(name, fetch(`/data/${name}`).then(r => {if (!r.ok) throw new Error(`无法读取 ${name}`); return r.json();}).catch(e=>{jsonCache.delete(name);throw e;}));
  return jsonCache.get(name);
}
export function loadImage(name) {
  if (!imageCache.has(name)) imageCache.set(name, new Promise((resolve, reject) => {const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`无法读取图片 ${name}`)); image.src = `/data/${name}`;}).catch(e=>{imageCache.delete(name);throw e;}));
  return imageCache.get(name);
}
export async function loadMap(id, onProgress) {
  const [map, catalog] = await Promise.all([loadJson(`${id}-tiles.json`), loadJson('icons.json')]);
  const files = [...new Set(Object.values(map.overlaySprites).map(s=>s.url)),'effect-slot.webp','name-label-background.webp',...map.effects.map(e=>catalog.icons[e.id].url)];
  let complete = 0;
  const entries = await Promise.all(files.map(async name=> {const img=await loadImage(name); onProgress?.(++complete / files.length); return [name,img];}));
  await document.fonts.load('700 16px PotionCraftLabel');
  return {map, catalog, images:new Map(entries)};
}
