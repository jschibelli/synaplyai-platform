export async function simulateNetworkDisconnection(wsInstance: any): Promise<void> {
  wsInstance.emit('close', { code: 1006, reason: 'Connection closed abnormally' });
  return new Promise((resolve) => setTimeout(resolve, 50));
}