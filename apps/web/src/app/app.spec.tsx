import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import App from './app';

jest.mock('./file-manager', () => {
  const mockInstance = {
    initialize: jest.fn().mockResolvedValue(undefined),
    getBoards: jest.fn(),
    createBoard: jest.fn(),
    deleteBoard: jest.fn(),
    renameBoard: jest.fn(),
    loadBoard: jest.fn(),
    saveBoard: jest.fn(),
  };

  return {
    __esModule: true,
    FileManager: {
      getInstance: () => mockInstance,
    },
    __mockInstance: mockInstance,
  };
});

jest.mock('@drawnix/drawnix', () => {
  const React = require('react');

  const testApi = {
    staleOnChangeCount: 0,
  };

  const Drawnix = (props: any) => {
    const latestValueRef = React.useRef(props.value);

    React.useEffect(() => {
      latestValueRef.current = props.value;
    }, [props.value]);

    React.useEffect(() => {
      return () => {
        const childrenSnapshot = latestValueRef.current;
        Promise.resolve().then(() => {
          testApi.staleOnChangeCount += 1;
          props.onChange?.({
            children: childrenSnapshot,
            operations: [],
            viewport: props.viewport ?? { zoom: 1 },
            selection: null,
            theme: props.theme ?? { themeColorMode: 'default' },
          });
        });
      };
    }, []);

    return React.createElement('div', { 'data-testid': 'drawnix' });
  };

  return { Drawnix, __testApi: testApi };
});

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { __testApi } = jest.requireMock('@drawnix/drawnix');
    __testApi.staleOnChangeCount = 0;
  });

  it('does not write stale board content into another board when switching', async () => {
    const boardA = {
      id: 'board-a',
      name: 'Board A',
      createdAt: 1,
    };
    const boardB = {
      id: 'board-b',
      name: 'Board B',
      createdAt: 2,
    };

    const boardAData = { children: [{ id: 'a' }] };
    const boardBData = { children: [{ id: 'b' }] };

    const { __mockInstance: fileManager } = jest.requireMock('./file-manager');
    fileManager.getBoards.mockResolvedValue([boardA, boardB]);
    fileManager.loadBoard.mockImplementation(async (id: string) => {
      if (id === boardA.id) return boardAData;
      if (id === boardB.id) return boardBData;
      return null;
    });
    fileManager.saveBoard.mockResolvedValue(undefined);

    render(<App />);

    await screen.findByTestId('drawnix');

    fireEvent.click(screen.getByRole('button', { name: '☰' }));

    fireEvent.click(await screen.findByText('Board A'));

    await waitFor(() => {
      expect(fileManager.saveBoard).toHaveBeenCalledWith(boardB.id, boardBData);
    });

    const { __testApi } = jest.requireMock('@drawnix/drawnix');
    await waitFor(() => {
      expect(__testApi.staleOnChangeCount).toBe(1);
    });

    expect(fileManager.saveBoard).not.toHaveBeenCalledWith(boardA.id, boardBData);
  });
});
