import { invoke } from '@tauri-apps/api/core'
import { NovelaidDocumentType, NovelaidDirEntry, NovelaidDocument, DocumentStat, RemoveResult } from './models'

export * from './models'

export async function ping(value: string): Promise<string | null> {
  return await invoke<{ value?: string }>('plugin:novelaid-fs|ping', {
    payload: {
      value,
    },
  }).then((r) => (r.value ? r.value : null));
}

export async function getDocumentType(
  path: string,
): Promise<NovelaidDocumentType> {
  return await invoke<NovelaidDocumentType>('plugin:novelaid-fs|get_document_type', {
    path,
  });
}

export async function getDirectoryType(
  path: string,
  parentType?: NovelaidDocumentType
): Promise<NovelaidDocumentType> {
  return await invoke<NovelaidDocumentType>('plugin:novelaid-fs|get_directory_type', {
    path,
    parentType,
  });
}

export async function setProjectDirectory(path: string | null): Promise<void> {
  await invoke('plugin:novelaid-fs|set_project_directory', {
    path,
  });
}

export async function getProjectDirectory(): Promise<string | null> {
  return await invoke<string | null>('plugin:novelaid-fs|get_project_directory');
}

export async function readDirectory(
  path: string,
  recursive: boolean = false,
  parentType?: NovelaidDocumentType
): Promise<NovelaidDirEntry[]> {
  return await invoke<NovelaidDirEntry[]>('plugin:novelaid-fs|read_directory', {
    path,
    recursive,
    parentType,
  });
}

export async function getDocumentStat(path: string): Promise<DocumentStat> {
  return await invoke<DocumentStat>('plugin:novelaid-fs|get_document_stat', {
    path,
  });
}

export async function readDocument(path: string): Promise<NovelaidDocument> {
  return await invoke<NovelaidDocument>('plugin:novelaid-fs|read_document', {
    path,
  });
}

export async function writeDocument(
  path: string,
  document: NovelaidDocument,
): Promise<number> {
  return await invoke<number>('plugin:novelaid-fs|write_document', {
    path,
    document,
  });
}

export async function createDirectory(path: string): Promise<void> {
  await invoke('plugin:novelaid-fs|create_directory', {
    path,
  });
}

export async function createFile(path: string, content?: string): Promise<void> {
  await invoke('plugin:novelaid-fs|create_file', {
    path,
    content,
  });
}

export async function createNextFile(dirPath: string): Promise<NovelaidDirEntry> {
  return await invoke<NovelaidDirEntry>('plugin:novelaid-fs|create_next_file', {
    dirPath,
  });
}

export async function remove(path: string, force: boolean = false): Promise<RemoveResult> {
  return await invoke<RemoveResult>('plugin:novelaid-fs|remove', {
    path,
    force,
  });
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
  await invoke('plugin:novelaid-fs|rename', {
    oldPath,
    newPath,
  });
}

export async function copy(sourcePath: string, targetPath: string): Promise<void> {
  await invoke('plugin:novelaid-fs|copy', {
    sourcePath,
    targetPath,
  });
}

export async function getMetadataCache(): Promise<Record<string, any>> {
  return await invoke<Record<string, any>>('plugin:novelaid-fs|get_metadata_cache');
}

export async function scanDocuments(projectPath: string): Promise<NovelaidDocument[]> {
  return await invoke<NovelaidDocument[]>('plugin:novelaid-fs|scan_documents', {
    projectPath,
  });
}
