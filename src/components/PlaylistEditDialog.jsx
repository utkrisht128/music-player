import React, { useState } from "react";
import { useLibrary } from "../state/LibraryContext";
import { useUI } from "../state/UIContext";

/** Rename a playlist and edit its description. */
export default function PlaylistEditDialog({ playlist }) {
  const { updatePlaylist } = useLibrary();
  const { closeModal, toast } = useUI();
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description || "");

  const save = (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast("Give your playlist a name.", { tone: "error", icon: "warning" });
      return;
    }
    updatePlaylist(playlist.id, { name: trimmed, description: description.trim() });
    closeModal();
    toast("Playlist updated", { icon: "check" });
  };

  return (
    <form className="edit-dialog" onSubmit={save}>
      <label className="field">
        <span className="field__label">Name</span>
        <input
          className="field__input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      </label>

      <label className="field">
        <span className="field__label">Description</span>
        <textarea
          className="field__input field__input--area"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          maxLength={280}
          placeholder="Add an optional description"
        />
      </label>

      <div className="edit-dialog__actions">
        <button type="button" className="btn btn--subtle" onClick={closeModal}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Save
        </button>
      </div>
    </form>
  );
}
