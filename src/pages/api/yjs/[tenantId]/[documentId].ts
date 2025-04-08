import { NextApiRequest, NextApiResponse } from 'next';
import { getTenantContext } from '../../../../lib/tenant-context';

/**
 * This API endpoint simply confirms that the YJS WebSocket connection
 * for a tenant and document is available.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { tenantId, documentId } = req.query as { tenantId: string, documentId: string };
  
  // Ensure tenant context is set
  const currentTenant = getTenantContext()?.tenantId;
  
  // Verify tenant permission
  if (currentTenant && currentTenant !== tenantId) {
    return res.status(403).json({ 
      error: 'Tenant mismatch', 
      message: 'You do not have permission to access this document' 
    });
  }
  
  // Return information about the YJS connection
  res.status(200).json({
    status: 'available',
    tenantId,
    documentId,
    websocketUrl: process.env.NEXT_PUBLIC_YJS_WEBSOCKET_URL || 'ws://localhost:3000/yjs',
    message: 'YJS WebSocket connection is available'
  });
}