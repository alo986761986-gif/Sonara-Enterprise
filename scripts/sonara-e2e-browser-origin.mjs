const nativeFetch = globalThis.fetch.bind(globalThis);
const OFFICIAL_ORIGIN = 'https://sonaraenterprise.com';

globalThis.fetch = (input, init = {}) => {
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  if (!headers.has('Origin')) headers.set('Origin', OFFICIAL_ORIGIN);
  return nativeFetch(input, { ...init, headers });
};
