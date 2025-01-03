import StarterKit from '@tiptap/starter-kit';
import Document from '@tiptap/extension-document';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Typography from '@tiptap/extension-typography';
import { generateHTML } from '@tiptap/html';
import { Editor } from '@tiptap/core';

const extensions = [
  Typography,
  Image,
  Document.extend({
    content: 'heading block*',
  }),
  StarterKit.configure({
    document: false,
  }),
  Placeholder.configure({
    placeholder: ({ node }) => {
      if (node.type.name === 'heading') {
        return 'New page';
      }

      return '';
    },
  }),
];

const editorOptions = {
  injectCSS: true,
  editable: true,
  extensions,
};

export const enableEditor = () => {
  const placeHolder = document.getElementById('editor-placeholder');
  const pageContent = document.querySelector(
    '[name="pageContent"]'
  ) as HTMLInputElement;
  const pageTitle = document.querySelector(
    '[name="pageTitle"]'
  ) as HTMLInputElement;
  const placeHolderContent = (placeHolder?.textContent ?? '').trim();
  if (placeHolder) {
    placeHolder.textContent = '';
  }

  const editor = new Editor({
    ...editorOptions,
    element: placeHolder ?? document.createElement('div'),
    content: placeHolderContent,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      if (!json || !Array.isArray(json.content)) {
        return;
      }
      const heading = json.content[0];
      const rest = json.content.slice(1);

      pageTitle.value = Array.isArray(heading.content)
        ? (
            heading.content.reduce((acc, node) => acc + node.text, '') || ''
          ).trim()
        : '';

      pageContent.value =
        rest.length === 0
          ? ''
          : generateHTML({ ...json, content: rest }, extensions);
    },
  });

  editor.commands.focus();
  return editor;
};

export type TipTapEditor = ReturnType<typeof enableEditor>;
