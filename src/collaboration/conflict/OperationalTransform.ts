export interface Operation {
  type: 'insert' | 'delete' | 'retain';
  position: number;
  content?: string;
  length?: number;
}

export class OperationalTransform {
  transform(op1: Operation, op2: Operation): [Operation, Operation];
  compose(op1: Operation, op2: Operation): Operation;
}