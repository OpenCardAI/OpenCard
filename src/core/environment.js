/**
 * Environment detection utilities for seamless dev/prod client resolution
 */

/**
 * Detects if we're running in a development environment
 * @returns {boolean} True if development, false if production
 */
export function isDevelopmentEnvironment() {
  if (typeof window === 'undefined') {
    return false; // Server-side, assume production
  }

  const hostname = window.location.hostname;

  // Development indicators
  const devHostnames = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0'
  ];

  // Check for development hostnames
  if (devHostnames.includes(hostname)) {
    return true;
  }

  // Check for local IP addresses (192.168.x.x, 10.x.x.x, etc.)
  if (hostname.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.)/)) {
    return true;
  }

  // Check for development domains (*.local, *.dev, *.test)
  if (hostname.match(/\.(local|dev|test)$/)) {
    return true;
  }

  // Check common development ports
  const port = window.location.port;
  const devPorts = ['3000', '3001', '4000', '5173', '8080', '8000', '9000'];
  if (port && devPorts.includes(port)) {
    return true;
  }

  return false;
}

/**
 * Resolves the appropriate client ID based on environment
 * @param {string} baseClientId - Base client ID (e.g., "myapp")
 * @returns {string} Environment-specific client ID (e.g., "myapp_dev" or "myapp_prod")
 */
export function resolveClientId(baseClientId) {
  if (!baseClientId) {
    return baseClientId;
  }

  // If already suffixed with _dev or _prod, return as-is
  if (baseClientId.endsWith('_dev') || baseClientId.endsWith('_prod')) {
    return baseClientId;
  }

  const isDev = isDevelopmentEnvironment();
  return isDev ? `${baseClientId}_dev` : `${baseClientId}_prod`;
}

/**
 * Resolves the appropriate auth URL based on environment
 * @param {string} [customAuthUrl] - Custom auth URL if provided
 * @returns {string} Environment-specific auth URL
 */
export function resolveAuthUrl(customAuthUrl) {
  if (customAuthUrl) {
    return customAuthUrl; // Use custom URL if provided
  }

  const isDev = isDevelopmentEnvironment();
  return isDev ? 'https://auth-dev.opencard.ai' : 'https://auth.opencard.ai';
}

/**
 * Gets environment info for debugging
 * @returns {object} Environment detection details
 */
export function getEnvironmentInfo() {
  if (typeof window === 'undefined') {
    return { environment: 'server', isDevelopment: false };
  }

  return {
    environment: isDevelopmentEnvironment() ? 'development' : 'production',
    isDevelopment: isDevelopmentEnvironment(),
    hostname: window.location.hostname,
    port: window.location.port,
    origin: window.location.origin
  };
}