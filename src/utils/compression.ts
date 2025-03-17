import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

// Convert callback-based zlib functions to Promise-based
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Compresses a string for efficient storage using gzip
 * @param data The string to compress
 * @returns Compressed string representation (base64 encoded)
 */
export async function compress(data: string): Promise<string> {
  try {
    // Convert string to Buffer, compress with gzip, and convert to base64 string
    const buffer = Buffer.from(data, 'utf-8');
    const compressedBuffer = await gzipAsync(buffer);
    return compressedBuffer.toString('base64');
  } catch (error) {
    console.error('Compression error:', error);
    // Fallback to uncompressed base64 if compression fails
    return Buffer.from(data).toString('base64');
  }
}

/**
 * Decompresses a previously compressed string
 * @param compressedData The compressed string (base64 encoded)
 * @returns Original decompressed string
 */
export async function decompress(compressedData: string): Promise<string> {
  try {
    // Convert base64 string to Buffer, decompress with gunzip, and convert back to string
    const buffer = Buffer.from(compressedData, 'base64');
    const decompressedBuffer = await gunzipAsync(buffer);
    return decompressedBuffer.toString('utf-8');
  } catch (error) {
    console.error('Decompression error:', error);
    // Try to interpret as uncompressed base64 if decompression fails
    try {
      return Buffer.from(compressedData, 'base64').toString('utf-8');
    } catch (fallbackError) {
      throw new Error(`Failed to decompress data: ${error.message}`);
    }
  }
}

/**
 * Calculates the compression ratio achieved
 * @param original Original data size
 * @param compressed Compressed data size
 * @returns Compression ratio (higher is better)
 */
export function compressionRatio(original: number, compressed: number): number {
  if (compressed === 0) return 0;
  return original / compressed;
}