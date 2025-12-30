/**
 * Cross-tab communication using BroadcastChannel.
 * Notifies other tabs of database changes for cache invalidation.
 */

/**
 * Message types for cross-tab communication.
 */
export type BroadcastMessageType =
  | 'document_added'
  | 'document_updated'
  | 'document_deleted'
  | 'documents_deleted'
  | 'collection_cleared'
  | 'database_cleared'
  | 'index_updated'
  | 'leader_elected'
  | 'leader_ping';

/**
 * Message payload for broadcast events.
 */
export interface BroadcastMessage {
  type: BroadcastMessageType;
  dbName: string;
  collectionId?: string;
  documentId?: string;
  documentIds?: string[];
  timestamp: number;
  tabId: string;
}

/**
 * Listener callback type.
 */
export type BroadcastListener = (message: BroadcastMessage) => void;

/**
 * Generate a unique tab ID.
 */
function generateTabId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Cross-tab broadcaster for database change notifications.
 */
export class Broadcaster {
  private channel: BroadcastChannel | null = null;
  private dbName: string;
  private tabId: string;
  private listeners: Map<BroadcastMessageType | '*', Set<BroadcastListener>> = new Map();
  private isLeader = false;
  private leaderHeartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(dbName: string) {
    this.dbName = dbName;
    this.tabId = generateTabId();

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`vectordb_${dbName}`);
      this.channel.onmessage = this.handleMessage.bind(this);
    }
  }

  /**
   * Check if BroadcastChannel is supported.
   */
  static isSupported(): boolean {
    return typeof BroadcastChannel !== 'undefined';
  }

  /**
   * Get this tab's unique ID.
   */
  getTabId(): string {
    return this.tabId;
  }

  /**
   * Check if this tab is the leader.
   */
  getIsLeader(): boolean {
    return this.isLeader;
  }

  /**
   * Handle incoming broadcast messages.
   */
  private handleMessage(event: MessageEvent<BroadcastMessage>): void {
    const message = event.data;

    // Ignore messages from self
    if (message.tabId === this.tabId) {
      return;
    }

    // Notify type-specific listeners
    const typeListeners = this.listeners.get(message.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(message);
        } catch (error) {
          console.error('Broadcast listener error:', error);
        }
      }
    }

    // Notify wildcard listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(message);
        } catch (error) {
          console.error('Broadcast listener error:', error);
        }
      }
    }
  }

  /**
   * Send a broadcast message to other tabs.
   */
  private send(type: BroadcastMessageType, data: Partial<BroadcastMessage> = {}): void {
    if (!this.channel) return;

    const message: BroadcastMessage = {
      type,
      dbName: this.dbName,
      timestamp: Date.now(),
      tabId: this.tabId,
      ...data,
    };

    this.channel.postMessage(message);
  }

  /**
   * Subscribe to broadcast messages.
   */
  on(type: BroadcastMessageType | '*', listener: BroadcastListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /**
   * Subscribe to all messages (alias for on('*', ...)).
   */
  onAny(listener: BroadcastListener): () => void {
    return this.on('*', listener);
  }

  // ============================================
  // Notification Methods
  // ============================================

  /**
   * Notify other tabs that a document was added.
   */
  notifyDocumentAdded(collectionId: string, documentId: string): void {
    this.send('document_added', { collectionId, documentId });
  }

  /**
   * Notify other tabs that a document was updated.
   */
  notifyDocumentUpdated(collectionId: string, documentId: string): void {
    this.send('document_updated', { collectionId, documentId });
  }

  /**
   * Notify other tabs that a document was deleted.
   */
  notifyDocumentDeleted(collectionId: string, documentId: string): void {
    this.send('document_deleted', { collectionId, documentId });
  }

  /**
   * Notify other tabs that multiple documents were deleted.
   */
  notifyDocumentsDeleted(collectionId: string, documentIds: string[]): void {
    this.send('documents_deleted', { collectionId, documentIds });
  }

  /**
   * Notify other tabs that a collection was cleared.
   */
  notifyCollectionCleared(collectionId: string): void {
    this.send('collection_cleared', { collectionId });
  }

  /**
   * Notify other tabs that the database was cleared.
   */
  notifyDatabaseCleared(): void {
    this.send('database_cleared');
  }

  /**
   * Notify other tabs that an index was updated.
   */
  notifyIndexUpdated(collectionId: string): void {
    this.send('index_updated', { collectionId });
  }

  // ============================================
  // Leader Election
  // ============================================

  /**
   * Start leader election.
   * The first tab to claim leadership wins.
   */
  async electLeader(): Promise<boolean> {
    if (!Broadcaster.isSupported()) {
      // Single tab mode, always leader
      this.isLeader = true;
      return true;
    }

    // Try to become leader using a simple timestamp-based approach
    // In a real implementation, you might use Web Locks for more robust election
    const electionKey = `vectordb_${this.dbName}_leader`;

    try {
      const stored = localStorage.getItem(electionKey);
      const now = Date.now();

      if (!stored) {
        // No leader, claim it
        localStorage.setItem(electionKey, JSON.stringify({ tabId: this.tabId, timestamp: now }));
        this.isLeader = true;
      } else {
        const { tabId, timestamp } = JSON.parse(stored);

        // If leader hasn't pinged in 10 seconds, take over
        if (now - timestamp > 10000) {
          localStorage.setItem(electionKey, JSON.stringify({ tabId: this.tabId, timestamp: now }));
          this.isLeader = true;
        } else if (tabId === this.tabId) {
          this.isLeader = true;
        }
      }

      if (this.isLeader) {
        this.startLeaderHeartbeat();
        this.send('leader_elected');
      }

      return this.isLeader;
    } catch {
      // localStorage might not be available
      this.isLeader = true;
      return true;
    }
  }

  /**
   * Start the leader heartbeat to maintain leadership.
   */
  private startLeaderHeartbeat(): void {
    if (this.leaderHeartbeatInterval) return;

    const electionKey = `vectordb_${this.dbName}_leader`;

    this.leaderHeartbeatInterval = setInterval(() => {
      if (this.isLeader) {
        try {
          localStorage.setItem(
            electionKey,
            JSON.stringify({ tabId: this.tabId, timestamp: Date.now() })
          );
          this.send('leader_ping');
        } catch {
          // Ignore localStorage errors
        }
      }
    }, 5000);
  }

  /**
   * Resign from leadership.
   */
  resignLeadership(): void {
    if (!this.isLeader) return;

    this.isLeader = false;

    if (this.leaderHeartbeatInterval) {
      clearInterval(this.leaderHeartbeatInterval);
      this.leaderHeartbeatInterval = null;
    }

    const electionKey = `vectordb_${this.dbName}_leader`;
    try {
      const stored = localStorage.getItem(electionKey);
      if (stored) {
        const { tabId } = JSON.parse(stored);
        if (tabId === this.tabId) {
          localStorage.removeItem(electionKey);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  /**
   * Close the broadcaster and clean up resources.
   */
  close(): void {
    this.resignLeadership();

    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    this.listeners.clear();
  }
}

/**
 * Create a new broadcaster for a database.
 */
export function createBroadcaster(dbName: string): Broadcaster {
  return new Broadcaster(dbName);
}
