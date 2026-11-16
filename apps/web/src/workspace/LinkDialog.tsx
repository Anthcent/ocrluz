import type { Editor } from '@tiptap/react';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Modal } from '../components/ui';

/** Adds, edits or removes the link at the cursor. With nothing selected, the address itself is inserted as the link. */
export function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = (editor.getAttributes('link').href as string | undefined) ?? '';
  const [url, setUrl] = useState(current);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (!value) return remove();
    // "ejemplo.com" becomes a real address; mailto:, tel: and full URLs are kept as typed.
    const href = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor.chain().focus().insertContent({ type: 'text', text: value, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    onClose();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={current ? 'Editar enlace' : 'Insertar enlace'}>
      <form onSubmit={apply} className="space-y-5">
        <Field label="Dirección del enlace">
          <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ejemplo.com" inputMode="url" autoCapitalize="none" autoCorrect="off" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {current ? (
            <Button variant="plain" onClick={remove}>Quitar enlace</Button>
          ) : (
            <Button variant="plain" onClick={onClose}>Cancelar</Button>
          )}
          <Button type="submit">Aplicar</Button>
        </div>
      </form>
    </Modal>
  );
}
