import { useRef, useState } from "react";

interface FileDropProps {
  /** Lo que acepta el selector de archivos del navegador. */
  accept: string;
  /** Qué formatos se admiten, dicho para una persona. */
  formats: string;
  prompt: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
}

/**
 * Zona para soltar o elegir un archivo de la reunión.
 *
 * Presentacional: no sabe qué archivo es ni a dónde va. La usan el audio y la
 * transcripción, que son las dos entradas posibles de una misma reunión.
 */
export function FileDrop({
  accept,
  formats,
  prompt,
  busyLabel,
  busy,
  disabled = false,
  onFile,
}: FileDropProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const closed = busy || disabled;

  return (
    <div
      className={dragging ? "dropzone dropzone--over" : "dropzone"}
      onDragOver={(event) => {
        event.preventDefault();
        if (!closed) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file && !closed) onFile(file);
      }}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      <p className="dropzone__text">
        {busy ? busyLabel : prompt}
        <br />
        <span className="dropzone__formats">{formats}</span>
      </p>
      <div className="audio__meta">
        <button
          type="button"
          className="btn btn--small btn--primary"
          disabled={closed}
          onClick={() => input.current?.click()}
        >
          {busy ? busyLabel : "Elegir archivo"}
        </button>
      </div>
    </div>
  );
}
