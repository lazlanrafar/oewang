"use client";

import type { Editor } from "@tiptap/react";
import { type ReactNode, useEffect, useReducer } from "react";
import {
  MdCode,
  MdFormatBold,
  MdFormatItalic,
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdFormatQuote,
  MdFormatUnderlined,
  MdHorizontalRule,
  MdImage,
  MdLink,
  MdStrikethroughS,
  MdUploadFile,
} from "react-icons/md";
import { cn } from "../../../lib/utils";

// Re-render the toolbar on every editor transaction so active states stay in
// sync with the current selection.
function useEditorForceUpdate(editor: Editor) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const cb = () => force();
    editor.on("transaction", cb);
    return () => {
      editor.off("transaction", cb);
    };
  }, [editor]);
}

function Btn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded px-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

// Opens a native file picker, uploads via the callback, inserts the image.
function pickAndUploadImage(
  onImageUpload: (file: File) => Promise<string | null>,
  insert: (url: string) => void,
) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const url = await onImageUpload(file);
    if (url) insert(url);
  };
  input.click();
}

export function EditorToolbar({
  editor,
  onImageUpload,
}: {
  editor: Editor;
  onImageUpload?: (file: File) => Promise<string | null>;
}) {
  useEditorForceUpdate(editor);

  const insertImage = (url: string) =>
    editor.chain().focus().setImage({ src: url }).run();

  return (
    <div className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-0.5 border-b bg-background p-1">
      <Btn
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <MdFormatBold className="size-4" />
      </Btn>
      <Btn
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <MdFormatItalic className="size-4" />
      </Btn>
      <Btn
        title="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <MdFormatUnderlined className="size-4" />
      </Btn>
      <Btn
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <MdStrikethroughS className="size-4" />
      </Btn>

      <Divider />

      {([1, 2, 3] as const).map((level) => (
        <Btn
          key={level}
          title={`Heading ${level}`}
          active={editor.isActive("heading", { level })}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
        >
          <span className="font-semibold text-xs">H{level}</span>
        </Btn>
      ))}

      <Divider />

      <Btn
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <MdFormatListBulleted className="size-4" />
      </Btn>
      <Btn
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <MdFormatListNumbered className="size-4" />
      </Btn>
      <Btn
        title="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <MdFormatQuote className="size-4" />
      </Btn>
      <Btn
        title="Code block"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <MdCode className="size-4" />
      </Btn>
      <Btn
        title="Divider"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <MdHorizontalRule className="size-4" />
      </Btn>

      <Divider />

      <Btn
        title="Link"
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("Link URL", prev ?? "");
          if (url === null) return;
          if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }
          editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: url })
            .run();
        }}
      >
        <MdLink className="size-4" />
      </Btn>
      <Btn
        title="Image from URL"
        onClick={() => {
          const url = window.prompt("Image URL");
          if (url) insertImage(url);
        }}
      >
        <MdImage className="size-4" />
      </Btn>
      {onImageUpload && (
        <Btn
          title="Upload image"
          onClick={() => pickAndUploadImage(onImageUpload, insertImage)}
        >
          <MdUploadFile className="size-4" />
        </Btn>
      )}
    </div>
  );
}
