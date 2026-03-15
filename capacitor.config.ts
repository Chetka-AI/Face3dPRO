import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.face3dpro.mobile',
  appName: 'Face3D Pro',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
