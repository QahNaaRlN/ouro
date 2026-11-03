import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { createWebRouter } from '../app/router';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@/app/tailwind.css';
import '@/app/theme.css';
import '@/app/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Ouro root element is missing.');
createRoot(root).render(<StrictMode><RouterProvider router={createWebRouter()} /></StrictMode>);
