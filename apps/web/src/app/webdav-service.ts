import { createClient, WebDAVClient, FileStat } from 'webdav';
import { BoardData } from './file-manager';

interface WebDAVConfig {
    url: string;
    username?: string;
    password?: string;
}

export class WebDAVService {
    private client: WebDAVClient | null = null;
    private config: WebDAVConfig | null = null;
    private baseDir = '/drawnix/boards';

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

    /**
     * Backup a board to the WebDAV server
     * This method is async but errors are caught and logged, not thrown
     */
    async backupBoard(boardId: string, data: BoardData): Promise<void> {
        if (!this.client) {
            return; // Silently skip if WebDAV is not configured
        }

        try {
            // Ensure directory exists
            await this.ensureBaseDirectory();

            // Prepare file path and content
            const filePath = `${this.baseDir}/${boardId}.json`;
            const jsonContent = JSON.stringify(data, null, 2);

            // Upload to WebDAV server
            await this.client.putFileContents(filePath, jsonContent, {
                overwrite: true,
                contentLength: true,
            });

            console.log(`[WebDAV] Successfully backed up board: ${boardId}`);
        } catch (error) {
            console.error(`[WebDAV] Failed to backup board ${boardId}:`, error);
            // Don't throw the error - backup failures should not interrupt the user
        }
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
