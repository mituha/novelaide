export type DocumentType =
  | "novel"
  | "markdown"
  | "image"
  | "chat"
  | "css"
  | "metadata"
  | "directory"
  | "unknown";

export interface DirEntry {
  name: string;
  path: string;
  baseName: string;
  fileTitle: string;
  isDirectory: boolean;
  documentType: DocumentType;
  children?: DirEntry[];
}

export interface FileDocument {
  path: string;
  baseName: string;
  fileTitle: string;
  content: string;
  documentType: DocumentType;
}
