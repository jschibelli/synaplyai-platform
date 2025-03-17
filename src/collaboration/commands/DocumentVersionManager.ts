export interface VersionInfo {
  version: number;
  timestamp: number;
  userId: string;
}

export class DocumentVersionManager {
  private versions = new Map<string, VersionInfo>();

  async getNextVersion(documentId: string): Promise<number> {
    const current = this.versions.get(documentId);
    return (current?.version ?? 0) + 1;
  }

  async updateVersion(documentId: string, userId: string): Promise<VersionInfo> {
    const nextVersion = await this.getNextVersion(documentId);
    const versionInfo = {
      version: nextVersion,
      timestamp: Date.now(),
      userId
    };
    this.versions.set(documentId, versionInfo);
    return versionInfo;
  }
}