import { Command, CommandHandler } from './CommandRegistry';
import { CursorManager } from '../CursorManager';

interface UpdateCursorCommand extends Command {
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
    return Boolean(documentId && typeof position === 'number' && position >= 0);
  }

  async execute(command: UpdateCursorCommand): Promise<void> {
    const { documentId, position, selection, displayName } = command.payload;
    this.cursorManager.updateCursorPosition(
      documentId,
      command.userId!,
      position,
      selection,
      displayName
    );
  }
}