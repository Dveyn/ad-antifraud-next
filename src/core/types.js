/**
 * @typedef {Object} AntifraudConfig
 * @property {boolean} enabled
 * @property {number} blockThreshold
 * @property {number} softBlockThreshold
 * @property {string} internalSecret
 * @property {string} adminToken
 * @property {string[]} adLandingPaths
 * @property {{ short: { max: number, windowMs: number }, long: { max: number, windowMs: number } }} visitLimits
 * @property {string} cookieName
 * @property {string} visitCookieName
 * @property {number} cookieMaxAge
 * @property {string} logDir
 * @property {string} logFile
 * @property {number} maxLogLines
 * @property {number} blockIpDurationMs
 * @property {string} logApiPath
 * @property {string} reportApiPath
 * @property {string[]} skipPrefixes
 * @property {string} blockPageHtml
 * @property {string} fraudEventName
 * @property {string[]} middlewareMatcher
 */

export {};
