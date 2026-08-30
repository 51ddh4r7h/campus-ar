export interface NetworkConnection {
  saveData?: boolean
  effectiveType?: string
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkConnection
}

/** Read the optional Network Information API without widening Navigator globally. */
export function getNetworkConnection(): NetworkConnection | undefined {
  if (!('connection' in navigator)) return undefined
  // SAFETY: the property check above gates this platform-specific Navigator extension.
  return (navigator as NavigatorWithConnection).connection
}
