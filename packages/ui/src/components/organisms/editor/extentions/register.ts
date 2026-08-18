// You can find the list of extensions here: https://tiptap.dev/docs/editor/extensions/functionality

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import type { AnyExtension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { SlashCommand } from "./slash-command";
import { filterSlashItems, getSlashItems } from "./slash-command/items";
import { createSlashRender } from "./slash-command/render";

// Add your extensions here
const extensions = [
  StarterKit,
  Underline,
  Link.configure({
    openOnClick: false,
    autolink: true,
    defaultProtocol: "https",
  }),
];

export type RegisterOptions = {
  placeholder?: string;
  // Enables the Notion-style "/" block menu + inline images.
  richBlocks?: boolean;
  // When provided, adds an "Upload image" slash item; returns the hosted URL.
  onImageUpload?: (file: File) => Promise<string | null>;
};

export function registerExtensions(options?: RegisterOptions) {
  const { placeholder, richBlocks, onImageUpload } = options ?? {};
  const list: AnyExtension[] = [
    ...extensions,
    Placeholder.configure({ placeholder }),
  ];

  if (richBlocks) {
    list.push(Image.configure({ inline: false, allowBase64: false }));
    list.push(
      SlashCommand.configure({
        suggestion: {
          char: "/",
          startOfLine: false,
          items: ({ query }) =>
            filterSlashItems(getSlashItems({ onImageUpload }), query),
          render: createSlashRender(),
          command: ({ editor, range, props }) => {
            props.command({ editor, range });
          },
        },
      }),
    );
  }

  return list;
}
