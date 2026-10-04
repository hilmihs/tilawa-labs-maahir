import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
        'muted-2': 'var(--muted-2)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        line: 'var(--line)',
        'line-2': 'var(--line-2)',
        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        hijau: 'var(--hijau)',
        'hijau-ink': 'var(--hijau-ink)',
        kuning: 'var(--kuning)',
        'kuning-ink': 'var(--kuning-ink)',
        merah: 'var(--merah)',
        'merah-ink': 'var(--merah-ink)',
        danger: 'var(--merah-ink)',
        success: 'var(--hijau-ink)',
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },
      screens: {
        xs: '380px',
      },
    },
  },
  plugins: [],
};

export default config;
