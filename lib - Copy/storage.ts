import { mkdir, writeFile } from "fs/promises";
import path from "path";

export async function saveReceiptFile(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads"
  );

  await mkdir(uploadDir, { recursive: true });

  const fileName = `${Date.now()}-${file.name}`;
  const filePath = path.join(uploadDir, fileName);

  await writeFile(filePath, buffer);

  return {
    fileName,
    filePath: `/uploads/${fileName}`,
  };
}