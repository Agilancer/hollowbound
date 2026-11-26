// Image loading. Keys are paths under assets/ without '.png', e.g. 'world/decor'.

const images = new Map();
const wanted = new Set();

/** Declare an image a module will need; loadAll() fetches everything declared. */
export function need(...keys) {
  for (const k of keys) if (k) wanted.add(k);
  return keys[0];
}

export function img(key) {
  const im = images.get(key);
  if (!im) throw new Error(`image not loaded: ${key}`);
  return im;
}

export function has(key) { return images.has(key); }

function load(key) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => { images.set(key, im); resolve(); };
    im.onerror = () => { console.warn('missing image', key); resolve(); };
    im.src = `assets/${key}.png`;
  });
}

export async function loadAll(onProgress) {
  const keys = [...wanted].filter((k) => !images.has(k));
  let done = 0;
  // A few at a time so phones and the dev server aren't flooded.
  const queue = keys.slice();
  const worker = async () => {
    while (queue.length) {
      await load(queue.shift());
      done++;
      onProgress && onProgress(done / keys.length);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
}

/** Offscreen canvas helper. */
export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}
