import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.terratone.app',
  appName: 'TerraTone',
  webDir: 'dist',
  backgroundColor: '#050b1a',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#050b1a',
  },
  ios: {
    backgroundColor: '#050b1a',
  },
};

export default config;
