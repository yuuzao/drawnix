import localforage from 'localforage';
import { WebDAVService } from './webdav-service';

// Use native crypto.randomUUID() instead of uuid package
const generateId = (): string => {
    return crypto.randomUUID();
};

export interface BoardMetadata {
    id: string;
    name: string;
    createdAt: number;
}

export interface BoardData {
    children: any[];
    viewport?: any;
    theme?: any;
}

const BOARDS_METADATA_KEY = 'drawnix_boards_metadata';
const MAIN_BOARD_CONTENT_KEY = 'main_board_content'; // Old key for migration

export class FileManager {
    private static instance: FileManager;
    private webdavService: WebDAVService;

    private constructor() {
        localforage.config({
            name: 'Drawnix',
            storeName: 'drawnix_store',
            driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
        });
        this.webdavService = new WebDAVService();
    }

    public static getInstance(): FileManager {
        if (!FileManager.instance) {
            FileManager.instance = new FileManager();
        }
        return FileManager.instance;
    }

    async initialize(): Promise<void> {
        let boards = await this.getBoards();

        // Migration Check
        if (boards.length === 0) {
            const oldContent = await localforage.getItem<BoardData>(MAIN_BOARD_CONTENT_KEY);
            if (oldContent) {
                // Migrate existing board
                const newBoardId = generateId();
                const newBoardMeta: BoardMetadata = {
                    id: newBoardId,
                    name: 'Default Board',
                    createdAt: Date.now(),
                };
                await this.saveBoard(newBoardId, oldContent);
                await this.saveBoardsMetadata([newBoardMeta]);
                // Optional: Remove old key after successful migration to clean up
                // await localforage.removeItem(MAIN_BOARD_CONTENT_KEY);
                console.log('Migrated old board to new structure');
            } else {
                // No old content, create a fresh start board
                // But usually we just let the UI handle "no boards" or create one by default
                // Let's create a default one if absolutely nothing exists
                await this.createBoard('Untitled Board');
            }
        }
    }

    async getBoards(): Promise<BoardMetadata[]> {
        return (await localforage.getItem<BoardMetadata[]>(BOARDS_METADATA_KEY)) || [];
    }

    private async saveBoardsMetadata(boards: BoardMetadata[]): Promise<void> {
        await localforage.setItem(BOARDS_METADATA_KEY, boards);
    }

    async createBoard(name: string): Promise<string> {
        const boards = await this.getBoards();
        const id = generateId();
        const newBoard: BoardMetadata = {
            id,
            name,
            createdAt: Date.now(),
        };
        boards.push(newBoard);
        await this.saveBoardsMetadata(boards);
        // Initialize empty board content
        await this.saveBoard(id, { children: [] });
        return id;
    }

    async deleteBoard(id: string): Promise<void> {
        let boards = await this.getBoards();
        boards = boards.filter(b => b.id !== id);
        await this.saveBoardsMetadata(boards);
        await localforage.removeItem(`board_content_${id}`);
        // Also delete from WebDAV
        this.webdavService.deleteBoard(id).catch(err => {
            // Error already logged in webdav-service
        });
    }

    async renameBoard(id: string, newName: string): Promise<void> {
        let boards = await this.getBoards();
        const board = boards.find(b => b.id === id);
        if (board) {
            board.name = newName;
            await this.saveBoardsMetadata(boards);
        }
    }

    async loadBoard(id: string): Promise<BoardData | null> {
        return await localforage.getItem<BoardData>(`board_content_${id}`);
    }

    async saveBoard(id: string, content: BoardData): Promise<void> {
        await localforage.setItem(`board_content_${id}`, content);
        // Backup to WebDAV asynchronously (non-blocking)
        this.webdavService.backupBoard(id, content).catch(err => {
            // Error already logged in webdav-service, this is just a safety catch
        });
    }
}
