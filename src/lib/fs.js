import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath, mode = 0o700) {
  await fs.mkdir(dirPath, { recursive: true, mode });
}

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath, fallback = null) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJsonAtomic(filePath, data, { mode = 0o600 } = {}) {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tmp, payload, { mode });
  await fs.rename(tmp, filePath);
}

export async function writeFileAtomic(filePath, content, { mode = 0o600 } = {}) {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, content, { mode });
  await fs.rename(tmp, filePath);
}

export async function copyFile(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

export async function removeIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
  }
}

export async function listDir(dirPath) {
  try {
    return await fs.readdir(dirPath);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}
