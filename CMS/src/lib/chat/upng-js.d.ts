// Minimal types for upng-js (no @types package). Only the surface we use.
declare module "upng-js" {
  interface UPNGImage {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    frames: unknown[];
    tabs: Record<string, unknown>;
    data: Uint8Array;
  }
  /** Decode PNG bytes into an image (with palette/animation metadata). */
  export function decode(buffer: ArrayBuffer): UPNGImage;
  /** Convert a decoded image to one RGBA8 ArrayBuffer per frame. */
  export function toRGBA8(img: UPNGImage): ArrayBuffer[];
  /** Encode RGBA frames to PNG bytes. cnum=0 → lossless (no palette quantization). */
  export function encode(
    frames: ArrayBuffer[],
    width: number,
    height: number,
    cnum: number,
  ): ArrayBuffer;
}
