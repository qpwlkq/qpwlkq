/**
 * Zstandard frame handling for the session-log container.
 *
 * DeepSeek Harness appends one independently decodable frame per durable
 * batch, so a session log is a concatenation of frames. Node's one-shot
 * `zstdDecompressSync` stops after the first frame, so frames are located
 * structurally and decoded one at a time. A torn final frame (a crash during
 * append) is ignored; everything before it is still readable.
 * @module token-heatmap/zstd
 */

import { zstdDecompressSync } from 'node:zlib'

/** Zstandard frame magic, little endian. */
const MAGIC = 0xfd2fb528

/**
 * Locate complete Zstandard frames without decompressing their blocks.
 * @param buffer - bytes of a concatenated-frame log.
 * @returns inclusive frame starts and exclusive ends, in file order.
 */
export function scanFrames(buffer) {
  const frames = []
  let offset = 0

  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4 || buffer.readUInt32LE(offset) !== MAGIC) break
    offset += 4
    if (offset === buffer.length) break

    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) break

    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const hasChecksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0
      ? (singleSegment ? 1 : 0)
      : 1 << contentSizeFlag
    const headerBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < headerBytes) break
    offset += headerBytes

    let torn = false
    for (;;) {
      if (buffer.length - offset < 3) {
        torn = true
        break
      }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) {
        torn = true
        break
      }
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) {
        torn = true
        break
      }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (torn) break

    if (hasChecksum) {
      if (buffer.length - offset < 4) break
      offset += 4
    }
    frames.push({ start, end: offset })
  }

  return frames
}

/**
 * Decode a concatenated-frame log into UTF-8 text.
 * @param buffer - bytes of the physical session-log file.
 * @returns decoded text plus the number of frames skipped at the tail.
 */
export function decodeLog(buffer) {
  const parts = []
  let skippedFrames = 0
  for (const frame of scanFrames(buffer)) {
    try {
      parts.push(zstdDecompressSync(buffer.subarray(frame.start, frame.end)))
    } catch {
      // A frame whose blocks scanned complete but whose stream is torn is
      // still the tail of this append-only file; earlier batches remain valid.
      skippedFrames += 1
      break
    }
  }
  return { text: Buffer.concat(parts).toString('utf8'), skippedFrames }
}
