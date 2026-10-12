(function (root) {
  'use strict';
  function create(seed) {
    const text = String(seed);
    let hash = 2166136261;
    for (const character of text) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    return { algorithm: 'mulberry32-v1', seed: text, value: hash, calls: 0 };
  }
  function draw(rng) {
    const value = (rng.value + 0x6D2B79F5) >>> 0;
    let n = Math.imul(value ^ (value >>> 15), value | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return { number: ((n ^ (n >>> 14)) >>> 0) / 4294967296, rng: { ...rng, value, calls: rng.calls + 1 } };
  }
  const api = { create, draw };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CampusRandom = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
