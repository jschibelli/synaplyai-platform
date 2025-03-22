import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { setTenantContext } from './lib/tenantContext';

export function middleware(request: NextRequest) {
  // Get tenant ID from request headers, cookies, or use a default for development
  const tenantId = request.headers.get('x-tenant-id') || 
                   request.cookies.get('tenantId')?.value || 
                   'demo-tenant';
  
  // Get user ID from session or use a default for development
  const userId = request.headers.get('x-user-id') || 'demo-user';
  
  // Generate request ID and trace ID for observability
  const requestId = request.headers.get('x-request-id') || uuidv4();
  const traceId = request.headers.get('x-trace-id') || uuidv4();
  
  // Set the tenant context for this request
  setTenantContext({
    tenantId,
    userId,
    requestId,
    traceId
  });
  
  // Add tenant information to response headers for debugging
  const response = NextResponse.next();
  response.headers.set('x-tenant-id', tenantId);
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-trace-id', traceId);
  
  return response;
}

export const config = {
  // Apply this middleware to API routes
  matcher: '/api/:path*',
};