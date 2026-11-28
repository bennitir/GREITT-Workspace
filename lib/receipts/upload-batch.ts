export async function uploadReceiptFilesIndividually<T>(
  files: readonly T[],
  uploadFile: (file: T) => Promise<void>,
  onSettled?: () => void,
): Promise<Array<{ file: T; error: unknown }>> {
  const failures: Array<{ file: T; error: unknown }> = [];

  for (const file of files) {
    try {
      await uploadFile(file);
    } catch (error) {
      failures.push({ file, error });
    } finally {
      onSettled?.();
    }
  }

  return failures;
}
