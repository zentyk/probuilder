import { Editor } from '../core/Editor';
import type { SelectionMode, ShapeType, TransformTool } from '../core/types';

export class UIManager {
  private editor: Editor | null = null;
  private container: HTMLElement;

  constructor(container: HTMLElement, editor?: Editor | null) {
    this.container = container;
    this.editor = editor || null;

    this.renderLayout();
    if (this.editor) {
      this.setupEditorHooks();
      this.updateUI();
    }
  }

  public bindEditor(editor: Editor): void {
    this.editor = editor;
    this.setupEditorHooks();
    this.updateUI();
  }

  private renderLayout(): void {
    this.container.innerHTML = `
      <div class="pb-app">
        <!-- Top Navigation Bar -->
        <header class="pb-topbar">
          <div class="pb-brand">
            <div class="pb-logo-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <div class="pb-brand-text">
              <span class="pb-title">VOSKEL</span>
              <span class="pb-badge">WEBGL</span>
            </div>
          </div>

          <div class="pb-divider"></div>

          <!-- Selection Modes -->
          <div class="pb-btn-group pb-mode-group">
            <button class="pb-btn pb-mode-btn active" data-mode="object" title="Object Selection (1)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
              <span>Object</span>
              <span class="pb-key">1</span>
            </button>
            <button class="pb-btn pb-mode-btn" data-mode="vertex" title="Vertex Selection (2)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
              </svg>
              <span>Vertex</span>
              <span class="pb-key">2</span>
            </button>
            <button class="pb-btn pb-mode-btn" data-mode="edge" title="Edge Selection (3)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="4" y1="20" x2="20" y2="4" stroke-width="3"></line>
              </svg>
              <span>Edge</span>
              <span class="pb-key">3</span>
            </button>
            <button class="pb-btn pb-mode-btn" data-mode="face" title="Face Selection (4)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="4" y="4" width="16" height="16" fill="currentColor" fill-opacity="0.3"></rect>
              </svg>
              <span>Face</span>
              <span class="pb-key">4</span>
            </button>
          </div>

          <div class="pb-divider"></div>

          <!-- Transform Tools -->
          <div class="pb-btn-group pb-tool-group">
            <button class="pb-btn pb-tool-btn active" data-tool="translate" title="Translate Tool (W)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="5 9 2 12 5 15"></polyline>
                <polyline points="9 5 12 2 15 5"></polyline>
                <polyline points="15 19 12 22 9 19"></polyline>
                <polyline points="19 9 22 12 19 15"></polyline>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <line x1="12" y1="2" x2="12" y2="22"></line>
              </svg>
              <span class="pb-key">W</span>
            </button>
            <button class="pb-btn pb-tool-btn" data-tool="rotate" title="Rotate Tool (E)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
              </svg>
              <span class="pb-key">E</span>
            </button>
            <button class="pb-btn pb-tool-btn" data-tool="scale" title="Scale Tool (R)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <line x1="10" y1="10" x2="14" y2="14"></line>
              </svg>
              <span class="pb-key">R</span>
            </button>
          </div>

          <div class="pb-divider"></div>

          <!-- Snapping Controls -->
          <div class="pb-snap-controls">
            <button id="pb-snap-toggle" class="pb-btn pb-snap-btn active" title="Toggle Grid Snapping (G)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
                <path d="M12 12v9"></path>
                <path d="m8 17 4 4 4-4"></path>
              </svg>
              <span>Snap</span>
            </button>
            <select id="pb-snap-size" class="pb-select" title="Grid Snap Size">
              <option value="0.125">0.125m</option>
              <option value="0.25">0.25m</option>
              <option value="0.5" selected>0.5m</option>
              <option value="1.0">1.0m</option>
              <option value="2.0">2.0m</option>
            </select>
          </div>

          <div class="pb-divider"></div>

          <!-- Undo / Redo -->
          <div class="pb-btn-group">
            <button id="pb-btn-undo" class="pb-btn pb-icon-btn" title="Undo (Ctrl+Z)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 7v6h6"></path>
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
              </svg>
            </button>
            <button id="pb-btn-redo" class="pb-btn pb-icon-btn" title="Redo (Ctrl+Y)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 7v6h-6"></path>
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path>
              </svg>
            </button>
          </div>

          <div class="pb-spacer"></div>

          <!-- Playtest & Export Actions -->
          <div class="pb-actions-right">
            <button id="pb-playtest-btn" class="pb-btn pb-btn-playtest" title="Toggle First-Person Playtest Mode (P)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span id="pb-playtest-label">Playtest</span>
              <span class="pb-key">P</span>
            </button>

            <!-- Export Menu Button -->
            <div class="pb-dropdown">
              <button id="pb-export-menu-btn" class="pb-btn pb-btn-primary">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Export / Save</span>
                <span class="pb-caret">▼</span>
              </button>
              <div id="pb-export-dropdown" class="pb-dropdown-content">
                <div class="pb-dropdown-item" id="pb-export-obj">
                  <span class="pb-drop-title">Export OBJ (.obj)</span>
                  <span class="pb-drop-desc">For Unity, Unreal, Blender</span>
                </div>
                <div class="pb-dropdown-item" id="pb-export-gltf">
                  <span class="pb-drop-title">Export glTF / GLB</span>
                  <span class="pb-drop-desc">Binary 3D standard format</span>
                </div>
                <div class="pb-dropdown-sep"></div>
                <div class="pb-dropdown-item" id="pb-save-json">
                  <span class="pb-drop-title">Save Scene JSON</span>
                  <span class="pb-drop-desc">Download project file</span>
                </div>
                <div class="pb-dropdown-item" id="pb-load-json">
                  <span class="pb-drop-title">Load Scene JSON...</span>
                  <span class="pb-drop-desc">Restore saved scene</span>
                </div>
              </div>
            </div>
            <input type="file" id="pb-file-input" accept=".json,.pbscene" style="display:none;" />
          </div>
        </header>

        <!-- Main Workspace -->
        <div class="pb-main-workspace">
          <!-- Left Tool Shelf -->
          <aside class="pb-toolshelf">
            <!-- Shape Generator Section -->
            <div class="pb-shelf-section">
              <div class="pb-section-header">
                <span class="pb-section-title">SHAPE GENERATOR</span>
              </div>
              <div class="pb-shape-grid">
                <button class="pb-shape-btn" data-shape="cube" title="Create Cube">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                  </svg>
                  <span>Cube</span>
                </button>
                <button class="pb-shape-btn" data-shape="stairs" title="Create Straight Stairs">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 20h4v-4h4v-4h4V8h4"></path>
                  </svg>
                  <span>Stairs</span>
                </button>
                <button class="pb-shape-btn" data-shape="spiral_stairs" title="Create Spiral Stairs">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v20M8 5l8 3M5 10l14 2M8 17l8 2"></path>
                  </svg>
                  <span>Spiral</span>
                </button>
                <button class="pb-shape-btn" data-shape="ramp" title="Create Ramp / Wedge">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="3 20 21 20 21 6 3 20"></polygon>
                  </svg>
                  <span>Ramp</span>
                </button>
                <button class="pb-shape-btn" data-shape="arch" title="Create Arch / Curved Door">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 20V12a8 8 0 0 1 16 0v8M4 20h4v-8a4 4 0 0 1 8 0v8h4"></path>
                  </svg>
                  <span>Arch</span>
                </button>
                <button class="pb-shape-btn" data-shape="cylinder" title="Create Cylinder / Column">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse>
                    <path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"></path>
                  </svg>
                  <span>Cylinder</span>
                </button>
                <button class="pb-shape-btn" data-shape="doorway" title="Create Doorway Wall">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18"></rect>
                    <rect x="8" y="8" width="8" height="13"></rect>
                  </svg>
                  <span>Doorway</span>
                </button>
                <button class="pb-shape-btn" data-shape="plane" title="Create Floor Plane">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="3 16 12 21 21 16 12 11 3 16"></polygon>
                  </svg>
                  <span>Plane</span>
                </button>
              </div>
            </div>

            <!-- Face Tools Section -->
            <div class="pb-shelf-section">
              <div class="pb-section-header">
                <span class="pb-section-title">FACE TOOLS</span>
                <span class="pb-section-badge">Mode 4</span>
              </div>
              <div class="pb-tool-list">
                <button id="pb-tool-extrude" class="pb-action-btn pb-btn-accent" title="Extrude Face along normal (Shift+E)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v20M17 7l-5-5-5 5"></path>
                  </svg>
                  <span class="pb-action-name">Extrude Face</span>
                  <span class="pb-key">Shift+E</span>
                </button>
                <button id="pb-tool-inset" class="pb-action-btn" title="Inset Face inward (Shift+I)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18"></rect>
                    <rect x="7" y="7" width="10" height="10"></rect>
                  </svg>
                  <span class="pb-action-name">Inset Face</span>
                  <span class="pb-key">Shift+I</span>
                </button>
                <button id="pb-tool-bevel" class="pb-action-btn" title="Bevel / Chamfer Face (Shift+B)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="6 3 18 3 21 6 21 18 18 21 6 21 3 18 3 6 6 3"></polygon>
                  </svg>
                  <span class="pb-action-name">Bevel Face</span>
                  <span class="pb-key">Shift+B</span>
                </button>
                <button id="pb-tool-subdivide" class="pb-action-btn" title="Subdivide Selected Face(s)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18"></rect>
                    <line x1="12" y1="3" x2="12" y2="21"></line>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                  </svg>
                  <span class="pb-action-name">Subdivide</span>
                </button>
                <button id="pb-tool-flip" class="pb-action-btn" title="Flip Face Normals">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"></path>
                  </svg>
                  <span class="pb-action-name">Flip Normals</span>
                </button>
              </div>
            </div>

            <!-- Vertex & Edge Tools Section -->
            <div class="pb-shelf-section">
              <div class="pb-section-header">
                <span class="pb-section-title">ELEMENT TOOLS</span>
              </div>
              <div class="pb-tool-list">
                <button id="pb-tool-merge" class="pb-action-btn" title="Merge Selected Vertices to Centroid">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="6" cy="6" r="3"></circle>
                    <circle cx="18" cy="18" r="3"></circle>
                    <path d="m8.5 8.5 7 7"></path>
                  </svg>
                  <span class="pb-action-name">Merge Vertices</span>
                </button>
                <button id="pb-tool-select-all" class="pb-action-btn" title="Select All in current mode">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" stroke-dasharray="2 2"></rect>
                  </svg>
                  <span class="pb-action-name">Select All</span>
                  <span class="pb-key">Ctrl+A</span>
                </button>
                <button id="pb-tool-invert-select" class="pb-action-btn" title="Invert Selection">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 0 0-9-9v18a9 9 0 0 0 9-9z"></path>
                  </svg>
                  <span class="pb-action-name">Invert Selection</span>
                </button>
              </div>
            </div>

            <!-- Object Actions Section -->
            <div class="pb-shelf-section">
              <div class="pb-section-header">
                <span class="pb-section-title">OBJECT TOOLS</span>
              </div>
              <div class="pb-tool-list">
                <button id="pb-tool-duplicate" class="pb-action-btn" title="Duplicate Selected Object">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <span class="pb-action-name">Duplicate</span>
                </button>
                <button id="pb-tool-center-pivot" class="pb-action-btn" title="Recenter Pivot to Bounding Box Centroid">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="2"></circle>
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>
                  </svg>
                  <span class="pb-action-name">Center Pivot</span>
                </button>
                <button id="pb-tool-delete" class="pb-action-btn pb-btn-danger" title="Delete Selected (Del)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  <span class="pb-action-name">Delete</span>
                  <span class="pb-key">Del</span>
                </button>
              </div>
            </div>

            <!-- Prototype Materials Palette -->
            <div class="pb-shelf-section">
              <div class="pb-section-header">
                <span class="pb-section-title">DEV MATERIALS</span>
              </div>
              <div class="pb-material-palette">
                <div class="pb-mat-chip active" data-mat="dev_orange" title="Voskel Orange">
                  <span class="pb-mat-color" style="background:#e66b1a;"></span>
                  <span>Orange</span>
                </div>
                <div class="pb-mat-chip" data-mat="dev_gray" title="Dev Grid Neutral Gray">
                  <span class="pb-mat-color" style="background:#717887;"></span>
                  <span>Grid Gray</span>
                </div>
                <div class="pb-mat-chip" data-mat="dev_dark" title="Dev Grid Dark Slate">
                  <span class="pb-mat-color" style="background:#2b2e38;"></span>
                  <span>Dark Slate</span>
                </div>
                <div class="pb-mat-chip" data-mat="dev_blue" title="Dev Grid Cyan">
                  <span class="pb-mat-color" style="background:#1e88e5;"></span>
                  <span>Cyan Grid</span>
                </div>
                <div class="pb-mat-chip" data-mat="dev_hazard" title="Warning Hazard Stripe">
                  <span class="pb-mat-color" style="background:repeating-linear-gradient(45deg,#f1c40f,#f1c40f 4px,#1e2024 4px,#1e2024 8px);"></span>
                  <span>Hazard</span>
                </div>
                <div class="pb-mat-chip" data-mat="dev_concrete" title="Clean Concrete">
                  <span class="pb-mat-color" style="background:#b0b5be;"></span>
                  <span>Concrete</span>
                </div>
              </div>
            </div>
          </aside>

          <!-- 3D Viewport Viewport Container -->
          <div id="pb-viewport-container" class="pb-viewport-container">
            <!-- Viewport Reticle for Playtest -->
            <div id="pb-playtest-reticle" class="pb-playtest-reticle"></div>

            <!-- Playtest Banner -->
            <div id="pb-playtest-banner" class="pb-playtest-banner">
              <div class="pb-banner-pulse"></div>
              <span>PLAYTEST MODE &bull; WASD to Move &bull; Space to Jump &bull; Mouse to Look &bull; Press ESC to Exit</span>
              <button id="pb-exit-playtest-btn" class="pb-btn pb-btn-sm">Exit Playtest</button>
            </div>

            <!-- Viewport Bottom Status Bar -->
            <div class="pb-viewport-footer">
              <div class="pb-footer-left">
                <span id="pb-status-info">Ready</span>
              </div>
              <div class="pb-footer-center">
                <span class="pb-shortcut-pill"><kbd>1-4</kbd> Mode</span>
                <span class="pb-shortcut-pill"><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd> Gizmo</span>
                <span class="pb-shortcut-pill"><kbd>G</kbd> Snap</span>
                <span class="pb-shortcut-pill"><kbd>Shift+E</kbd> Extrude</span>
                <span class="pb-shortcut-pill"><kbd>P</kbd> Playtest</span>
              </div>
              <div class="pb-footer-right">
                <span id="pb-coords-info">Grid: 0.5m</span>
              </div>
            </div>
          </div>

          <!-- Right Inspector Panel -->
          <aside class="pb-inspector">
            <!-- Hierarchy Section -->
            <div class="pb-shelf-section pb-hierarchy-section">
              <div class="pb-section-header">
                <span class="pb-section-title">HIERARCHY</span>
                <span id="pb-mesh-count" class="pb-section-badge">0 Meshes</span>
              </div>
              <div id="pb-hierarchy-list" class="pb-hierarchy-list"></div>
            </div>

            <!-- Transform Inspector Section -->
            <div class="pb-shelf-section">
              <div class="pb-section-header">
                <span class="pb-section-title">TRANSFORM</span>
                <span id="pb-selected-mesh-name" class="pb-section-name">None</span>
              </div>
              <div class="pb-transform-inputs">
                <div class="pb-vector-row">
                  <span class="pb-row-label">Position</span>
                  <div class="pb-axis-inputs">
                    <div class="pb-axis-field"><span class="pb-axis-tag x">X</span><input id="pb-pos-x" type="number" step="0.5" value="0.00" /></div>
                    <div class="pb-axis-field"><span class="pb-axis-tag y">Y</span><input id="pb-pos-y" type="number" step="0.5" value="0.00" /></div>
                    <div class="pb-axis-field"><span class="pb-axis-tag z">Z</span><input id="pb-pos-z" type="number" step="0.5" value="0.00" /></div>
                  </div>
                </div>
                <div class="pb-vector-row">
                  <span class="pb-row-label">Rotation</span>
                  <div class="pb-axis-inputs">
                    <div class="pb-axis-field"><span class="pb-axis-tag x">X</span><input id="pb-rot-x" type="number" step="15" value="0" /></div>
                    <div class="pb-axis-field"><span class="pb-axis-tag y">Y</span><input id="pb-rot-y" type="number" step="15" value="0" /></div>
                    <div class="pb-axis-field"><span class="pb-axis-tag z">Z</span><input id="pb-rot-z" type="number" step="15" value="0" /></div>
                  </div>
                </div>
                <div class="pb-vector-row">
                  <span class="pb-row-label">Scale</span>
                  <div class="pb-axis-inputs">
                    <div class="pb-axis-field"><span class="pb-axis-tag x">X</span><input id="pb-scale-x" type="number" step="0.25" value="1.00" /></div>
                    <div class="pb-axis-field"><span class="pb-axis-tag y">Y</span><input id="pb-scale-y" type="number" step="0.25" value="1.00" /></div>
                    <div class="pb-axis-field"><span class="pb-axis-tag z">Z</span><input id="pb-scale-z" type="number" step="0.25" value="1.00" /></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Topology Stats Section -->
            <div class="pb-shelf-section">
              <div class="pb-section-header">
                <span class="pb-section-title">TOPOLOGY STATS</span>
              </div>
              <div class="pb-stats-grid">
                <div class="pb-stat-card">
                  <span class="pb-stat-num" id="pb-stat-verts">0</span>
                  <span class="pb-stat-label">Vertices</span>
                </div>
                <div class="pb-stat-card">
                  <span class="pb-stat-num" id="pb-stat-faces">0</span>
                  <span class="pb-stat-label">Faces</span>
                </div>
                <div class="pb-stat-card">
                  <span class="pb-stat-num" id="pb-stat-edges">0</span>
                  <span class="pb-stat-label">Edges</span>
                </div>
                <div class="pb-stat-card">
                  <span class="pb-stat-num" id="pb-stat-selected">0</span>
                  <span class="pb-stat-label" id="pb-stat-selected-label">Selected</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <!-- Toast Notifications Container -->
        <div id="pb-toast-container" class="pb-toast-container"></div>
      </div>
    `;

    this.setupDOMEvents();
  }

