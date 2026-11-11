import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'it.ictgroup.rda.app',
  appName: 'Eggs-rda',
  webDir: 'www',
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
