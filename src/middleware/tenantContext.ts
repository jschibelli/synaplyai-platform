import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { tenantContextStorage, TenantContext } from '@/lib/tenantContext';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware that extracts tenant and user information from the request
 * and stores it in AsyncLocalStorage for the duration of the request
 */
export function withTenantContext(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Generate unique IDs for the request
    const requestId = uuidv4();
    const traceId = req.headers['x-trace-id'] as string || requestId;
    
    // Get session information
    const session = await getServerSession(req, res, authOptions);
    
    // Default to single-tenant mode if no tenant information is available
    // In a real multi-tenant app, you might extract tenant from subdomain, header, etc.
    const tenantId = req.headers['x-tenant-id'] as string || 
                     session?.user?.tenantId ||
                     'default-tenant';
    
    const userId = session?.user?.id || 'anonymous';
    
    // Create the tenant context
    const context: TenantContext = {
      tenantId,
      userId,
      requestId,
      traceId
    };
    
    // Set response headers for debugging
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-trace-id', traceId);
    
    // Run the handler within the tenant context
    return tenantContextStorage.run(context, () => handler(req, res));
  };
}