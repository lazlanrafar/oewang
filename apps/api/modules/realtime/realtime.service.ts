import { EventEmitter } from "node:events";

/**
 * RealtimeService - Handles internal event broadcasting for WebSockets.
 *
 * When a mutation occurs in any service, we call notifyValueChange().
 * The WebSocket handler in index.ts listens for these events and
 * broadcasts them to all connected clients in the workspace "room".
 */
export class RealtimeService {
  private static emitter = new EventEmitter();

  static events = {
    DATA_CHANGED: "data_changed",
  };

  /**
   * Notify that data has changed in a workspace.
   * @param workspaceId The workspace ID where the change occurred.
   * @param type The type of data that changed (e.g., "transactions", "wallets").
   */
  static notifyValueChange(workspaceId: string, type: string) {
    RealtimeService.emitter.emit(RealtimeService.events.DATA_CHANGED, {
      workspaceId,
      type,
    });
  }

  /**
   * Subscribe to data change events.
   * Used by the WebSocket server in index.ts.
   */
  static onDataChanged(
    callback: (payload: { workspaceId: string; type: string }) => void,
  ) {
    RealtimeService.emitter.on(RealtimeService.events.DATA_CHANGED, callback);
  }
}
