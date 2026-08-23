(() => {
  const host = window.location.hostname.toLowerCase();
  const isProductionSite =
    host === 'sonaraenterprise.com' || host === 'www.sonaraenterprise.com';

  if (!isProductionSite || typeof window.fetch !== 'function') return;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);

    try {
      const request = args[0];
      const rawUrl =
        typeof request === 'string