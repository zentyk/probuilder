import { EditableMesh } from './EditableMesh';
import type { Entity } from './Entity';

export interface HistorySnapshot {
  description: string;
  meshes: any[];
  entities?: any[];
  selectedMeshId: string | null;
  selectedEntityId?: string | null;
  mode: string;
}

export class HistoryManager {
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private maxHistory = 40;
  private isPerformingHistory = false;

  public onHistoryChanged?: () => void;

  public recordState(
    description: string,
    meshes: EditableMesh[],
    selectedMeshId: string | null,
    mode: string,
    entities: Entity[] = [],
    selectedEntityId: string | null = null
  ): void {
    if (this.isPerformingHistory) return;

    const snapshot: HistorySnapshot = {
      description,
      meshes: meshes.map((m) => m.toJSON()),
      entities: entities.map((e) => e.toJSON()),
      selectedMeshId,
      selectedEntityId,
      mode,
    };

    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo stack on new action

    if (this.onHistoryChanged) this.onHistoryChanged();
  }

  public canUndo(): boolean {
    return this.undoStack.length > 1; // Keep initial baseline
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(
    currentMeshes: EditableMesh[],
    currentSelectedId: string | null,
    currentMode: string,
    currentEntities: Entity[] = [],
    currentSelectedEntityId: string | null = null
  ): HistorySnapshot | null {
    if (!this.canUndo()) return null;

    this.isPerformingHistory = true;
    const currentState: HistorySnapshot = {
      description: 'Current State',
      meshes: currentMeshes.map((m) => m.toJSON()),
      entities: currentEntities.map((e) => e.toJSON()),
      selectedMeshId: currentSelectedId,
      selectedEntityId: currentSelectedEntityId,
      mode: currentMode,
    };
    this.redoStack.push(currentState);

    // Pop the current state and restore previous
    this.undoStack.pop();
    const previousState = this.undoStack[this.undoStack.length - 1];

    this.isPerformingHistory = false;
    if (this.onHistoryChanged) this.onHistoryChanged();
    return previousState;
  }

  public redo(): HistorySnapshot | null {
    if (!this.canRedo()) return null;

    this.isPerformingHistory = true;
    const nextState = this.redoStack.pop()!;
    this.undoStack.push(nextState);

    this.isPerformingHistory = false;
    if (this.onHistoryChanged) this.onHistoryChanged();
    return nextState;
  }
}
