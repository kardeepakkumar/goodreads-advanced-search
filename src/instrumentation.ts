export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[instrumentation] Starting background ticker…')
    const { startBackgroundTicker } = await import('./lib/autoTicker')
    startBackgroundTicker()
  }
}
