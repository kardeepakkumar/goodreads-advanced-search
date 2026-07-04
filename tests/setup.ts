import '@testing-library/jest-dom/vitest'

// src/lib/mongodb.ts throws at import time when MONGODB_URI is unset. Tests
// mock '@/lib/mongodb' and never connect; the placeholder only keeps an
// accidental unmocked import from crashing the whole suite.
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/vitest-placeholder'
