const { __test__ } = require('../../server/socketHandlers')

describe('socketHandlers safeSocketOn', () => {
  test('catches thrown handler errors and emits structured error payload', () => {
    const { safeSocketOn } = __test__

    const mockEmit = jest.fn()
    let registeredHandler = null

    const mockSocket = {
      id: 'socket-1',
      emit: mockEmit,
      on: jest.fn((eventName, cb) => {
        registeredHandler = cb
      }),
    }

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    safeSocketOn(mockSocket, 'make-move', () => {
      throw new Error('boom')
    })

    expect(mockSocket.on).toHaveBeenCalledWith('make-move', expect.any(Function))
    expect(typeof registeredHandler).toBe('function')

    registeredHandler({ cards: [] })

    expect(mockEmit).toHaveBeenCalledWith('error', { code: 'internal_error', message: 'Internal server error' })
    consoleSpy.mockRestore()
  })

  test('passes through return value when handler does not throw', () => {
    const { safeSocketOn } = __test__

    const mockEmit = jest.fn()
    let registeredHandler = null

    const mockSocket = {
      id: 'socket-2',
      emit: mockEmit,
      on: jest.fn((eventName, cb) => {
        registeredHandler = cb
      }),
    }

    safeSocketOn(mockSocket, 'get-game-state', () => {
      return { ok: true }
    })

    const result = registeredHandler()
    expect(result).toEqual({ ok: true })
    expect(mockEmit).not.toHaveBeenCalled()
  })

  test('catches thrown errors inside safeSetTimeout callback', () => {
    const { safeSetTimeout } = __test__

    jest.useFakeTimers()

    const mockEmit = jest.fn()
    const mockSocket = {
      id: 'socket-3',
      emit: mockEmit,
      on: jest.fn(),
    }

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    safeSetTimeout(mockSocket, 'make-move', () => {
      throw new Error('async boom')
    }, 10, { gameId: 'g1' })

    jest.advanceTimersByTime(10)

    expect(mockEmit).toHaveBeenCalledWith('error', { code: 'internal_error', message: 'Internal server error' })

    consoleSpy.mockRestore()

    jest.useRealTimers()
  })
})

