import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        forest: {
          50: '#f0f7f2', 100: '#dcece1', 200: '#bad9c5', 300: '#8dbfa0', 400: '#5c9e76',
          500: '#3b8158', 600: '#2a6745', 700: '#225339', 800: '#1d432f', 900: '#183727', 950: '#0c1f16',
        },
        emerald: {
          50: '#ecfdf5', 100: '#d1fae5', 500: '#10b981', 600: '#059669', 700: '#047857',
        },
        gold: {
          50: '#fbf8ef', 100: '#f5eed6', 200: '#ebdcab', 300: '#dfc579', 400: '#d4ae52', 500: '#c4973a',
          600: '#a8792f', 700: '#875b28',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'var(--font-amiri)', 'serif'],
        amiri: ['var(--font-amiri)', 'serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 40, 28, 0.04), 0 4px 16px rgba(16, 40, 28, 0.06)',
      },
    },
  },
  plugins: [animate],
};

export default config;
