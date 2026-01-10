import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Use refs to avoid stale closure issues
  const activeBoardIdRef = useRef<string>('');
  const isSwitchingRef = useRef<boolean>(false);
  const valueRef = useRef<AppValue>({ children: [] });
  const boardRef = useRef<PlaitBoard | null>(null);
  const switchUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lockSwitch = () => {
    if (switchUnlockTimerRef.current) {
      clearTimeout(switchUnlockTimerRef.current);
      switchUnlockTimerRef.current = null;
    }
    isSwitchingRef.current = true;
  };

  const unlockSwitch = () => {
    if (switchUnlockTimerRef.current) {
      clearTimeout(switchUnlockTimerRef.current);
    }
    switchUnlockTimerRef.current = setTimeout(() => {
      isSwitchingRef.current = false;
      switchUnlockTimerRef.current = null;
    }, 0);
  };

  // Keep refs in sync with state
  useEffect(() => {
    activeBoardIdRef.current = activeBoardId;
  }, [activeBoardId]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      if (switchUnlockTimerRef.current) {
        clearTimeout(switchUnlockTimerRef.current);
      }
    };
  }, []);

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
        // Set ref first before state to avoid race condition
        activeBoardIdRef.current = firstBoardId;
        setActiveBoardId(firstBoardId);
        const boardData = await fileManager.loadBoard(firstBoardId);
        if (boardData) {
          valueRef.current = boardData as AppValue;
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

  const getCurrentBoardData = (): BoardData => {
    const board = boardRef.current;
    if (board) {
      return {
        children: board.children as unknown as BoardData['children'],
        viewport: board.viewport,
        theme: board.theme,
      };
    }
    return valueRef.current as BoardData;
  };

  // Handle board selection
  const handleSelectBoard = useCallback(async (id: string) => {
    if (id === activeBoardIdRef.current) return;
    if (isSwitchingRef.current) return; // Prevent concurrent switches

    lockSwitch();

    try {
      // Save current board before switching (use refs to get latest values)
      const currentBoardId = activeBoardIdRef.current;
      if (currentBoardId) {
        await fileManager.saveBoard(currentBoardId, getCurrentBoardData());
      }

      // Load new board data BEFORE updating any state
      const boardData = await fileManager.loadBoard(id);

      // Now atomically update both ref and state
      activeBoardIdRef.current = id;
      setActiveBoardId(id);

      if (boardData) {
        valueRef.current = boardData as AppValue;
        setValue(boardData as AppValue);
        setTutorial(boardData.children && boardData.children.length === 0);
      } else {
        valueRef.current = { children: [] };
        setValue({ children: [] });
        setTutorial(true);
      }
    } finally {
      unlockSwitch();
    }
  }, []);

  // Handle create new board
  const handleCreateBoard = useCallback(async () => {
    if (isSwitchingRef.current) return;

    lockSwitch();

    try {
      // Save current board before creating new one (use refs)
      const currentBoardId = activeBoardIdRef.current;
      if (currentBoardId) {
        await fileManager.saveBoard(currentBoardId, getCurrentBoardData());
      }

      const currentBoards = await fileManager.getBoards();
      const newId = await fileManager.createBoard(`Board ${currentBoards.length + 1}`);
      const updatedBoards = await fileManager.getBoards();
      setBoards(updatedBoards);

      // Update refs and state atomically
      activeBoardIdRef.current = newId;
      setActiveBoardId(newId);
      valueRef.current = { children: [] };
      setValue({ children: [] });
      setTutorial(true);
    } finally {
      unlockSwitch();
    }
  }, []);

  // Handle delete board
  const handleDeleteBoard = useCallback(async (id: string) => {
    const currentBoards = await fileManager.getBoards();
    if (currentBoards.length <= 1) {
      alert('Cannot delete the last board');
      return;
    }

    if (isSwitchingRef.current) return;
    lockSwitch();

    try {
      await fileManager.deleteBoard(id);
      const updatedBoards = await fileManager.getBoards();
      setBoards(updatedBoards);

      // If we deleted the active board, switch to another one
      if (id === activeBoardIdRef.current && updatedBoards.length > 0) {
        const newActiveId = updatedBoards[0].id;
        const boardData = await fileManager.loadBoard(newActiveId);

        // Update refs and state atomically
        activeBoardIdRef.current = newActiveId;
        setActiveBoardId(newActiveId);

        if (boardData) {
          valueRef.current = boardData as AppValue;
          setValue(boardData as AppValue);
          setTutorial(boardData.children && boardData.children.length === 0);
        } else {
          valueRef.current = { children: [] };
          setValue({ children: [] });
          setTutorial(true);
        }
      }
    } finally {
      unlockSwitch();
    }
  }, []);

  // Handle rename board
  const handleRenameBoard = useCallback(async (id: string, newName: string) => {
    await fileManager.renameBoard(id, newName);
    const updatedBoards = await fileManager.getBoards();
    setBoards(updatedBoards);
  }, []);

  // Real-time save on change - use refs to avoid stale closure issues
  const handleChange = useCallback((newValue: unknown) => {
    // Don't save during board switching to prevent data corruption
    if (isSwitchingRef.current) {
      return;
    }

    const typedValue = newValue as AppValue;
    valueRef.current = typedValue;
    setValue(typedValue);

    // Use ref to get the current board ID (not the stale closure value)
    const currentBoardId = activeBoardIdRef.current;
    if (currentBoardId) {
      fileManager.saveBoard(currentBoardId, typedValue as BoardData);
    }

    if (typedValue.children && typedValue.children.length > 0) {
      setTutorial(false);
    }
  }, []); // Empty dependency array - we use refs instead

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
          key={activeBoardId}
          value={value.children}
          viewport={value.viewport}
          theme={value.theme}
          onChange={handleChange}
          tutorial={tutorial}
          afterInit={(board: PlaitBoard) => {
            boardRef.current = board;
          }}
        ></Drawnix>
      </div>
    </div>
  );
}

export default App;
