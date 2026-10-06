/* ============================================================
   목(mock) 전용 — 파일 여러 개를 압축 없이 묶은 ZIP 을 만든다.
   출고 사진 증빙 내려받기를 데모에서도 눌러 볼 수 있게 (사내 빌드는 서버가 만든다).
   사진(JPEG)은 더 줄지 않으므로 '저장(store)' 방식이면 충분하다.
   ============================================================ */

export type ZipFile = { name: string; data: Uint8Array };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** 16 · 32비트 값을 리틀 엔디언으로 이어 쓴 조각 */
const fields = (...parts: Array<[size: 2 | 4, value: number]>) => {
  const out = new Uint8Array(parts.reduce((sum, [size]) => sum + size, 0));
  const view = new DataView(out.buffer);
  let at = 0;
  parts.forEach(([size, value]) => {
    if (size === 2) view.setUint16(at, value, true);
    else view.setUint32(at, value, true);
    at += size;
  });
  return out;
};

export const zipStore = (files: ZipFile[]): Blob => {
  const encoder = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const UTF8_NAMES = 0x0800; // 한글 파일 이름

  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;
    const local = fields([4, 0x04034b50], [2, 20], [2, UTF8_NAMES], [2, 0], [2, time], [2, date], [4, crc], [4, size], [4, size], [2, name.length], [2, 0]);
    chunks.push(local, name, file.data);
    central.push(
      fields([4, 0x02014b50], [2, 20], [2, 20], [2, UTF8_NAMES], [2, 0], [2, time], [2, date], [4, crc], [4, size], [4, size], [2, name.length], [2, 0], [2, 0], [2, 0], [2, 0], [4, 0], [4, offset]),
      name
    );
    offset += local.length + name.length + size;
  });

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = fields([4, 0x06054b50], [2, 0], [2, 0], [2, files.length], [2, files.length], [4, centralSize], [4, offset], [2, 0]);
  return new Blob([...chunks, ...central, end] as BlobPart[], { type: "application/zip" });
};
