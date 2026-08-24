(function attachUltraContext(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = { readUltraContext: factory };
  else root.readUltraContext = factory;
})(typeof globalThis === 'object' ? globalThis : this, function readUltraContext(storage) {
  if (!storage || typeof storage.get !== 'function') return Promise.resolve({ ultraRunId: '', ultraRole: '' });
  return new Promise((resolve) => {
    try {
      storage.get(['ultraRunId', 'ultraRole'], (data) => resolve({ ultraRunId: data?.ultraRunId || '', ultraRole: data?.ultraRole || '' }));
    } catch (_) {
      resolve({ ultraRunId: '', ultraRole: '' });
    }
  });
});
