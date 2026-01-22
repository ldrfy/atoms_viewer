import SparkMD5 from 'spark-md5';

const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB

/**
 * Compute MD5 hash for a Blob/File using incremental chunks.
 */
export async function computeMd5ForBlob(
  blob: Blob,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Promise<string> {
  const spark = new SparkMD5.ArrayBuffer();
  const total = blob.size;
  let offset = 0;

  while (offset < total) {
    const end = Math.min(total, offset + chunkSize);
    const slice = blob.slice(offset, end);
    const buf = await slice.arrayBuffer();
    spark.append(buf);
    offset = end;
  }

  return spark.end();
}

export async function computeMd5ForString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = encoder.encode(input).buffer;
  return new SparkMD5.ArrayBuffer().append(buf).end();
}

export function computeMd5ForArrayBuffer(buf: ArrayBuffer): string {
  return new SparkMD5.ArrayBuffer().append(buf).end();
}
