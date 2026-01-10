import { createClient, WebDAVClient } from 'webdav';
import { BoardData } from './file-manager';

interface WebDAVConfig {
    url: string;
    username?: string;
    password?: string;
}

type BackupState = {
    pending: BoardData | null;
    timer: ReturnType<typeof setTimeout> | null;
    inFlight: Promise<void> | null;
};

export class WebDAVService {
    private client: WebDAVClient | null = null;
    private config: WebDAVConfig | null = null;
    private baseDir = '/drawnix/boards';
    private ensureBaseDirectoryPromise: Promise<boolean> | null = null;
    private backupStates = new Map<string, BackupState>();
    private backupDebounceMs = 1500;

    constructor() {
        this.initialize();
    }

    private initialize(): void {
        // Load configuration from environment variables
        const url = import.meta.env.VITE_WEBDAV_URL;

        if (!url) {
            console.log('[WebDAV] No WebDAV URL configured, backup disabled');
            return;
        }

        this.config = {
            url,
            username: import.meta.env.VITE_WEBDAV_USERNAME,
            password: import.meta.env.VITE_WEBDAV_PASSWORD || '',
        };

        try {
            // 开发环境使用代理，绕过CORS
            const isDev = import.meta.env.DEV;
            const clientUrl = isDev ? '/webdav-proxy' : this.config.url;

            this.client = createClient(clientUrl, {
                username: this.config.username,
                password: this.config.password,
            });
            console.log(`[WebDAV] Client initialized successfully (${isDev ? 'via proxy' : 'direct'})`);
        } catch (error) {
            console.error('[WebDAV] Failed to initialize client:', error);
            this.client = null;
        }
    }

    /**
     * Ensure the base directory exists on the WebDAV server
     */
    private async ensureBaseDirectory(): Promise<boolean> {
        if (!this.client) return false;

        try {
            const exists = await this.client.exists(this.baseDir);
            if (!exists) {
                await this.client.createDirectory(this.baseDir, { recursive: true });
                console.log(`[WebDAV] Created directory: ${this.baseDir}`);
            }
            return true;
        } catch (error) {
            console.error('[WebDAV] Failed to ensure base directory:', error);
            return false;
        }
    }

    private async ensureReady(): Promise<boolean> {
        if (!this.client) return false;
        if (!this.ensureBaseDirectoryPromise) {
            this.ensureBaseDirectoryPromise = this.ensureBaseDirectory();
        }
        const ok = await this.ensureBaseDirectoryPromise;
        if (!ok) {
            this.ensureBaseDirectoryPromise = null;
        }
        return ok;
    }

    private getBackupState(boardId: string): BackupState {
        const existing = this.backupStates.get(boardId);
        if (existing) return existing;
        const created: BackupState = { pending: null, timer: null, inFlight: null };
        this.backupStates.set(boardId, created);
        return created;
    }

    /**
     * Queue a board backup to the WebDAV server (debounced & coalesced per board).
     */
    queueBackupBoard(boardId: string, data: BoardData): void {
        if (!this.client) return;

        const state = this.getBackupState(boardId);
        state.pending = data;

        if (state.timer) {
            clearTimeout(state.timer);
        }

        state.timer = setTimeout(() => {
            state.timer = null;
            void this.pumpBackup(boardId);
        }, this.backupDebounceMs);
    }

    /**
     * Backward-compatible method name; now queues a backup instead of uploading immediately.
     */
    async backupBoard(boardId: string, data: BoardData): Promise<void> {
        this.queueBackupBoard(boardId, data);
    }

    /**
     * Load a board from the WebDAV server
     */
    async loadBoard(boardId: string): Promise<BoardData | null> {
        if (!this.client) {
            return null;
        }

        try {
            const filePath = `${this.baseDir}/${boardId}.json`;
            const exists = await this.client.exists(filePath);

            if (!exists) {
                console.log(`[WebDAV] Board ${boardId} not found on server`);
                return null;
            }

            const content = await this.client.getFileContents(filePath, { format: 'text' });
            return JSON.parse(content as string) as BoardData;
        } catch (error) {
            console.error(`[WebDAV] Failed to load board ${boardId}:`, error);
            return null;
        }
    }

    /**
     * Delete a board from the WebDAV server
     */
    async deleteBoard(boardId: string): Promise<void> {
        if (!this.client) {
            return;
        }

        try {
            this.cancelQueuedBackup(boardId);

            const filePath = `${this.baseDir}/${boardId}.json`;
            const exists = await this.client.exists(filePath);

            if (exists) {
                await this.client.deleteFile(filePath);
                console.log(`[WebDAV] Successfully deleted board: ${boardId}`);
            }
        } catch (error) {
            console.error(`[WebDAV] Failed to delete board ${boardId}:`, error);
            // Don't throw - deletion failures should not interrupt the user
        }
    }

    cancelQueuedBackup(boardId: string): void {
        const state = this.backupStates.get(boardId);
        if (!state) return;
        if (state.timer) {
            clearTimeout(state.timer);
        }
        state.pending = null;
        state.timer = null;
    }

    async flushQueuedBackup(boardId: string): Promise<void> {
        const state = this.backupStates.get(boardId);
        if (!state) return;
        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }
        await this.pumpBackup(boardId);
    }

    private async pumpBackup(boardId: string): Promise<void> {
        const state = this.getBackupState(boardId);

        if (state.inFlight) {
            await state.inFlight;
            if (state.pending) {
                await this.pumpBackup(boardId);
            }
            return;
        }

        state.inFlight = (async () => {
            while (state.pending) {
                const data = state.pending;
                state.pending = null;
                await this.uploadBackup(boardId, data);
            }
        })().finally(() => {
            state.inFlight = null;
            if (state.pending) {
                void this.pumpBackup(boardId);
            }
        });

        await state.inFlight;
    }

    private async uploadBackup(boardId: string, data: BoardData): Promise<void> {
        if (!this.client) return;

        try {
            const ready = await this.ensureReady();
            if (!ready) return;

            const filePath = `${this.baseDir}/${boardId}.json`;
            const jsonContent = JSON.stringify(data);

            await this.client.putFileContents(filePath, jsonContent, {
                overwrite: true,
                contentLength: true,
            });

            console.log(`[WebDAV] Successfully backed up board: ${boardId}`);
        } catch (error) {
            console.error(`[WebDAV] Failed to backup board ${boardId}:`, error);
        }
    }

    /**
     * Test the WebDAV connection
     */
    async testConnection(): Promise<boolean> {
        if (!this.client) {
            console.log('[WebDAV] No client available for testing');
            return false;
        }

        try {
            await this.client.exists('/');
            console.log('[WebDAV] Connection test successful');
            return true;
        } catch (error) {
            console.error('[WebDAV] Connection test failed:', error);
            return false;
        }
    }

    /**
     * Check if WebDAV is configured and available
     */
    isConfigured(): boolean {
        return this.client !== null;
    }
}
