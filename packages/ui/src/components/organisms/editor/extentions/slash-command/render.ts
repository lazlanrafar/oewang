import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";
import { SlashMenu, type SlashMenuRef } from "./slash-menu";
import type { SlashCommandItem } from "./types";

// Suggestion `render` that mounts the SlashMenu React component in a tippy
// popup anchored to the caret. Mirrors Tiptap's canonical slash-command wiring.
export function createSlashRender(): SuggestionOptions<SlashCommandItem>["render"] {
  return () => {
    let component: ReactRenderer<SlashMenuRef> | null = null;
    let popup: Instance[] | null = null;

    return {
      onStart: (props) => {
        component = new ReactRenderer(SlashMenu, {
          props: { items: props.items, command: props.command },
          editor: props.editor,
        });

        if (!props.clientRect) return;

        popup = tippy("body", {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },

      onUpdate: (props) => {
        component?.updateProps({ items: props.items, command: props.command });
        if (props.clientRect) {
          popup?.[0]?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        }
      },

      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          popup?.[0]?.hide();
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },

      onExit: () => {
        popup?.[0]?.destroy();
        component?.destroy();
        popup = null;
        component = null;
      },
    };
  };
}
