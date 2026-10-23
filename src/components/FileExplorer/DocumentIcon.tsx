import {
  FileText,
  BookOpen,
  Image as ImageIcon,
  MessageSquare,
  FileCode,
  File,
  Folder,
  FolderOpen,
} from "lucide-react";
import { DocumentType } from "../../types/document";

interface DocumentIconProps {
  type: DocumentType;
  isOpen?: boolean;
  size?: number;
}

export const DocumentIcon: React.FC<DocumentIconProps> = ({
  type,
  isOpen = false,
  size = 16,
}) => {
  switch (type) {
    case "directory":
      return isOpen ? (
        <FolderOpen size={size} style={{ color: "var(--accent-color)" }} />
      ) : (
        <Folder size={size} style={{ color: "var(--accent-color)" }} />
      );
    case "novel":
      return <FileText size={size} style={{ color: "#3b82f6" }} />;
    case "markdown":
      return <BookOpen size={size} style={{ color: "#10b981" }} />;
    case "image":
      return <ImageIcon size={size} style={{ color: "#ec4899" }} />;
    case "chat":
      return <MessageSquare size={size} style={{ color: "#8b5cf6" }} />;
    case "css":
    case "metadata":
      return <FileCode size={size} style={{ color: "#f59e0b" }} />;
    default:
      return <File size={size} style={{ color: "var(--text-muted)" }} />;
  }
};
