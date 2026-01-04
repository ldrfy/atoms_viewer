import { ref, type Ref } from 'vue';

export type FileDropBindings = {
  /** Whether the host is currently in a drag-over state (used for UI overlays). */
  isDragging: Ref<boolean>;
  /** Drag enter handler (increase nested depth). */
  onDragEnter: () => void;
  /** Drag over handler (set drop effect). */
  onDragOver: (e: DragEvent) => void;
  /** Drag leave handler (decrease nested depth). */
  onDragLeave: () => void;
  /** Drop handler (load one or more files). */
  onDrop: (e: DragEvent) => Promise<void>;
  /** Hidden input change handler (load one or more picked files). */
  onFilePicked: (e: Event) => Promise<void>;
};

/**
 * Extracted file drag/drop logic.
 *
 * This keeps useViewerStage.ts focused on rendering, picking, and export,
 * while still exposing the same handler API to the ViewerStage template.
 */
export function useFileDrop(params: {
  loadFiles: (files: File[], source: 'drop' | 'picker') => Promise<void>;
}): FileDropBindings {
  const { loadFiles } = params;

  const dragDepth = ref(0);
  const isDragging = ref(false);

  function onDragEnter(): void {
    dragDepth.value += 1;
    isDragging.value = true;
  }

  function onDragOver(e: DragEvent): void {
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  }

  function onDragLeave(): void {
    dragDepth.value -= 1;
    if (dragDepth.value <= 0) {
      dragDepth.value = 0;
      isDragging.value = false;
    }
  }

  async function onDrop(e: DragEvent): Promise<void> {
    dragDepth.value = 0;
    isDragging.value = false;

    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    await loadFiles(files, 'drop');
  }

  async function onFilePicked(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Reset input so picking the same file again still triggers change.
    input.value = '';
    if (files.length === 0) return;
    await loadFiles(files, 'picker');
  }

  return {
    isDragging,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onFilePicked,
  };
}
