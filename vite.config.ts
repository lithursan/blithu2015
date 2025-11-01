// vite.config.js

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
        define: {
            // Note: process.env is usually not defined in Vite client-side code.
            // Using import.meta.env is the standard Vite approach.
            'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
            'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            }
        },
        plugins: [
            VitePWA({
                registerType: 'autoUpdate',
                injectRegister: 'auto',
                manifest: {
                    name: 'Shivam Distributor Dashboard',
                    short_name: 'Shivam',
                    description: 'Distributor dashboard PWA',
                    start_url: '/',
                    display: 'standalone',
                    theme_color: '#0f172a',
                    background_color: '#ffffff',
                    icons: [
                        {
                            src: '/pwa-192.png',
                            sizes: '192x192',
                            type: 'image/png'
                        },
                        {
                            src: '/pwa-512.png',
                            sizes: '512x512',
                            type: 'image/png'
                        }
                    ]
                }
            })
        ],
        
        // 🎯 FIX: Add this build configuration to enable Top-Level await support
        // ES2022 is the first ECMAScript version to officially support this feature.
        build: {
            target: 'es2022', // or 'esnext'
        }
    };
});