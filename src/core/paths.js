// Asset URLs resolve from the repo root wherever the page lives.
export const ASSETS = new URL('../../assets/', import.meta.url).href;
export const asset = (p) => ASSETS + p;
