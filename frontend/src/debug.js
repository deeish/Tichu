/**
 * Drag debugging: set to false when done testing (see docs/DRAG_DEBUG_TESTING.md).
 * When true: logs hand reorder (onMove/onUp), exchange drag (start/end), and visibility cleanup.
 * To remove entirely: set DEBUG_HAND_DRAG = false, then delete this file and remove
 * the "import { DEBUG_HAND_DRAG } from '../debug'" lines from HandDock.jsx and GameBoard.jsx,
 * and remove the if (DEBUG_HAND_DRAG) console.log / visibility log branches.
 */
export const DEBUG_HAND_DRAG = true;
