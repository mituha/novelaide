import { useEffect, RefObject } from 'react';

export function useAutoResize(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string
) {
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value, textareaRef]);
}
