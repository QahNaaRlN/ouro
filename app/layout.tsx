import type { Metadata } from 'next';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './globals.css';
export const metadata: Metadata = { title: 'Ouro — Human View', description: 'Ожидание, факты и решения человека. Прототип Ouro.' };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="ru" suppressHydrationWarning><body>{children}</body></html>;
}
