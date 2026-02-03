const LEVELS = ['debug', 'info', 'warn', 'error'];

function createLogger(level = process.env.LOG_LEVEL || 'info') {
  const levelIndex = LEVELS.indexOf(level);
  const shouldLog = (lvl) => LEVELS.indexOf(lvl) >= levelIndex;

  return {
    debug: (...args) => shouldLog('debug') && console.log('🐛', ...args),
    info: (...args) => shouldLog('info') && console.log('ℹ️', ...args),
    warn: (...args) => shouldLog('warn') && console.warn('⚠️', ...args),
    error: (...args) => shouldLog('error') && console.error('❌', ...args),
  };
}

module.exports = { createLogger, LEVELS };
