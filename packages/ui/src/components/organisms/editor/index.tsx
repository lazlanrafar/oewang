"use client";

import "./styles.css";
import "tippy.js/dist/tippy.css";

import {
  EditorContent,
  type Editor as EditorInstance,
  type JSONContent,
  useEditor,
} from "@tiptap/react";
import { BubbleMenu } from "./extentions/bubble-menu";
import { registerExtensions } from "./extentions/register";
import { EditorToolbar } from "./toolbar";

type EditorProps = {
  initialContent?: JSONContent | string;
  placeholder?: string;
  onUpdate?: (editor: EditorInstance) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  className?: string;
  tabIndex?: number;
  // Enables the Notion-style "/" block menu + inline images.
  richBlocks?: boolean;
  // Uploads a pasted/dropped/picked image file and returns its hosted URL.
  onImageUpload?: (file: File) => Promise<string | null>;
};

export function Editor({
  initialContent,
  placeholder,
  onUpdate,
  onBlur,
  onFocus,
  className,
  tabIndex,
  richBlocks,
  onImageUpload,
}: EditorProps) {
  const editor = useEditor({
    extensions: registerExtensions({ placeholder, richBlocks, onImageUpload }),
    content: initialContent,
    immediatelyRender: false,
    onBlur,
    onFocus,
    onUpdate: ({ editor }) => {
      onUpdate?.(editor);
    },
    editorProps:
      richBlocks && onImageUpload
        ? {
            // Upload image files dropped or pasted into the editor, then insert
            // them at the caret. Non-image content falls through untouched.
            handlePaste: (view, event) => {
              const file = imageFromDataTransfer(event.clipboardData);
              if (!file) return false;
              event.preventDefault();
              uploadAndInsert(file);
              return true;
            },
            handleDrop: (view, event) => {
              const file = imageFromDataTransfer(
                (event as DragEvent).dataTransfer,
              );
              if (!file) return false;
              event.preventDefault();
              uploadAndInsert(file);
              return true;
            },
          }
        : undefined,
  });

  async function uploadAndInsert(file: File) {
    if (!editor || !onImageUpload) return;
    const url = await onImageUpload(file);
    if (url) editor.chain().focus().setImage({ src: url }).run();
  }

  if (!editor) return null;

  return (
    <>
      {richBlocks && (
        <EditorToolbar editor={editor} onImageUpload={onImageUpload} />
      )}
      <EditorContent
        editor={editor}
        className={className}
        tabIndex={tabIndex}
      />
      <BubbleMenu editor={editor} />
    </>
  );
}

// First image file found on a clipboard/drag payload, or null.
function imageFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  const files = Array.from(dt.files);
  return files.find((f) => f.type.startsWith("image/")) ?? null;
}
