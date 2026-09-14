export function isRemote(): boolean {
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1';
}

export function isLocal(): boolean {
  return !isRemote();
}
