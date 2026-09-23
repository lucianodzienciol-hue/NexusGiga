import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestSlug } from './wizard-slug.mjs';

function validSlug(s) {
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(String(s || '').toLowerCase().trim());
}

test('sugiere slug desde el nombre del comercio', () => {
  assert.equal(suggestSlug('Kiosco Don Pepe'), 'kiosco-don-pepe');
  assert.equal(suggestSlug('Malcriado Vinos!'), 'malcriado-vinos');
});

test('vacio o sin letrasedade vuelve vacio', () => {
  assert.equal(suggestSlug(''), '');
  assert.equal(suggestSlug('!!!'), '');
});

test('lo sugerido siempre pasa validSlug', () => {
  for (const n of ['A Ñoños 123', '  Espacios  ', 'Café-Bar_El Centro']) {
    const s = suggestSlug(n);
    assert.ok(validSlug(s), n + ' -> ' + s);
  }
});
