import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobStore, JOB_STEPS } from './wizard-jobs.mjs';

test('create inicializa pasos en espera', () => {
  const store = createJobStore();
  const job = store.create('kiosco-test');
  assert.equal(job.state, 'running');
  assert.equal(job.slug, 'kiosco-test');
  assert.equal(job.steps.length, JOB_STEPS.length);
  assert.deepEqual(job.steps.map((s) => s.status), JOB_STEPS.map(() => 'wait'));
  assert.deepEqual(JOB_STEPS, ['build','deploy']);
});

test('step y finish actualizan el job', () => {
  const store = createJobStore();
  const job = store.create('kiosco-test');
  store.step(job.id, JOB_STEPS[0], 'ok', 'build ok');
  assert.equal(store.get(job.id).steps[0].status, 'ok');
  store.finish(job.id, true, { url: 'https://x/' }, null);
  const done = store.get(job.id);
  assert.equal(done.state, 'done');
  assert.equal(done.result.url, 'https://x/');
});

test('get con id desconocido devuelve undefined y prune limpia terminados viejos', () => {
  const store = createJobStore();
  assert.equal(store.get('nope'), undefined);
  const job = store.create('a');
  store.finish(job.id, true, {}, null);
  job.finishedAt = Date.now() - 7200000;
  assert.equal(store.prune(3600000).length, 1);
  assert.equal(store.get(job.id), undefined);
});
