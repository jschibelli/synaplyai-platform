import { Command, CommandHandler } from './CommandRegistry';
import { CursorManager } from '../CursorManager';

export interface UpdateCursorCommand extends Command {
  type: 'UPDATE_CURSOR';
  payload: {
    documentId: string;
    position: number;
    selection?: { start: number; end: number };
    displayName?: string;
  };
}

export class UpdateCursorCommandHandler implements CommandHandler<void> {
  constructor(private cursorManager: CursorManager) {}

  async validate(command: UpdateCursorCommand): Promise<boolean> {
    const { documentId, position } = command.payload;
    if (!documentId || typeof position !== 'number') {
      return false;
    }
    return true;
  }

  async execute(command: UpdateCursorCommand): Promise<void> {
    const { documentId, position, selection, displayName } = command.payload;
    const { userId } = getCurrentTenantContext() || {};
    
    if (!userId) {
      throw new Error('No user context available');
    }

    this.cursorManager.updateCursorPosition(
      documentId,
      userId,
      position,
      selection,
      displayName
    );
  }
}