const SIZE = 21;
const DATA_CODEWORDS = 19;
const EC_CODEWORDS = 7;
const QUIET_ZONE = 4;

function gfMultiply(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function reedSolomonDivisor(degree: number) {
  const result = Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data: number[], degree: number) {
  const divisor = reedSolomonDivisor(degree);
  const result = Array<number>(degree).fill(0);
  for (const value of data) {
    const factor = value ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= gfMultiply(divisor[i], factor);
    }
  }
  return result;
}

function appendBits(bits: number[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
}

function encodeVersion1Low(text: string) {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > 17) throw new Error("QR-gildi er of langt fyrir GLÖGGT merki.");

  const bits: number[] = [];
  appendBits(bits, 0x4, 4); // Byte mode.
  appendBits(bits, bytes.length, 8);
  for (const value of bytes) appendBits(bits, value, 8);

  const capacity = DATA_CODEWORDS * 8;
  const terminator = Math.min(4, capacity - bits.length);
  for (let i = 0; i < terminator; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j];
    data.push(value);
  }
  for (let pad = 0; data.length < DATA_CODEWORDS; pad += 1) {
    data.push(pad % 2 === 0 ? 0xec : 0x11);
  }

  return [...data, ...reedSolomonRemainder(data, EC_CODEWORDS)];
}

function getBit(value: number, index: number) {
  return ((value >>> index) & 1) !== 0;
}

function formatBits(mask: number) {
  const data = (1 << 3) | mask; // EC level L = 01.
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function buildMatrix(text: string) {
  const codewords = encodeVersion1Low(text);
  const modules = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  const isFunction = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));

  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        const dark = distance !== 2 && distance !== 4;
        setFunction(cx + dx, cy + dy, dark);
      }
    }
  };

  drawFinder(3, 3);
  drawFinder(SIZE - 4, 3);
  drawFinder(3, SIZE - 4);

  for (let i = 8; i < SIZE - 8; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  const fmt = formatBits(0);
  for (let i = 0; i <= 5; i += 1) setFunction(8, i, getBit(fmt, i));
  setFunction(8, 7, getBit(fmt, 6));
  setFunction(8, 8, getBit(fmt, 7));
  setFunction(7, 8, getBit(fmt, 8));
  for (let i = 9; i < 15; i += 1) setFunction(14 - i, 8, getBit(fmt, i));
  for (let i = 0; i < 8; i += 1) setFunction(SIZE - 1 - i, 8, getBit(fmt, i));
  for (let i = 8; i < 15; i += 1) setFunction(8, SIZE - 15 + i, getBit(fmt, i));
  setFunction(8, SIZE - 8, true);

  let bitIndex = 0;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < SIZE; vertical += 1) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? SIZE - 1 - vertical : vertical;
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        if (isFunction[y][x]) continue;
        const bit = bitIndex < codewords.length * 8
          ? getBit(codewords[bitIndex >>> 3], 7 - (bitIndex & 7))
          : false;
        modules[y][x] = bit;
        bitIndex += 1;
      }
    }
  }

  // Fixed mask 0: (x + y) mod 2 == 0.
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (!isFunction[y][x] && (x + y) % 2 === 0) modules[y][x] = !modules[y][x];
    }
  }

  return modules;
}

export function workResourceQrSvg(token: string) {
  if (!/^[0-9a-f]{16}$/i.test(token)) return null;
  const modules = buildMatrix(token.toLowerCase());
  const viewSize = SIZE + QUIET_ZONE * 2;
  const cells: string[] = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (modules[y][x]) cells.push(`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${cells.join("")}" fill="#000"/></svg>`;
}

export function workResourceQrDataUrl(token: string) {
  const svg = workResourceQrSvg(token);
  return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : null;
}
