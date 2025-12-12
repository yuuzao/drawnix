import { useState, useEffect, useCallback } from 'react';
import { Drawnix } from '@drawnix/drawnix';
import { PlaitBoard, PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import { FileManager, BoardMetadata, BoardData } from './file-manager';
import { BoardSidebar } from './board-sidebar';

type AppValue = {
  children: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
};

const fileManager = FileManager.getInstance();

export function App() {
  const [boards, setBoards] = useState<BoardMetadata[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>('');
  const [value, setValue] = useState<AppValue>({ children: [] });
  const [tutorial, setTutorial] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Initialize FileManager and load boards
  useEffect(() => {
    const init = async () => {
      await fileManager.initialize();
      const loadedBoards = await fileManager.getBoards();
      setBoards(loadedBoards);
      if (loadedBoards.length > 0) {
        // Load the most recent board
        const sortedBoards = [...loadedBoards].sort((a, b) => b.createdAt - a.createdAt);
        const firstBoardId = sortedBoards[0].id;
        setActiveBoardId(firstBoardId);
        const boardData = await fileManager.loadBoard(firstBoardId);
        if (boardData) {
          setValue(boardData as AppValue);
          if (boardData.children && boardData.children.length === 0) {
            setTutorial(true);
          }
        } else {
          setTutorial(true);
        }
      }
      setIsLoading(false);
    };
    init();
  }, []);

  // Handle board selection
  const handleSelectBoard = useCallback(async (id: string) => {
    if (id === activeBoardId) return;

    // Save current board before switching
    if (activeBoardId) {
      await fileManager.saveBoard(activeBoardId, value as BoardData);
    }

    setActiveBoardId(id);
    const boardData = await fileManager.loadBoard(id);
    if (boardData) {
      setValue(boardData as AppValue);
      setTutorial(boardData.children && boardData.children.length === 0);
    } else {
      setValue({ children: [] });
      setTutorial(true);
    }
  }, [activeBoardId, value]);

  // Handle create new board
  const handleCreateBoard = useCallback(async () => {
    // Save current board before creating new one
    if (activeBoardId) {
      await fileManager.saveBoard(activeBoardId, value as BoardData);
    }

    const newId = await fileManager.createBoard(`Board ${boards.length + 1}`);
    const updatedBoards = await fileManager.getBoards();
    setBoards(updatedBoards);
    setActiveBoardId(newId);
    setValue({ children: [] });
    setTutorial(true);
  }, [activeBoardId, value, boards.length]);

  // Handle delete board
  const handleDeleteBoard = useCallback(async (id: string) => {
    if (boards.length <= 1) {
      alert('Cannot delete the last board');
      return;
    }

    await fileManager.deleteBoard(id);
    const updatedBoards = await fileManager.getBoards();
    setBoards(updatedBoards);

    // If we deleted the active board, switch to another one
    if (id === activeBoardId && updatedBoards.length > 0) {
      const newActiveId = updatedBoards[0].id;
      setActiveBoardId(newActiveId);
      const boardData = await fileManager.loadBoard(newActiveId);
      if (boardData) {
        setValue(boardData as AppValue);
        setTutorial(boardData.children && boardData.children.length === 0);
      }
    }
  }, [activeBoardId, boards.length]);

  // Handle rename board
  const handleRenameBoard = useCallback(async (id: string, newName: string) => {
    await fileManager.renameBoard(id, newName);
    const updatedBoards = await fileManager.getBoards();
    setBoards(updatedBoards);
  }, []);

  // Real-time save on change
  const handleChange = useCallback((newValue: unknown) => {
    const typedValue = newValue as AppValue;
    setValue(typedValue);
    if (activeBoardId) {
      fileManager.saveBoard(activeBoardId, typedValue as BoardData);
    }
    if (typedValue.children && typedValue.children.length > 0) {
      setTutorial(false);
    }
  }, [activeBoardId]);

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', position: 'relative' }}>
      {/* Sidebar Toggle Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          position: 'absolute',
          left: sidebarOpen ? 260 : 12,
          bottom: 80,
          zIndex: 20,
          background: 'rgba(25, 118, 210, 0.9)',
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'left 0.3s',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          fontSize: 14,
        }}
      >
        {sidebarOpen ? '◀' : '☰'}
      </button>

      {/* Sidebar */}
      {sidebarOpen && (
        <BoardSidebar
          boards={boards}
          activeBoardId={activeBoardId}
          onSelectBoard={handleSelectBoard}
          onCreateBoard={handleCreateBoard}
          onDeleteBoard={handleDeleteBoard}
          onRenameBoard={handleRenameBoard}
        />
      )}

      {/* Main content */}
      <div style={{ flex: 1, marginLeft: sidebarOpen ? 250 : 0, transition: 'margin-left 0.3s' }}>
        <Drawnix
          value={value.children}
          viewport={value.viewport}
          theme={value.theme}
          onChange={handleChange}
          tutorial={tutorial}
          afterInit={(board: PlaitBoard) => {
            console.log('board initialized');
          }}
        ></Drawnix>
      </div>
    </div>
  );
}

export default App;
