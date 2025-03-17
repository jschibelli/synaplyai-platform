import { Command, CommandHandler } from './CommandRegistry';
import { EventStore } from '../events/EventStore';
import { getCurrentTenantContext } from '../../lib/tenant-context';
import { DocumentVersionManager } from './DocumentVersionManager';
import { DocumentAuthorizationService } from './DocumentAuthorizationService';

// Command Interfaces
export interface InsertTextCommand extends Command {
  type: 'INSERT_TEXT';
  payload: {
    documentId: string;
    position: number;
    content: string;
  };
}

export interface DeleteTextCommand extends Command {
  type: 'DELETE_TEXT';
  payload: {
    documentId: string;
    position: number;
    length: number;
  };
}

export interface FormatTextCommand extends Command {
  type: 'FORMAT_TEXT';
  payload: {
    documentId: string;
    position: number;
    length: number;
    formatting: Record<string, any>;
  };
}

export interface SetSelectionCommand extends Command {
  type: 'SET_SELECTION';
  payload: {
    documentId: string;
    start: number;
    end: number;
  };
}

export abstract class BaseDocumentCommandHandler<T extends Command> implements CommandHandler<void> {
  constructor(
    protected eventStore: EventStore,
    protected versionManager: DocumentVersionManager,
    protected authService: DocumentAuthorizationService
  ) {}

  async authorize(command: T): Promise<boolean> {
    const tenantContext = getCurrentTenantContext();
    if (!tenantContext?.tenantId) {
      return false;
    }

    return this.authService.canModifyDocument(
      command.payload.documentId,
      command.userId!,
      tenantContext.tenantId
    );
  }

  protected async getVersionedEvent(command: T, type: string, payload: any): Promise<any> {
    const tenantContext = getCurrentTenantContext();
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }

    const versionInfo = await this.versionManager.updateVersion(
      command.payload.documentId,
      command.userId!
    );

    return {
      type,
      payload,
      documentId: command.payload.documentId,
      userId: command.userId!,
      tenantId: tenantContext.tenantId,
      metadata: {
        schemaVersion: 1,
        versionInfo
      },
      version: versionInfo.version
    };
  }
}

export class InsertTextCommandHandler extends BaseDocumentCommandHandler<InsertTextCommand> {
  async validate(command: InsertTextCommand): Promise<boolean> {
    const { documentId, position, content } = command.payload;
    return Boolean(
      documentId &&
      typeof position === 'number' &&
      position >= 0 &&
      typeof content === 'string'
    );
  }

  async execute(command: InsertTextCommand): Promise<void> {
    const event = await this.getVersionedEvent(command, 'INSERT_TEXT', {
      content: command.payload.content,
      position: command.payload.position
    });
    
    await this.eventStore.store(event);
  }
}

export class DeleteTextCommandHandler extends BaseDocumentCommandHandler<DeleteTextCommand> {
  async validate(command: DeleteTextCommand): Promise<boolean> {
    const { documentId, position, length } = command.payload;
    return Boolean(
      documentId &&
      typeof position === 'number' &&
      position >= 0 &&
      typeof length === 'number' &&
      length > 0
    );
  }

  async execute(command: DeleteTextCommand): Promise<void> {
    const event = await this.getVersionedEvent(command, 'DELETE_TEXT', {
      position: command.payload.position,
      length: command.payload.length
    });
    
    await this.eventStore.store(event);
  }
}

export class FormatTextCommandHandler extends BaseDocumentCommandHandler<FormatTextCommand> {
  async validate(command: FormatTextCommand): Promise<boolean> {
    const { documentId, position, length, formatting } = command.payload;
    return Boolean(
      documentId &&
      typeof position === 'number' &&
      position >= 0 &&
      typeof length === 'number' &&
      length > 0 &&
      formatting &&
      Object.keys(formatting).length > 0
    );
  }

  async execute(command: FormatTextCommand): Promise<void> {
    const event = await this.getVersionedEvent(command, 'FORMAT_TEXT', {
      position: command.payload.position,
      length: command.payload.length,
      formatting: command.payload.formatting
    });
    
    await this.eventStore.store(event);
  }
}

export class SetSelectionCommandHandler extends BaseDocumentCommandHandler<SetSelectionCommand> {
  async validate(command: SetSelectionCommand): Promise<boolean> {
    const { documentId, start, end } = command.payload;
    return Boolean(
      documentId &&
      typeof start === 'number' &&
      start >= 0 &&
      typeof end === 'number' &&
      end >= start
    );
  }

  async execute(command: SetSelectionCommand): Promise<void> {
    const event = await this.getVersionedEvent(command, 'SET_SELECTION', {
      start: command.payload.start,
      end: command.payload.end
    });
    
    await this.eventStore.store(event);
  }
}