export const JOB_STEPS = ['build', 'deploy'];
export const A1_STEPS = ['validate', 'build', 'deploy'];

export function createJobStore() {
  const jobs = new Map();
  let seq = 0;
  function create(slug, type) {
    const id = 'job-' + (++seq) + '-' + Date.now().toString(36);
    const steps = type === 'create-org-repo' ? A1_STEPS : JOB_STEPS;
    const job = { id, slug, state: 'running', createdAt: Date.now(), finishedAt: 0,
      steps: steps.map((s) => ({ id: s, status: 'wait', detail: '' })), result: null, error: null, type: type || 'alta-full' };
    jobs.set(id, job);
    return job;
  }
  function get(id) { return jobs.get(id); }
  function step(id, stepId, status, detail) {
    const job = jobs.get(id);
    if (!job || job.state !== 'running') return false;
    const st = job.steps.find((s) => s.id === stepId);
    if (!st) return false;
    st.status = status;
    st.detail = String(detail || '');
    return true;
  }
  function finish(id, ok, result, error) {
    const job = jobs.get(id);
    if (!job || job.state !== 'running') return false;
    job.state = ok ? 'done' : 'error';
    job.result = result || null;
    job.error = error ? String(error) : null;
    job.finishedAt = Date.now();
    for (const s of job.steps) {
      if (s.status === 'run' || s.status === 'wait') { s.status = ok ? 'ok' : (s.status === 'run' ? 'fail' : s.status); }
    }
    return true;
  }
  function prune(maxAgeMs) {
    const out = [];
    for (const [id, job] of jobs) {
      if (job.state !== 'running' && Date.now() - job.finishedAt > maxAgeMs) { jobs.delete(id); out.push(id); }
    }
    return out;
  }
  return { create, get, step, finish, prune };
}
