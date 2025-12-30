/**
 * Cross-tab synchronization exports.
 */

export { LockManager, getLockManager, type LockMode, type LockOptions } from './locks.js';

// Alias for backward compatibility
export { getLockManager as createLockManager } from './locks.js';
export {
  Broadcaster,
  createBroadcaster,
  type BroadcastMessageType,
  type BroadcastMessage,
  type BroadcastListener,
} from './broadcast.js';
