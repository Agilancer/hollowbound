// Element colours, from Velscour's src/gfx/vfx.js.
export const ELEM = {
  phys: { name: 'Physical', core: '#ffffff', glow: '#e0d8c8', dark: '#7a7060', sfx: 'phys' },
  fire: { name: 'Fire', core: '#fff3a0', glow: '#ff7a10', dark: '#c02000', sfx: 'fire' },
  cold: { name: 'Cold', core: '#f0ffff', glow: '#60c8ff', dark: '#1a50d0', sfx: 'cold' },
  light: { name: 'Lightning', core: '#ffffff', glow: '#a8ccff', dark: '#4a64ff', sfx: 'light' },
  poison: { name: 'Poison', core: '#e8ff90', glow: '#70e020', dark: '#206010', sfx: 'poison' },
  arcane: { name: 'Arcane', core: '#ffe0ff', glow: '#c060ff', dark: '#5a10c0', sfx: 'arcane' },
  holy: { name: 'Holy', core: '#fffff0', glow: '#ffd860', dark: '#d08a00', sfx: 'holy' },
  shadow: { name: 'Shadow', core: '#e8c0ff', glow: '#9030d0', dark: '#280038', sfx: 'shadow' },
  blood: { name: 'Blood', core: '#ffa0a0', glow: '#e01010', dark: '#5a0000', sfx: 'blood' },
  acid: { name: 'Acid', core: '#d8f0ff', glow: '#3a8cff', dark: '#0c2aa0', sfx: 'acid' },
  astral: { name: 'Arcane', core: '#f2fbff', glow: '#4aa8ff', dark: '#1430a0', sfx: 'arcane' },
};
export const elem = (k) => ELEM[k] || ELEM.phys;
