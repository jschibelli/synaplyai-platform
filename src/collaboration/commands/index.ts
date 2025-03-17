export interface Command<T = any> {
  type: string;
  payload: T;
  tenantId?: string;
  userId?: string;
  timestamp?: number;
}

export interface CommandHandler<T = any, R = any> {
  validate(command: Command<T>): Promise<boolean>;
  execute(command: Command<T>): Promise<R>;
  authorize?(command: Command<T>): Promise<boolean>;
}