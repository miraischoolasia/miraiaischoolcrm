// Features that only some schools use. A school's own Vercel project switches a feature on with
// VITE_FEATURE_<NAME>=true; a feature that is not set stays off, so a new feature reaches no school until
// that school asks for it. Add one line to `features` per feature, then wrap its screen in `features.<name>`.
//
// Vercel reads these when it builds, so a change needs a new deployment of that school's project.
export function isFeatureOn(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true'
}

export const features = {
  // newReport: isFeatureOn(import.meta.env.VITE_FEATURE_NEW_REPORT),
}
