import type { Metadata } from 'next';
import packageInfo from '../package.json';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './globals.css';
export const metadata: Metadata = { title: 'Ouro — проекты и агенты', description: 'Дорожные карты, процессы, факты агентов и решения человека в реальном времени.', icons: {icon: {url:`/icon.svg?v=${packageInfo.version}`,type:'image/svg+xml'}} };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="ru" suppressHydrationWarning><body>{children}</body></html>;
}
