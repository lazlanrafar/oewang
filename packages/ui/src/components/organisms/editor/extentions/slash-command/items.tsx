import {
  MdFormatListBulleted,
  MdFormatListNumbered,
  MdFormatQuote,
  MdHorizontalRule,
  MdImage,
  MdOutlineCode,
  MdOutlineTextFields,
  MdTitle,
  MdUploadFile,
} from "react-icons/md";
import type { SlashCommandItem } from "./types";

export type SlashItemsOptions = {
  // When provided, an "Upload image" item appears; the callback uploads the
  // picked file and returns its URL (or null on failure).
  onImageUpload?: (file: File) => Promise<string | null>;
};

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

export function getSlashItems(options?: SlashItemsOptions): SlashCommandItem[] {
  const items: SlashCommandItem[] = [
    {
      id: "text",
      label: "Text",
      description: "Plain paragraph",
      icon: <MdOutlineTextFields className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    {
      id: "h1",
      label: "Heading 1",
      icon: <MdTitle className="size-4" />,
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 1 })
          .run(),
    },
    {
      id: "h2",
      label: "Heading 2",
      icon: <MdTitle className="size-3.5" />,
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 2 })
          .run(),
    },
    {
      id: "h3",
      label: "Heading 3",
      icon: <MdTitle className="size-3" />,
      command: ({ editor, range }) =>
        editor
          .chain()
          .focus()
          .deleteRange(range)
          .setNode("heading", { level: 3 })
          .run(),
    },
    {
      id: "bullet",
      label: "Bullet List",
      icon: <MdFormatListBulleted className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      id: "numbered",
      label: "Numbered List",
      icon: <MdFormatListNumbered className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      id: "quote",
      label: "Quote",
      icon: <MdFormatQuote className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      id: "code",
      label: "Code Block",
      icon: <MdOutlineCode className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
      id: "divider",
      label: "Divider",
      icon: <MdHorizontalRule className="size-4" />,
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
      id: "image-url",
      label: "Image (URL)",
      description: "Embed an image from a link",
      icon: <MdImage className="size-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        const url = window.prompt("Image URL");
        if (url) editor.chain().focus().setImage({ src: url }).run();
      },
    },
  ];

  if (options?.onImageUpload) {
    const upload = options.onImageUpload;
    items.push({
      id: "image-upload",
      label: "Upload image",
      description: "Upload a file from your device",
      icon: <MdUploadFile className="size-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        pickAndUploadImage(upload, (url) =>
          editor.chain().focus().setImage({ src: url }).run(),
        );
      },
    });
  }

  return items;
}

// Case-insensitive label/description filter for the suggestion popup.
export function filterSlashItems(
  items: SlashCommandItem[],
  query: string,
): SlashCommandItem[] {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter(
    (i) =>
      i.label.toLowerCase().includes(q) ||
      i.description?.toLowerCase().includes(q),
  );
}
