// Environment variable validation
export function validateEnv() {
  const requiredEnvVars = {
    MASSIVE_API_KEY: process.env.MASSIVE_API_KEY,
  }

  const missing = Object.entries(requiredEnvVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key)

  return {
    isValid: missing.length === 0,
    missing,
  }
}

export function getEnvConfig() {
  return {
    massiveApiKey: process.env.MASSIVE_API_KEY,
  }
}
