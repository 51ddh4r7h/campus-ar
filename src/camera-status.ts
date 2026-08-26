/**
 * Runtime decoding for the 8th Wall engine's `onCameraStatusChange` payload.
 *
 * The engine hands this callback either a bare status string or a detail
 * object; this is the single I/O-boundary guard both consumers share.
 */
import type {XrCameraStatusData, XrCameraStatusDetail} from './types/xr8'

export const isCameraStatusDetail = (payload: XrCameraStatusData): payload is XrCameraStatusDetail =>
  payload !== null && typeof payload === 'object'
