import React, { useState } from 'react';
import { BoardMetadata } from './file-manager';
import styles from './board-sidebar.module.scss';

interface BoardSidebarProps {
    boards: BoardMetadata[];
    activeBoardId: string;
    onSelectBoard: (id: string) => void;
    onCreateBoard: () => void;
    onDeleteBoard: (id: string) => void;
    onRenameBoard: (id: string, newName: string) => void;
}

export const BoardSidebar: React.FC<BoardSidebarProps> = ({
    boards,
    activeBoardId,
    onSelectBoard,
    onCreateBoard,
    onDeleteBoard,
    onRenameBoard,
}: BoardSidebarProps) => {
    const sortedBoards = [...boards].sort((a, b) => b.createdAt - a.createdAt);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    const handleStartEdit = (board: BoardMetadata, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(board.id);
        setEditingName(board.name);
    };

    const handleFinishEdit = () => {
        if (editingId && editingName.trim() !== '') {
            onRenameBoard(editingId, editingName.trim());
        }
        setEditingId(null);
        setEditingName('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleFinishEdit();
        } else if (e.key === 'Escape') {
            setEditingId(null);
            setEditingName('');
        }
    };

    return (
        <div className={styles.sidebar}>
            <div className={styles.header}>
                <h3>My Boards</h3>
                <button className={styles.createButton} onClick={onCreateBoard}>
                    New +
                </button>
            </div>
            <div className={styles.boardList}>
                {sortedBoards.map((board) => (
                    <div
                        key={board.id}
                        className={`${styles.boardItem} ${
                            board.id === activeBoardId ? styles.active : ''
                        }`}
                        onClick={() => {
                            if (editingId !== board.id) {
                                onSelectBoard(board.id);
                            }
                        }}
                    >
                        {editingId === board.id ? (
                            <input
                                type="text"
                                className={styles.editInput}
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={handleFinishEdit}
                                onKeyDown={handleKeyDown}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <span className={styles.boardName}>{board.name}</span>
                        )}
                        <div className={styles.actions}>
                            <button
                                className={styles.actionButton}
                                title="Rename"
                                onClick={(e) => handleStartEdit(board, e)}
                            >
                                ✏️
                            </button>
                            <button
                                className={styles.actionButton}
                                title="Delete"
                                onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    if (window.confirm('Delete this board?')) {
                                        onDeleteBoard(board.id);
                                    }
                                }}
                            >
                                🗑️
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
