import type { ConfigContext, ExpoConfig } from 'expo/config'

// One codebase, one app per school: the store name and the app id come from
// the build (eas.json profiles), the rest from app.json. The school's name and
// colour inside the app come from its database.
export default ({ config }: ConfigContext): ExpoConfig => {
  const appId = process.env.APP_ID || 'asia.miraischool.student'
  return {
    ...config,
    name: process.env.APP_NAME || config.name || 'Student App',
    slug: config.slug || 'student-app',
    ios: { ...config.ios, bundleIdentifier: appId, supportsTablet: true },
    android: { ...config.android, package: appId },
  }
}
