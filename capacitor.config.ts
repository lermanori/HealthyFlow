import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.healthyflow.mobile',
  appName: 'HealthyFlow',
  webDir: 'dist',
  backgroundColor: '#16181C',
  ios: {
    backgroundColor: '#16181C',
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  },
  plugins: {
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
    SplashScreen: {
      launchAutoHide: true,
      launchFadeOutDuration: 160,
      launchShowDuration: 800,
      backgroundColor: '#16181C',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
    },
  },
}

export default config
