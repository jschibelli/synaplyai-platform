export class TenantContext {
  tenantId: string;
  userId: string;

  constructor(tenantId: string, userId: string) {
    this.tenantId = tenantId;
    this.userId = userId;
  }
}