// Wrapper fetch. Melempar error dengan properti code dan status.
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.message || 'Permintaan gagal');
    e.code = data.code;
    e.status = res.status;
    throw e;
  }
  return data;
}