  private setupDOMEvents(): void {
    // Mode Buttons
    const modeButtons = this.container.querySelectorAll('.pb-mode-btn');
    modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.editor) return;
        const mode = btn.getAttribute('data-mode') as SelectionMode;
        this.editor.setSelectionMode(mode);
      });
    });

    // Tool Buttons
    const toolButtons = this.container.querySelectorAll('.pb-tool-btn');
    toolButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.editor) return;
        const tool = btn.getAttribute('data-tool') as TransformTool;
        this.editor.setTransformTool(tool);
      });
    });

    // Snap Toggle
    const snapToggle = this.container.querySelector('#pb-snap-toggle')!;
    snapToggle.addEventListener('click', () => {
      if (!this.editor) return;
      this.editor.toggleSnapping();
    });

    // Snap Size Select
    const snapSize = this.container.querySelector('#pb-snap-size') as HTMLSelectElement;
    snapSize.addEventListener('change', () => {
      if (!this.editor) return;
      this.editor.setSnapSize(parseFloat(snapSize.value));
    });

    // Undo / Redo
    this.container.querySelector('#pb-btn-undo')!.addEventListener('click', () => this.editor?.undo());
    this.container.querySelector('#pb-btn-redo')!.addEventListener('click', () => this.editor?.redo());

    // Playtest Button
    this.container.querySelector('#pb-playtest-btn')!.addEventListener('click', () => this.editor?.togglePlaytest());
    this.container.querySelector('#pb-exit-playtest-btn')!.addEventListener('click', () => this.editor?.exitPlaytest());

    // Export Dropdown
    const exportBtn = this.container.querySelector('#pb-export-menu-btn')!;
    const exportDrop = this.container.querySelector('#pb-export-dropdown')!;
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportDrop.classList.toggle('show');
    });
    window.addEventListener('click', () => {
      exportDrop.classList.remove('show');
    });

    this.container.querySelector('#pb-export-obj')!.addEventListener('click', () => this.editor?.exportOBJ());
    this.container.querySelector('#pb-export-gltf')!.addEventListener('click', () => this.editor?.exportGLTF());
    this.container.querySelector('#pb-save-json')!.addEventListener('click', () => this.editor?.saveSceneToJSON());

    const fileInput = this.container.querySelector('#pb-file-input') as HTMLInputElement;
    this.container.querySelector('#pb-load-json')!.addEventListener('click', () => {
      fileInput.click();
    });
    fileInput.addEventListener('change', (e: any) => {
      const file = e.target.files?.[0];
      if (file && this.editor) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result && this.editor) {
            this.editor.loadSceneFromJSON(event.target.result as string);
          }
        };
        reader.readAsText(file);
      }
    });

    // Shape Generator Buttons
    const shapeButtons = this.container.querySelectorAll('.pb-shape-btn');
    shapeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.editor) return;
        const shapeType = btn.getAttribute('data-shape') as ShapeType;
        this.editor.createShape(shapeType);
      });
    });

    // Face Tools
    this.container.querySelector('#pb-tool-extrude')!.addEventListener('click', () => this.editor?.extrudeSelected());
    this.container.querySelector('#pb-tool-inset')!.addEventListener('click', () => this.editor?.insetSelected());
    this.container.querySelector('#pb-tool-bevel')!.addEventListener('click', () => this.editor?.bevelSelected());
    this.container.querySelector('#pb-tool-subdivide')!.addEventListener('click', () => this.editor?.subdivideSelected());
    this.container.querySelector('#pb-tool-flip')!.addEventListener('click', () => this.editor?.flipNormalsSelected());

    // Element Tools
    this.container.querySelector('#pb-tool-merge')!.addEventListener('click', () => this.editor?.mergeSelectedVertices());
    this.container.querySelector('#pb-tool-select-all')!.addEventListener('click', () => this.editor?.selectionManager.selectAll());
    this.container.querySelector('#pb-tool-invert-select')!.addEventListener('click', () => this.editor?.selectionManager.invertSelection());

    // Object Tools
    this.container.querySelector('#pb-tool-duplicate')!.addEventListener('click', () => this.editor?.duplicateSelected());
    this.container.querySelector('#pb-tool-center-pivot')!.addEventListener('click', () => this.editor?.centerPivotSelected());
    this.container.querySelector('#pb-tool-delete')!.addEventListener('click', () => this.editor?.deleteSelected());

    // Material Chips
    const matChips = this.container.querySelectorAll('.pb-mat-chip');
    matChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        if (!this.editor) return;
        matChips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const matId = chip.getAttribute('data-mat')!;
        this.editor.applyMaterialToSelected(matId);
      });
    });

    // Transform Inspector Inputs
    const setupTransformInput = (id: string, axis: 'x' | 'y' | 'z', type: 'pos' | 'rot' | 'scale') => {
      const input = this.container.querySelector(id) as HTMLInputElement;
      input.addEventListener('change', () => {
        if (!this.editor) return;
        const mesh = this.editor.selectionManager.selectedMesh;
        if (!mesh) return;
        const val = parseFloat(input.value);
        if (isNaN(val)) return;

        if (type === 'pos') {
          mesh.group.position[axis] = val;
        } else if (type === 'rot') {
          mesh.group.rotation[axis] = (val * Math.PI) / 180;
        } else if (type === 'scale') {
          mesh.group.scale[axis] = Math.max(0.001, val);
        }
        mesh.group.updateMatrixWorld(true);
        this.editor.gizmoManager.updateGizmoAttachment();
        this.editor.recordHistory('Transform Input');
      });
    };

    setupTransformInput('#pb-pos-x', 'x', 'pos');
    setupTransformInput('#pb-pos-y', 'y', 'pos');
    setupTransformInput('#pb-pos-z', 'z', 'pos');

    setupTransformInput('#pb-rot-x', 'x', 'rot');
    setupTransformInput('#pb-rot-y', 'y', 'rot');
    setupTransformInput('#pb-rot-z', 'z', 'rot');

    setupTransformInput('#pb-scale-x', 'x', 'scale');
    setupTransformInput('#pb-scale-y', 'y', 'scale');
    setupTransformInput('#pb-scale-z', 'z', 'scale');
  }

  private setupEditorHooks(): void {
    if (!this.editor) return;
    this.editor.onStateChanged = () => this.updateUI();

    this.editor.onToastMessage = (msg, type = 'info') => {
      this.showToast(msg, type);
    };
  }

  public updateUI(): void {
    if (!this.editor) return;
    const mode = this.editor.selectionManager.mode;
    const tool = this.editor.gizmoManager.tool;
    const snapping = this.editor.gizmoManager.snapping;
    const isPlaytest = this.editor.playtestController.isActive;
    const mesh = this.editor.selectionManager.selectedMesh;

    // Mode buttons active state
    this.container.querySelectorAll('.pb-mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });

    // Tool buttons active state
    this.container.querySelectorAll('.pb-tool-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);
    });

    // Snapping toggle active state
    const snapBtn = this.container.querySelector('#pb-snap-toggle')!;
    snapBtn.classList.toggle('active', snapping.enabled);

    // Playtest button active state
    const playBtn = this.container.querySelector('#pb-playtest-btn')!;
    const playLabel = this.container.querySelector('#pb-playtest-label')!;
    playBtn.classList.toggle('playing', isPlaytest);
    playLabel.textContent = isPlaytest ? 'Exit Playtest' : 'Playtest';

    // Playtest HUD elements
    const playBanner = this.container.querySelector('#pb-playtest-banner')!;
    const playReticle = this.container.querySelector('#pb-playtest-reticle')!;
    playBanner.classList.toggle('show', isPlaytest);
    playReticle.classList.toggle('show', isPlaytest);

    // Undo / Redo button enabled states
    const undoBtn = this.container.querySelector('#pb-btn-undo') as HTMLButtonElement;
    const redoBtn = this.container.querySelector('#pb-btn-redo') as HTMLButtonElement;
    undoBtn.disabled = !this.editor.historyManager.canUndo();
    redoBtn.disabled = !this.editor.historyManager.canRedo();

    // Hierarchy list
    this.updateHierarchy();

    // Transform Inspector
    const meshNameLabel = this.container.querySelector('#pb-selected-mesh-name')!;
    if (mesh) {
      meshNameLabel.textContent = mesh.name;
      (this.container.querySelector('#pb-pos-x') as HTMLInputElement).value = mesh.group.position.x.toFixed(2);
      (this.container.querySelector('#pb-pos-y') as HTMLInputElement).value = mesh.group.position.y.toFixed(2);
      (this.container.querySelector('#pb-pos-z') as HTMLInputElement).value = mesh.group.position.z.toFixed(2);

      (this.container.querySelector('#pb-rot-x') as HTMLInputElement).value = ((mesh.group.rotation.x * 180) / Math.PI).toFixed(0);
      (this.container.querySelector('#pb-rot-y') as HTMLInputElement).value = ((mesh.group.rotation.y * 180) / Math.PI).toFixed(0);
      (this.container.querySelector('#pb-rot-z') as HTMLInputElement).value = ((mesh.group.rotation.z * 180) / Math.PI).toFixed(0);

      (this.container.querySelector('#pb-scale-x') as HTMLInputElement).value = mesh.group.scale.x.toFixed(2);
      (this.container.querySelector('#pb-scale-y') as HTMLInputElement).value = mesh.group.scale.y.toFixed(2);
      (this.container.querySelector('#pb-scale-z') as HTMLInputElement).value = mesh.group.scale.z.toFixed(2);
    } else {
      meshNameLabel.textContent = 'None';
    }

    // Topology Stats
    const vertCount = mesh ? mesh.vertices.length : 0;
    const faceCount = mesh ? mesh.faces.length : 0;
    const edgeCount = mesh ? mesh.getUniqueEdges().length : 0;

    let selectedCount = 0;
    let selectedLabel = 'Selected';
    if (mode === 'vertex') {
      selectedCount = this.editor.selectionManager.selectedVertices.size;
      selectedLabel = 'Verts Sel';
    } else if (mode === 'edge') {
      selectedCount = this.editor.selectionManager.selectedEdges.size;
      selectedLabel = 'Edges Sel';
    } else if (mode === 'face') {
      selectedCount = this.editor.selectionManager.selectedFaces.size;
      selectedLabel = 'Faces Sel';
    } else {
      selectedCount = mesh ? 1 : 0;
      selectedLabel = 'Objects';
    }

    this.container.querySelector('#pb-stat-verts')!.textContent = vertCount.toString();
    this.container.querySelector('#pb-stat-faces')!.textContent = faceCount.toString();
    this.container.querySelector('#pb-stat-edges')!.textContent = edgeCount.toString();
    this.container.querySelector('#pb-stat-selected')!.textContent = selectedCount.toString();
    this.container.querySelector('#pb-stat-selected-label')!.textContent = selectedLabel;

    // Status bar text
    const statusInfo = this.container.querySelector('#pb-status-info')!;
    if (isPlaytest) {
      statusInfo.textContent = 'Playtesting level (FPS controller active)';
    } else if (mesh) {
      statusInfo.textContent = `${mesh.name} (${mode.toUpperCase()} Mode) — ${selectedCount} ${selectedLabel}`;
    } else {
      statusInfo.textContent = 'Ready — Click on any mesh to select';
    }

    // Grid snap footer
    const coordsInfo = this.container.querySelector('#pb-coords-info')!;
    coordsInfo.textContent = `Snap: ${snapping.enabled ? snapping.translate + 'm' : 'OFF'}`;
  }

  private updateHierarchy(): void {
    if (!this.editor) return;
    const list = this.container.querySelector('#pb-hierarchy-list')!;
    const countBadge = this.container.querySelector('#pb-mesh-count')!;
    countBadge.textContent = `${this.editor.meshes.length} Meshes`;

    list.innerHTML = '';
    for (const mesh of this.editor.meshes) {
      const isSelected = this.editor.selectionManager.selectedMesh === mesh;
      const item = document.createElement('div');
      item.className = `pb-hierarchy-item ${isSelected ? 'selected' : ''}`;
      item.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        </svg>
        <span class="pb-item-name">${mesh.name}</span>
        <span class="pb-item-faces">${mesh.faces.length}f</span>
      `;
      item.addEventListener('click', () => {
        this.editor.selectionManager.selectMesh(mesh);
        this.editor.gizmoManager.updateGizmoAttachment();
        this.updateUI();
      });
      list.appendChild(item);
    }
  }

  public showToast(msg: string, type: 'info' | 'success' | 'warn' = 'info'): void {
    const container = this.container.querySelector('#pb-toast-container')!;
    const toast = document.createElement('div');
    toast.className = `pb-toast pb-toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }
}
