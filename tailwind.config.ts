import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Custom zinc-based dark palette
        surface: {
          DEFAULT: '#18181b', // zinc-900
          raised: '#27272a',  // zinc-800
          overlay: '#3f3f46', // zinc-700
        },
      },
    },
  },
  plugins: [],
}

export default config
