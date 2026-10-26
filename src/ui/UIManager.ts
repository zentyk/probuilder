import * as THREE from 'three';
import { Editor } from '../core/Editor';
import type { ClipMode, CSGMode, SelectionMode, ShapeType, TransformTool } from '../core/types';

export class UIManager {
  private editor: Editor | null = null;
  private container: HTMLElement;
  private textureEventsBound = false;

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
            <button class="pb-btn pb-mode-btn" data-mode="brush" id="pb-mode-brush-btn" title="Drag-to-Create Brush Tool (B)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
              <span>Brush</span>
              <span class="pb-key">B</span>
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
            <!-- Brush Tool Section (TrenchBroom / Hammer style) -->
            <div class="pb-shelf-section">
              <div class="pb-section-header">
                <span class="pb-section-title">BRUSH TOOL</span> 
              </div>
              <button id="pb-tool-drag-brush" class="pb-brush-hero-btn" title="Click & Drag to Create Brush on Grid (B)">
                <div class="pb-brush-icon-wrapper">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                    <path d="M2 17l10 5 10-5"></path>
                    <path d="M2 12l10 5 10-5"></path>
                  </svg>
                </div>
                <div class="pb-brush-hero-text">
                  <span class="pb-brush-hero-title">Drag Brush</span>
                  <span class="pb-brush-hero-desc">Click &amp; drag on floor grid</span>
                </div>
                <span class="pb-key">B</span>
              </button>
              <div class="pb-brush-controls">
                <div class="pb-brush-height-row">
                  <label for="pb-brush-default-height">Default Height:</label>
                  <div class="pb-input-stepper pb-input-stepper-sm">
                    <input type="number" id="pb-brush-default-height" value="2.0" step="0.25" min="0.1" max="50" class="pb-text-input pb-text-input-sm" />
                    <span class="pb-unit">m</span>
                  </div>
                </div>
              </div>
            </div>

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

            <!-- Entities Section (Placeable Game Objects - Hammer / TrenchBroom style) -->
            <div class="pb-shelf-section">
              <div class="pb-section-header">
                <span class="pb-section-title">ENTITIES</span>
                <span class="pb-section-badge">Game Objects</span>
              </div>
              <div class="pb-entity-grid">
                <button id="pb-btn-add-spawn" class="pb-entity-btn" title="Add Player Spawn Point (info_player_start)">
                  <div class="pb-entity-btn-icon spawn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="7" r="4"></circle>
                      <path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"></path>
                    </svg>
                  </div>
                  <div class="pb-entity-btn-info">
                    <span class="pb-entity-btn-name">Player Spawn</span>
                    <span class="pb-entity-btn-sub">info_player_start</span>
                  </div>
                </button>
                <button id="pb-btn-add-point-light" class="pb-entity-btn" title="Add Point Light Entity (light)">
                  <div class="pb-entity-btn-icon light">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 6h8c1.5-1.5 3-3.5 3-6a7 7 0 0 0-7-7z"></path>
                    </svg>
                  </div>
                  <div class="pb-entity-btn-info">
                    <span class="pb-entity-btn-name">Point Light</span>
                    <span class="pb-entity-btn-sub">Omni illumination</span>
                  </div>
                </button>
                <button id="pb-btn-add-spot-light" class="pb-entity-btn" title="Add Spot Light Entity (light_spot)">
                  <div class="pb-entity-btn-icon spot">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="m15 4-3 3 7 7 3-3z"></path>
                      <path d="m9 10-6 6v3h3l6-6"></path>
                      <line x1="14" y1="9" x2="19" y2="14"></line>
                    </svg>
                  </div>
                  <div class="pb-entity-btn-info">
                    <span class="pb-entity-btn-name">Spot Light</span>
                    <span class="pb-entity-btn-sub">Cone spotlight</span>
                  </div>
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
                <button id="pb-tool-texture-inspector" class="pb-action-btn pb-btn-accent-glow" title="Surface Inspector / Texture Alignment &amp; Eyedropper (Shift+A)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="6" cy="6" r="3"></circle>
                    <path d="M14 4l6 6M4 14l6 6M13.5 6.5l4 4M7.5 12.5l4 4"></path>
                    <path d="M2 22l5-5"></path>
                  </svg>
                  <span class="pb-action-name">Surface Inspector</span>
                  <span class="pb-key">Shift+A</span>
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
                <button id="pb-tool-clip" class="pb-action-btn pb-btn-accent-glow" title="Clip / Slicing Plane Tool (Shift+X) - Hammer Knife Tool">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="3" y1="3" x2="21" y2="21"></line>
                    <polygon points="14 3 21 3 21 10 14 3"></polygon>
                    <polygon points="3 14 3 21 10 21 3 14"></polygon>
                  </svg>
                  <span class="pb-action-name">Clip Tool</span>
                  <span class="pb-key">Shift+X</span>
                </button>
                <button id="pb-tool-hollow" class="pb-action-btn pb-btn-accent-glow" title="Make Hollow Room (Ctrl+H)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <rect x="7" y="7" width="10" height="10" stroke-dasharray="2 2"></rect>
                  </svg>
                  <span class="pb-action-name">Make Hollow</span>
                  <span class="pb-key">Ctrl+H</span>
                </button>
                <button id="pb-tool-csg" class="pb-action-btn pb-btn-accent-glow" title="CSG Carve / Booleans (Ctrl+Shift+C) - Hammer Carve Doorways & Windows">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="13" height="13" rx="1.5"></rect>
                    <rect x="9" y="9" width="12" height="12" rx="1.5" stroke-dasharray="2 2"></rect>
                  </svg>
                  <span class="pb-action-name">CSG Carve</span>
                  <span class="pb-key">Ctrl+Shift+C</span>
                </button>
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
                <span class="pb-shortcut-pill"><kbd>Shift+X</kbd> Clip</span>
                <span class="pb-shortcut-pill"><kbd>Ctrl+Shift+C</kbd> Carve</span>
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

            <!-- Entity Inspector Section (Shown when an entity is selected) -->
            <div id="pb-entity-inspector" class="pb-shelf-section pb-entity-inspector" style="display: none;">
              <div class="pb-section-header">
                <span class="pb-section-title">ENTITY PROPERTIES</span>
                <span id="pb-entity-type-badge" class="pb-section-badge">light</span>
              </div>

              <!-- Entity Name Field -->
              <div class="pb-entity-row">
                <label for="pb-entity-name-input">Name</label>
                <input type="text" id="pb-entity-name-input" class="pb-text-input pb-text-input-sm" />
              </div>

              <!-- Player Spawn Controls -->
              <div id="pb-entity-props-spawn" class="pb-entity-subprops" style="display: none;">
                <div class="pb-entity-row">
                  <div class="pb-field-header">
                    <label>Spawn Yaw</label>
                    <span id="pb-spawn-yaw-display" class="pb-field-val">0°</span>
                  </div>
                  <div class="pb-entity-yaw-row">
                    <input type="range" id="pb-spawn-yaw-slider" min="0" max="360" step="15" value="0" class="pb-tex-slider" />
                    <input type="number" id="pb-spawn-yaw-num" min="0" max="360" step="1" value="0" class="pb-text-input pb-text-input-sm pb-entity-yaw-num" />
                  </div>
                </div>
                <div class="pb-preset-chips pb-compass-chips">
                  <button type="button" class="pb-chip active" data-yaw="0" title="North (-Z)">0° N</button>
                  <button type="button" class="pb-chip" data-yaw="90" title="East (+X)">90° E</button>
                  <button type="button" class="pb-chip" data-yaw="180" title="South (+Z)">180° S</button>
                  <button type="button" class="pb-chip" data-yaw="270" title="West (-X)">270° W</button>
                </div>
                <div class="pb-entity-action-box">
                  <button id="pb-btn-test-from-spawn" class="pb-btn pb-btn-sm pb-btn-accent" style="width: 100%;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <span>Test Play from Here</span>
                  </button>
                </div>
              </div>

              <!-- Light (Point & Spot) Controls -->
              <div id="pb-entity-props-light" class="pb-entity-subprops" style="display: none;">
                <!-- Light Color -->
                <div class="pb-entity-row">
                  <label for="pb-light-color-input">Color</label>
                  <div class="pb-light-color-picker-wrapper">
                    <input type="color" id="pb-light-color-input" value="#ffb366" class="pb-color-swatch-input" />
                    <span id="pb-light-color-hex" class="pb-hex-text">#FFB366</span>
                  </div>
                </div>

                <!-- Light Presets -->
                <div class="pb-light-presets-row">
                  <button type="button" class="pb-light-chip" data-color="#ffb366" title="Warm Incandescent" style="background: #ffb366;"></button>
                  <button type="button" class="pb-light-chip" data-color="#ffffff" title="Pure White" style="background: #ffffff;"></button>
                  <button type="button" class="pb-light-chip" data-color="#e0f0ff" title="Cool Daylight" style="background: #e0f0ff;"></button>
                  <button type="button" class="pb-light-chip" data-color="#ff7700" title="Voskel Amber" style="background: #ff7700;"></button>
                  <button type="button" class="pb-light-chip" data-color="#00e5ff" title="Sci-Fi Cyan" style="background: #00e5ff;"></button>
                  <button type="button" class="pb-light-chip" data-color="#ff2a2a" title="Red Alert" style="background: #ff2a2a;"></button>
                  <button type="button" class="pb-light-chip" data-color="#10b981" title="Terminal Emerald" style="background: #10b981;"></button>
                  <button type="button" class="pb-light-chip" data-color="#a855f7" title="Plasma Violet" style="background: #a855f7;"></button>
                </div>

                <!-- Intensity Slider -->
                <div class="pb-entity-row">
                  <div class="pb-field-header">
                    <label>Intensity</label>
                    <span id="pb-light-intensity-val" class="pb-field-val">3.5</span>
                  </div>
                  <input type="range" id="pb-light-intensity-slider" min="0.1" max="15" step="0.2" value="3.5" class="pb-tex-slider" />
                </div>

                <!-- Distance / Radius Slider -->
                <div class="pb-entity-row">
                  <div class="pb-field-header">
                    <label>Distance (Range)</label>
                    <span id="pb-light-distance-val" class="pb-field-val">12.0m</span>
                  </div>
                  <input type="range" id="pb-light-distance-slider" min="1" max="40" step="0.5" value="12" class="pb-tex-slider" />
                </div>

                <!-- Decay (Falloff) -->
                <div class="pb-entity-row">
                  <div class="pb-field-header">
                    <label>Decay (Falloff)</label>
                    <span id="pb-light-decay-val" class="pb-field-val">2.0</span>
                  </div>
                  <input type="range" id="pb-light-decay-slider" min="0" max="3" step="0.1" value="2.0" class="pb-tex-slider" />
                </div>

                <!-- Spot-only: Cone Beam Angle -->
                <div id="pb-spot-angle-row" class="pb-entity-row" style="display: none;">
                  <div class="pb-field-header">
                    <label>Cone Angle</label>
                    <span id="pb-spot-angle-val" class="pb-field-val">45°</span>
                  </div>
                  <input type="range" id="pb-spot-angle-slider" min="10" max="85" step="1" value="45" class="pb-tex-slider" />
                </div>

                <!-- Spot-only: Penumbra (Softness) -->
                <div id="pb-spot-penumbra-row" class="pb-entity-row" style="display: none;">
                  <div class="pb-field-header">
                    <label>Penumbra</label>
                    <span id="pb-spot-penumbra-val" class="pb-field-val">0.35</span>
                  </div>
                  <input type="range" id="pb-spot-penumbra-slider" min="0" max="1" step="0.05" value="0.35" class="pb-tex-slider" />
                </div>

                <!-- Cast Shadow Toggle -->
                <div class="pb-entity-row pb-entity-checkbox-row">
                  <label for="pb-light-shadow-toggle" class="pb-checkbox-label">
                    <input type="checkbox" id="pb-light-shadow-toggle" checked />
                    <span>Cast Dynamic Shadows</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- Topology Stats Section -->
            <div id="pb-topology-stats-section" class="pb-shelf-section">
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

        <!-- Make Hollow Modal Dialog (TrenchBroom / Hammer style) -->
        <div id="pb-hollow-modal" class="pb-modal-backdrop" style="display: none;">
          <div class="pb-modal-card">
            <div class="pb-modal-header">
              <div class="pb-modal-title-group">
                <div class="pb-modal-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <rect x="7" y="7" width="10" height="10" stroke-dasharray="2 2"></rect>
                  </svg>
                </div>
                <div>
                  <h3 class="pb-modal-title">Make Hollow Room</h3>
                  <p class="pb-modal-subtitle">TrenchBroom &amp; Valve Hammer Editor Brush Hollower</p>
                </div>
              </div>
              <button id="pb-modal-close" class="pb-modal-close-btn" title="Close (Esc)">✕</button>
            </div>

            <div class="pb-modal-body">
              <!-- Target object info -->
              <div class="pb-modal-info-box" id="pb-hollow-target-info">
                Target: <strong>Cube_1</strong> &bull; Size: 2.00m &times; 2.00m &times; 2.00m
              </div>

              <!-- Wall Thickness -->
              <div class="pb-modal-field">
                <div class="pb-field-header">
                  <label for="pb-hollow-thickness">Wall Thickness</label>
                  <span class="pb-field-hint" id="pb-hollow-thickness-display">0.25m</span>
                </div>
                <div class="pb-input-stepper">
                  <input type="number" id="pb-hollow-thickness" value="0.25" min="0.02" max="10" step="0.05" class="pb-text-input" />
                  <span class="pb-unit">m</span>
                </div>
                <div class="pb-preset-chips">
                  <button type="button" class="pb-chip" data-thickness="0.10">0.10m (Thin)</button>
                  <button type="button" class="pb-chip active" data-thickness="0.25">0.25m (Standard)</button>
                  <button type="button" class="pb-chip" data-thickness="0.50">0.50m (Thick)</button>
                  <button type="button" class="pb-chip" data-thickness="1.00">1.00m (Bunker)</button>
                </div>
              </div>

              <!-- Direction: Inside vs Outside -->
              <div class="pb-modal-field">
                <label>Hollow Direction</label>
                <div class="pb-toggle-options">
                  <div class="pb-toggle-card active" id="pb-opt-inside">
                    <input type="radio" name="hollow-dir" value="inside" checked />
                    <div class="pb-option-content">
                      <span class="pb-option-title">Inside Hollow (Default)</span>
                      <span class="pb-option-desc">Carves room inside current outer bounds.</span>
                    </div>
                  </div>
                  <div class="pb-toggle-card" id="pb-opt-outside">
                    <input type="radio" name="hollow-dir" value="outside" />
                    <div class="pb-option-content">
                      <span class="pb-option-title">Outside Hollow</span>
                      <span class="pb-option-desc">Wraps walls outside, preserving interior walkable space.</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Slabs or Combined Mesh -->
              <div class="pb-modal-field">
                <label>Output Mesh Structure</label>
                <div class="pb-toggle-options">
                  <div class="pb-toggle-card active" id="pb-opt-slabs">
                    <input type="radio" name="hollow-structure" value="slabs" checked />
                    <div class="pb-option-content">
                      <span class="pb-option-title">6 Separate Slabs (TrenchBroom / Hammer)</span>
                      <span class="pb-option-desc">Creates 6 watertight solids (Floor, Ceiling, 4 Walls) with centered pivots.</span>
                    </div>
                  </div>
                  <div class="pb-toggle-card" id="pb-opt-combined">
                    <input type="radio" name="hollow-structure" value="combined" />
                    <div class="pb-option-content">
                      <span class="pb-option-title">Single Room Mesh</span>
                      <span class="pb-option-desc">Merges all 6 slabs into one combined editable mesh.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="pb-modal-footer">
              <button id="pb-hollow-cancel" class="pb-btn pb-btn-secondary">Cancel</button>
              <button id="pb-hollow-confirm" class="pb-btn pb-btn-accent">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Make Hollow</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Floating Surface Inspector / Texture Alignment Dialog (Hammer Shift+A) -->
        <div id="pb-texture-panel" class="pb-texture-panel" style="display: none;">
          <div class="pb-tex-header">
            <div class="pb-tex-title-group">
              <div class="pb-tex-header-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="6" cy="6" r="3"></circle>
                  <path d="M14 4l6 6M4 14l6 6M13.5 6.5l4 4M7.5 12.5l4 4"></path>
                  <path d="M2 22l5-5"></path>
                </svg>
              </div>
              <div class="pb-tex-header-text">
                <span class="pb-tex-title">Surface Inspector</span>
                <span class="pb-tex-badge">Shift+A</span>
              </div>
            </div>
            <button id="pb-tex-close" class="pb-modal-close-btn" title="Close (Shift+A / Esc)">✕</button>
          </div>

          <div class="pb-tex-body">
            <!-- Mode Guidance Banner -->
            <div class="pb-tex-guide-banner">
              <span><strong>L-Click:</strong> Eyedropper</span>
              <span class="pb-guide-dot">&bull;</span>
              <span><strong>R-Click:</strong> Paint Face</span>
            </div>

            <!-- Target Face Info -->
            <div class="pb-tex-target-card" id="pb-tex-target-info">
              Target: <em>No face selected (L-Click to pick)</em>
            </div>

            <!-- Active Material Selection -->
            <div class="pb-tex-section">
              <div class="pb-tex-section-title">ACTIVE MATERIAL</div>
              <div class="pb-tex-palette-grid">
                <div class="pb-tex-chip active" data-mat="dev_orange">
                  <div class="pb-tex-swatch" style="background: #e66b1a;"></div>
                  <span>Orange</span>
                </div>
                <div class="pb-tex-chip" data-mat="dev_gray">
                  <div class="pb-tex-swatch" style="background: #717887;"></div>
                  <span>Neutral</span>
                </div>
                <div class="pb-tex-chip" data-mat="dev_dark">
                  <div class="pb-tex-swatch" style="background: #2b2e38;"></div>
                  <span>Dark</span>
                </div>
                <div class="pb-tex-chip" data-mat="dev_blue">
                  <div class="pb-tex-swatch" style="background: #1e88e5;"></div>
                  <span>Cyan</span>
                </div>
                <div class="pb-tex-chip" data-mat="dev_hazard">
                  <div class="pb-tex-swatch" style="background: #f1c40f;"></div>
                  <span>Hazard</span>
                </div>
                <div class="pb-tex-chip" data-mat="dev_concrete">
                  <div class="pb-tex-swatch" style="background: #b0b5be;"></div>
                  <span>Concrete</span>
                </div>
              </div>
            </div>

            <!-- Texture Shift (Pan) -->
            <div class="pb-tex-section">
              <div class="pb-tex-section-title">SHIFT (PAN)</div>
              <div class="pb-tex-row">
                <label>X:</label>
                <button type="button" class="pb-nudge-btn" id="pb-shift-x-minus">-0.25</button>
                <input type="number" id="pb-tex-shift-x" value="0.00" step="0.25" class="pb-tex-input" />
                <button type="button" class="pb-nudge-btn" id="pb-shift-x-plus">+0.25</button>
              </div>
              <div class="pb-tex-row">
                <label>Y:</label>
                <button type="button" class="pb-nudge-btn" id="pb-shift-y-minus">-0.25</button>
                <input type="number" id="pb-tex-shift-y" value="0.00" step="0.25" class="pb-tex-input" />
                <button type="button" class="pb-nudge-btn" id="pb-shift-y-plus">+0.25</button>
              </div>
            </div>

            <!-- Texture Scale (Tiling) -->
            <div class="pb-tex-section">
              <div class="pb-tex-section-title">SCALE (TILING)</div>
              <div class="pb-tex-row">
                <label>X:</label>
                <input type="number" id="pb-tex-scale-x" value="1.00" step="0.25" class="pb-tex-input" />
                <button type="button" class="pb-nudge-btn" id="pb-tex-flip-x" title="Invert / Flip X">Flip X</button>
              </div>
              <div class="pb-tex-row">
                <label>Y:</label>
                <input type="number" id="pb-tex-scale-y" value="1.00" step="0.25" class="pb-tex-input" />
                <button type="button" class="pb-nudge-btn" id="pb-tex-flip-y" title="Invert / Flip Y">Flip Y</button>
              </div>
              <div class="pb-preset-chips pb-tex-presets">
                <button type="button" class="pb-chip" data-scale="0.25">0.25x</button>
                <button type="button" class="pb-chip" data-scale="0.5">0.5x</button>
                <button type="button" class="pb-chip active" data-scale="1.0">1.0x</button>
                <button type="button" class="pb-chip" data-scale="2.0">2.0x</button>
                <button type="button" class="pb-chip" data-scale="4.0">4.0x</button>
              </div>
            </div>

            <!-- Texture Rotation -->
            <div class="pb-tex-section">
              <div class="pb-tex-section-title">ROTATION</div>
              <div class="pb-tex-row">
                <input type="range" id="pb-tex-rot-range" min="0" max="360" value="0" step="1" class="pb-tex-slider" />
                <input type="number" id="pb-tex-rot-input" min="0" max="360" value="0" class="pb-tex-input pb-tex-rot-input" />
                <span class="pb-unit">°</span>
              </div>
              <div class="pb-preset-chips pb-tex-presets">
                <button type="button" class="pb-chip active" data-rot="0">0°</button>
                <button type="button" class="pb-chip" data-rot="90">90°</button>
                <button type="button" class="pb-chip" data-rot="180">180°</button>
                <button type="button" class="pb-chip" data-rot="270">270°</button>
              </div>
            </div>

            <!-- Quick Alignment Actions -->
            <div class="pb-tex-actions-grid">
              <button id="pb-tex-btn-fit" class="pb-btn pb-btn-sm pb-btn-accent" title="Fit texture 1x1 across face (Hammer Fit)">
                Fit Face
              </button>
              <button id="pb-tex-btn-planar" class="pb-btn pb-btn-sm" title="Reset to standard world planar projection">
                Auto Planar
              </button>
              <button id="pb-tex-btn-reset" class="pb-btn pb-btn-sm" title="Reset Shift, Scale, and Rotation">
                Reset UVs
              </button>
            </div>

            <!-- Apply Buttons -->
            <div class="pb-tex-apply-row">
              <button id="pb-tex-btn-apply-sel" class="pb-btn pb-btn-sm pb-btn-accent" title="Apply active material &amp; UV alignment to selected faces">
                Apply to Selection
              </button>
              <button id="pb-tex-btn-apply-obj" class="pb-btn pb-btn-sm pb-btn-secondary" title="Apply to all faces of current mesh">
                Apply to Object
              </button>
            </div>
          </div>
        </div>

        <!-- Floating Brush Dimension HUD (TrenchBroom / Hammer style) -->
        <div id="pb-brush-hud" class="pb-brush-hud" style="display: none;">
          <div class="pb-hud-dims">
            <span class="pb-hud-item"><span class="pb-hud-dim-label">W</span> <span id="pb-hud-w">0.00</span>m</span>
            <span class="pb-hud-item"><span class="pb-hud-dim-label">H</span> <span id="pb-hud-h">2.00</span>m</span>
            <span class="pb-hud-item"><span class="pb-hud-dim-label">D</span> <span id="pb-hud-d">0.00</span>m</span>
          </div>
          <div class="pb-hud-sub" id="pb-hud-sub">Scroll ↕ Height &bull; Shift: Square</div>
        </div>

        <!-- Floating Clip Tool HUD (Hammer Knife Tool / Shift+X) -->
        <div id="pb-clip-hud" class="pb-clip-hud" style="display: none;">
          <div class="pb-clip-hud-header">
            <div class="pb-clip-hud-title-group">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2">
                <line x1="3" y1="3" x2="21" y2="21"></line>
                <polygon points="14 3 21 3 21 10 14 3"></polygon>
                <polygon points="3 14 3 21 10 21 3 14"></polygon>
              </svg>
              <span class="pb-clip-hud-title">Clip Tool (Knife)</span>
              <span class="pb-key">Shift+X</span>
            </div>
            <button id="pb-clip-close-btn" class="pb-modal-close-btn" title="Exit Clip Tool (Esc)">✕</button>
          </div>

          <div class="pb-clip-hud-body">
            <!-- Guidance status -->
            <div id="pb-clip-guidance" class="pb-clip-guidance">
              Click Point 1 on mesh or grid...
            </div>

            <!-- Mode Selector Chips (Shift+X to cycle) -->
            <div class="pb-clip-mode-row">
              <span class="pb-clip-row-label">Action:</span>
              <div class="pb-preset-chips pb-clip-mode-chips">
                <button type="button" class="pb-chip" data-clip-mode="keep_front" title="Keep Front Half (Side A)">Keep Front</button>
                <button type="button" class="pb-chip" data-clip-mode="keep_back" title="Keep Back Half (Side B)">Keep Back</button>
                <button type="button" class="pb-chip active" data-clip-mode="split_both" title="Split into 2 Watertight Meshes">Split Both</button>
              </div>
            </div>

            <!-- Actions Bar -->
            <div class="pb-clip-actions-row">
              <button id="pb-clip-btn-cut" class="pb-btn pb-btn-sm pb-btn-accent" title="Execute Slice (Enter)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Slice Mesh (Enter)</span>
              </button>
              <button id="pb-clip-btn-reset" class="pb-btn pb-btn-sm pb-btn-secondary" title="Clear Points and restart">
                Reset Points
              </button>
            </div>
          </div>
        </div>

        <!-- Floating CSG Booleans & Carve Tool HUD (Hammer Carve / Ctrl+Shift+C) -->
        <div id="pb-csg-hud" class="pb-csg-hud" style="display: none;">
          <div class="pb-csg-hud-header">
            <div class="pb-csg-hud-title-group">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2">
                <rect x="3" y="3" width="13" height="13" rx="1.5"></rect>
                <rect x="9" y="9" width="12" height="12" rx="1.5" stroke-dasharray="2 2"></rect>
              </svg>
              <span class="pb-csg-hud-title">CSG Carve & Booleans</span>
              <span class="pb-key">Ctrl+Shift+C</span>
            </div>
            <button id="pb-csg-close-btn" class="pb-modal-close-btn" title="Exit CSG Tool (Esc)">✕</button>
          </div>

          <div class="pb-csg-hud-body">
            <!-- Target & Cutter Assignment Row -->
            <div class="pb-csg-selection-box">
              <div class="pb-csg-mesh-slot target-slot">
                <div class="pb-csg-slot-label"><span class="pb-csg-dot target-dot"></span> Target (Base Wall):</div>
                <div class="pb-csg-slot-content">
                  <span id="pb-csg-target-name" class="pb-csg-mesh-name">None selected</span>
                  <button id="pb-csg-pick-target" class="pb-btn pb-btn-xs pb-btn-secondary" title="Click to pick target from 3D viewport">Pick</button>
                </div>
              </div>

              <button id="pb-csg-swap-btn" class="pb-csg-swap-btn" title="Swap Target and Cutter (⇄)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"></path>
                </svg>
              </button>

              <div class="pb-csg-mesh-slot cutter-slot">
                <div class="pb-csg-slot-label"><span class="pb-csg-dot cutter-dot"></span> Cutter (Hole / Brush):</div>
                <div class="pb-csg-slot-content">
                  <span id="pb-csg-cutter-name" class="pb-csg-mesh-name">None selected</span>
                  <button id="pb-csg-pick-cutter" class="pb-btn pb-btn-xs pb-btn-secondary" title="Click to pick cutter from 3D viewport">Pick</button>
                </div>
              </div>
            </div>

            <!-- Intersecting meshes info -->
            <div id="pb-csg-guidance" class="pb-csg-guidance">
              Select or drag a cutter brush through a wall...
            </div>

            <!-- Operation Selector Chips -->
            <div class="pb-csg-mode-row">
              <span class="pb-csg-row-label">Operation:</span>
              <div class="pb-preset-chips pb-csg-mode-chips">
                <button type="button" class="pb-chip active" data-csg-mode="subtract" title="Carve / Subtract (Doorway, Window opening)">Carve (Subtract)</button>
                <button type="button" class="pb-chip" data-csg-mode="union" title="Fuse / Union (Merge into single solid)">Union (Add)</button>
                <button type="button" class="pb-chip" data-csg-mode="intersect" title="Intersect (Keep common overlapping volume)">Intersect</button>
              </div>
            </div>

            <!-- Checkbox Option: Delete Cutter Brush after Carve -->
            <div class="pb-csg-option-row">
              <label class="pb-csg-checkbox-label">
                <input type="checkbox" id="pb-csg-delete-cutter" checked>
                <span>Delete Cutter Brush after Carve</span>
              </label>
            </div>

            <!-- Actions Bar -->
            <div class="pb-csg-actions-row">
              <button id="pb-csg-btn-apply" class="pb-btn pb-btn-sm pb-btn-accent" title="Apply CSG Operation (Enter)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Punch Carve (Enter)</span>
              </button>
              <button id="pb-csg-btn-auto-carve" class="pb-btn pb-btn-sm pb-btn-secondary" title="Automatically carve all intersecting meshes">
                Carve All Intersecting
              </button>
            </div>
          </div>
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
    this.container.querySelector('#pb-tool-texture-inspector')!.addEventListener('click', () => this.editor?.textureTool.toggle());

    // Setup Surface Inspector Events
    this.setupTexturePanelEvents();

    // Element Tools
    this.container.querySelector('#pb-tool-merge')!.addEventListener('click', () => this.editor?.mergeSelectedVertices());
    this.container.querySelector('#pb-tool-select-all')!.addEventListener('click', () => this.editor?.selectionManager.selectAll());
    this.container.querySelector('#pb-tool-invert-select')!.addEventListener('click', () => this.editor?.selectionManager.invertSelection());

    // Object Tools
    this.container.querySelector('#pb-tool-hollow')!.addEventListener('click', () => this.openHollowModal());
    this.container.querySelector('#pb-tool-duplicate')!.addEventListener('click', () => this.editor?.duplicateSelected());
    this.container.querySelector('#pb-tool-center-pivot')!.addEventListener('click', () => this.editor?.centerPivotSelected());
    this.container.querySelector('#pb-tool-delete')!.addEventListener('click', () => this.editor?.deleteSelected());

    // Brush Tool Hero Button & Height Input
    this.container.querySelector('#pb-tool-drag-brush')!.addEventListener('click', () => {
      if (!this.editor) return;
      if (this.editor.selectionManager.mode === 'brush') {
        this.editor.setSelectionMode('object');
      } else {
        this.editor.setSelectionMode('brush');
      }
    });

    const brushHeightInput = this.container.querySelector('#pb-brush-default-height') as HTMLInputElement;
    brushHeightInput.addEventListener('change', () => {
      if (!this.editor) return;
      const val = parseFloat(brushHeightInput.value);
      if (!isNaN(val) && val > 0) {
        this.editor.brushTool.setBrushHeight(val);
      }
    });

    // Hollow Modal Event Bindings
    this.setupHollowModalEvents();

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

    // Entity Creation Buttons (Hammer / TrenchBroom style)
    this.container.querySelector('#pb-btn-add-spawn')?.addEventListener('click', () => {
      this.editor?.createEntity('player_spawn');
    });
    this.container.querySelector('#pb-btn-add-point-light')?.addEventListener('click', () => {
      this.editor?.createEntity('light_point');
    });
    this.container.querySelector('#pb-btn-add-spot-light')?.addEventListener('click', () => {
      this.editor?.createEntity('light_spot');
    });

    // Transform Inspector Inputs (Supports both Meshes and Entities)
    const setupTransformInput = (id: string, axis: 'x' | 'y' | 'z', type: 'pos' | 'rot' | 'scale') => {
      const input = this.container.querySelector(id) as HTMLInputElement;
      input.addEventListener('change', () => {
        if (!this.editor) return;
        const mesh = this.editor.selectionManager.selectedMesh;
        const entity = this.editor.selectionManager.selectedEntity;
        if (!mesh && !entity) return;
        const val = parseFloat(input.value);
        if (isNaN(val)) return;

        const targetGroup = entity ? entity.group : mesh!.group;

        if (type === 'pos') {
          targetGroup.position[axis] = val;
        } else if (type === 'rot') {
          targetGroup.rotation[axis] = (val * Math.PI) / 180;
        } else if (type === 'scale') {
          if (!entity) {
            targetGroup.scale[axis] = Math.max(0.001, val);
          }
        }
        targetGroup.updateMatrixWorld(true);
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

    // Entity Inspector Controls
    const entityNameInput = this.container.querySelector('#pb-entity-name-input') as HTMLInputElement;
    entityNameInput?.addEventListener('change', () => {
      const ent = this.editor?.selectionManager.selectedEntity;
      if (ent && entityNameInput.value.trim()) {
        ent.name = entityNameInput.value.trim();
        ent.group.name = ent.name;
        this.editor?.recordHistory(`Rename ${ent.name}`);
        this.updateHierarchy();
      }
    });

    // Player Spawn Yaw Slider & Num Input
    const spawnYawSlider = this.container.querySelector('#pb-spawn-yaw-slider') as HTMLInputElement;
    const spawnYawNum = this.container.querySelector('#pb-spawn-yaw-num') as HTMLInputElement;
    const spawnYawDisplay = this.container.querySelector('#pb-spawn-yaw-display') as HTMLElement;
    const updateSpawnYaw = (val: number, record = true) => {
      const ent = this.editor?.selectionManager.selectedEntity;
      if (ent && ent.type === 'player_spawn') {
        ent.updateProperties({ yaw: val });
        if (spawnYawSlider) spawnYawSlider.value = val.toString();
        if (spawnYawNum) spawnYawNum.value = val.toString();
        if (spawnYawDisplay) spawnYawDisplay.textContent = `${val}°`;
        this.container.querySelectorAll('.pb-compass-chips .pb-chip').forEach((chip) => {
          const chipYaw = parseInt(chip.getAttribute('data-yaw') || '-1', 10);
          chip.classList.toggle('active', chipYaw === val);
        });
        if (record) {
          this.editor?.recordHistory('Spawn Yaw');
        }
      }
    };
    spawnYawSlider?.addEventListener('input', () => {
      updateSpawnYaw(parseInt(spawnYawSlider.value, 10), false);
    });
    spawnYawSlider?.addEventListener('change', () => {
      updateSpawnYaw(parseInt(spawnYawSlider.value, 10), true);
    });
    spawnYawNum?.addEventListener('change', () => {
      const val = Math.max(0, Math.min(360, parseInt(spawnYawNum.value, 10) || 0));
      updateSpawnYaw(val, true);
    });
    this.container.querySelectorAll('.pb-compass-chips .pb-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const yaw = parseInt(chip.getAttribute('data-yaw') || '0', 10);
        updateSpawnYaw(yaw, true);
      });
    });

    // "Test Play from Here" button
    this.container.querySelector('#pb-btn-test-from-spawn')?.addEventListener('click', () => {
      const ent = this.editor?.selectionManager.selectedEntity;
      if (ent && ent.type === 'player_spawn') {
        this.editor?.enterPlaytest(ent);
      }
    });

    // Light Color Picker & Presets
    const lightColorInput = this.container.querySelector('#pb-light-color-input') as HTMLInputElement;
    const lightColorHex = this.container.querySelector('#pb-light-color-hex') as HTMLElement;
    const updateLightColor = (hex: string, record = true) => {
      const ent = this.editor?.selectionManager.selectedEntity;
      if (ent && (ent.type === 'light_point' || ent.type === 'light_spot')) {
        ent.updateProperties({ color: hex });
        if (lightColorInput) lightColorInput.value = hex;
        if (lightColorHex) lightColorHex.textContent = hex.toUpperCase();
        if (record) {
          this.editor?.recordHistory('Light Color');
        }
      }
    };
    lightColorInput?.addEventListener('input', () => {
      updateLightColor(lightColorInput.value, false);
    });
    lightColorInput?.addEventListener('change', () => {
      updateLightColor(lightColorInput.value, true);
    });
    this.container.querySelectorAll('.pb-light-presets-row .pb-light-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const hex = chip.getAttribute('data-color') || '#ffffff';
        updateLightColor(hex, true);
      });
    });

    // Light Intensity Slider
    const lightIntensitySlider = this.container.querySelector('#pb-light-intensity-slider') as HTMLInputElement;
    const lightIntensityVal = this.container.querySelector('#pb-light-intensity-val') as HTMLElement;
    const updateLightIntensity = (val: number, record = true) => {
      const ent = this.editor?.selectionManager.selectedEntity;
      if (ent && (ent.type === 'light_point' || ent.type === 'light_spot')) {
        ent.updateProperties({ intensity: val });
        if (lightIntensityVal) lightIntensityVal.textContent = val.toFixed(1);
        if (record) {
          this.editor?.recordHistory('Light Intensity');
        }
      }
    };
    lightIntensitySlider?.addEventListener('input', () => {
      updateLightIntensity(parseFloat(lightIntensitySlider.value), false);
    });
    lightIntensitySlider?.addEventListener('change', () => {
      updateLightIntensity(parseFloat(lightIntensitySlider.value), true);
    });

    // Light Distance Slider
    const lightDistanceSlider = this.container.querySelector('#pb-light-distance-slider') as HTMLInputElement;
    const lightDistanceVal = this.container.querySelector('#pb-light-distance-val') as HTMLElement;
    const updateLightDistance = (val: number, record = true) => {
      const ent = this.editor?.selectionManager.selectedEntity;
      if (ent && (ent.type === 'light_point' || ent.type === 'light_spot')) {
        ent.updateProperties({ distance: val });
        if (lightDistanceVal) lightDistanceVal.textContent = `${val.toFixed(1)}m`;
        if (record) {
          this.editor?.recordHistory('Light Distance');
        }
      }
    };
    lightDistanceSlider?.addEventListener('input', () => {
      updateLightDistance(parseFloat(lightDistanceSlider.value), false);
    });
    lightDistanceSlider?.addEventListener('change', () => {
      updateLightDistance(parseFloat(lightDistanceSlider.value), true);
    });

    // Light Decay Slider
    const lightDecaySlider = this.container.querySelector('#pb-light-decay-slider') as HTMLInputElement;
    const lightDecayVal = this.container.querySelector('#pb-light-decay-val') as HTMLElement;
    const updateLightDecay = (val: number, record = true) => {
      const ent = this.editor?.selectionManager.selectedEntity;
      if (ent && (ent.type === 'light_point' || ent.type === 'light_spot')) {
        ent.updateProperties({ decay: val });
        if (lightDecayVal) lightDecayVal.textContent = val.toFixed(1);
        if (record) {
          this.editor?.recordHistory('Light Decay');
        }
      }
    };
    lightDecaySlider?.addEventListener('input', () => {
      updateLightDecay(parseFloat(lightDecaySlider.value), false);
    });
    lightDecaySlider?.addEventListener('change', () => {
      updateLightDecay(parseFloat(lightDecaySlider.value), true);
    });

    // Spot Angle Slider
    const spotAngleSlider = this.container.querySelector('#pb-spot-angle-slider') as HTMLInputElement;
    const spotAngleVal = this.container.querySelector('#pb-spot-angle-val') as HTMLElement;
    const updateSpotAngle = (val: number, record = true) => {
      const ent = this.editor?.selectionManager.selectedEntity;
      if (ent && ent.type === 'light_spot') {
        ent.updateProperties({ angle: val });
        if (spotAngleVal) spotAngleVal.textContent = `${val}°`;
        if (record) {
          this.editor?.recordHistory('Spot Angle');
        }
      }
    };
    spotAngleSlider?.addEventListener('input', () => {
      updateSpotAngle(parseInt(spotAngleSlider.value, 10), false);
    });
    spotAngleSlider?.addEventListener('change', () => {
      updateSpotAngle(parseInt(spotAngleSlider.value, 10), true);
    });

    // Spot Penumbra Slider
    const spotPenumbraSlider = this.container.querySelector('#pb-spot-penumbra-slider') as HTMLInputElement;
    const spotPenumbraVal = this.container.querySelector('#pb-spot-penumbra-val') as HTMLElement;
    const updateSpotPenumbra = (val: number, record = true) => {
      const ent = this.editor?.selectionManager.selectedEntity;
      if (ent && ent.type === 'light_spot') {
        ent.updateProperties({ penumbra: val });
        if (spotPenumbraVal) spotPenumbraVal.textContent = val.toFixed(2);
        if (record) {
          this.editor?.recordHistory('Spot Penumbra');
        }
      }
    };
    spotPenumbraSlider?.addEventListener('input', () => {
      updateSpotPenumbra(parseFloat(spotPenumbraSlider.value), false);
    });
    spotPenumbraSlider?.addEventListener('change', () => {
      updateSpotPenumbra(parseFloat(spotPenumbraSlider.value), true);
    });

    // Light Cast Shadow Toggle
    const lightShadowToggle = this.container.querySelector('#pb-light-shadow-toggle') as HTMLInputElement;
    lightShadowToggle?.addEventListener('change', () => {
      const ent = this.editor?.selectionManager.selectedEntity;
      if (ent && (ent.type === 'light_point' || ent.type === 'light_spot')) {
        ent.updateProperties({ castShadow: lightShadowToggle.checked });
        this.editor?.recordHistory('Light Cast Shadow');
      }
    });
  }

  private setupEditorHooks(): void {
    if (!this.editor) return;
    this.editor.onStateChanged = () => this.updateUI();

    this.editor.onToastMessage = (msg, type = 'info') => {
      this.showToast(msg, type);
    };

    this.editor.onOpenHollowModal = () => {
      this.openHollowModal();
    };

    this.setupTexturePanelEvents();

    // Brush Tool Dimension HUD Callback
    const hud = this.container.querySelector('#pb-brush-hud') as HTMLElement;
    const hudW = this.container.querySelector('#pb-hud-w')!;
    const hudH = this.container.querySelector('#pb-hud-h')!;
    const hudD = this.container.querySelector('#pb-hud-d')!;
    const hudSub = this.container.querySelector('#pb-hud-sub')!;

    this.editor.brushTool.onDimensionsChanged = (dims, screenPos) => {
      if (!this.editor) return;
      if (!this.editor.brushTool.isActive) {
        hud.style.display = 'none';
        return;
      }

      if (screenPos) {
        hud.style.left = `${screenPos.x + 18}px`;
        hud.style.top = `${screenPos.y + 18}px`;
      }

      if (dims) {
        hud.style.display = 'flex';
        hudW.textContent = dims.width.toFixed(2);
        hudH.textContent = dims.height.toFixed(2);
        hudD.textContent = dims.depth.toFixed(2);
        hudSub.textContent = dims.isSquare
          ? 'Locked Square (Shift) • Scroll ↕ Height'
          : 'Scroll ↕ Height • Shift: Square';
      } else {
        hud.style.display = 'none';
      }
    };

    // Surface Inspector Hooks
    const texPanel = this.container.querySelector('#pb-texture-panel') as HTMLElement;
    const texTargetInfo = this.container.querySelector('#pb-tex-target-info')!;
    const texShiftX = this.container.querySelector('#pb-tex-shift-x') as HTMLInputElement;
    const texShiftY = this.container.querySelector('#pb-tex-shift-y') as HTMLInputElement;
    const texScaleX = this.container.querySelector('#pb-tex-scale-x') as HTMLInputElement;
    const texScaleY = this.container.querySelector('#pb-tex-scale-y') as HTMLInputElement;
    const texRotRange = this.container.querySelector('#pb-tex-rot-range') as HTMLInputElement;
    const texRotInput = this.container.querySelector('#pb-tex-rot-input') as HTMLInputElement;
    const texChips = this.container.querySelectorAll('.pb-tex-chip');
    const texScaleChips = this.container.querySelectorAll('.pb-tex-presets [data-scale]');
    const texRotChips = this.container.querySelectorAll('.pb-tex-presets [data-rot]');

    this.editor.textureTool.onPanelVisibilityChanged = (visible) => {
      texPanel.style.display = visible ? 'flex' : 'none';
      texPanel.classList.toggle('open', visible);
      const inspectorBtn = this.container.querySelector('#pb-tool-texture-inspector');
      if (inspectorBtn) inspectorBtn.classList.toggle('active', visible);
    };

    this.editor.textureTool.onStateChanged = (state) => {
      if (state.meshName && state.faceId !== null) {
        texTargetInfo.innerHTML = `Target: <strong>${state.meshName}</strong> &bull; Face: <code>#${state.faceId}</code>`;
      } else if (state.meshName) {
        texTargetInfo.innerHTML = `Target: <strong>${state.meshName}</strong> &bull; <em>Select a face</em>`;
      } else {
        texTargetInfo.innerHTML = `Target: <em>No face selected (L-Click to pick)</em>`;
      }

      // Material chips
      texChips.forEach((chip) => {
        chip.classList.toggle('active', chip.getAttribute('data-mat') === state.materialId);
      });

      // Shift inputs
      if (document.activeElement !== texShiftX) texShiftX.value = state.shiftX.toFixed(2);
      if (document.activeElement !== texShiftY) texShiftY.value = state.shiftY.toFixed(2);

      // Scale inputs
      if (document.activeElement !== texScaleX) texScaleX.value = state.scaleX.toFixed(2);
      if (document.activeElement !== texScaleY) texScaleY.value = state.scaleY.toFixed(2);

      texScaleChips.forEach((chip) => {
        const val = parseFloat(chip.getAttribute('data-scale') || '-999');
        chip.classList.toggle(
          'active',
          Math.abs(val - state.scaleX) < 0.01 && Math.abs(val - state.scaleY) < 0.01
        );
      });

      // Rotation inputs
      if (document.activeElement !== texRotRange) texRotRange.value = state.rotation.toString();
      if (document.activeElement !== texRotInput) texRotInput.value = state.rotation.toString();

      texRotChips.forEach((chip) => {
        const val = parseInt(chip.getAttribute('data-rot') || '-999', 10);
        chip.classList.toggle('active', val === state.rotation);
      });
    };

    // Setup Clip Tool Events & HUD
    this.setupClipToolEvents();

    // Setup CSG Tool Events & HUD
    this.setupCSGToolEvents();
  }

  private setupClipToolEvents(): void {
    if (!this.editor) return;

    // Toggle button in left toolbar
    this.container.querySelector('#pb-tool-clip')?.addEventListener('click', () => {
      this.editor?.toggleClipTool();
    });

    // Close button
    this.container.querySelector('#pb-clip-close-btn')?.addEventListener('click', () => {
      this.editor?.clipTool.deactivate();
      this.updateUI();
    });

    // Slice execute button
    this.container.querySelector('#pb-clip-btn-cut')?.addEventListener('click', () => {
      this.editor?.clipTool.executeCut();
      this.updateUI();
    });

    // Reset points button
    this.container.querySelector('#pb-clip-btn-reset')?.addEventListener('click', () => {
      this.editor?.clipTool.resetPoints();
      this.updateUI();
    });

    // Mode selector chips
    const modeChips = this.container.querySelectorAll('.pb-clip-mode-chips .pb-chip');
    modeChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const mode = chip.getAttribute('data-clip-mode') as ClipMode;
        if (mode && this.editor) {
          this.editor.clipTool.setMode(mode);
          modeChips.forEach((c) => c.classList.toggle('active', c === chip));
        }
      });
    });

    // ClipTool State Callback
    this.editor.clipTool.onStateChanged = (state) => {
      const hud = this.container.querySelector('#pb-clip-hud') as HTMLElement;
      if (!hud) return;

      hud.style.display = state.isActive ? 'flex' : 'none';

      const guidance = this.container.querySelector('#pb-clip-guidance')!;
      if (state.pointCount === 0) {
        guidance.textContent = state.targetMeshName
          ? `Click Point 1 on ${state.targetMeshName} or grid...`
          : 'Click Point 1 on mesh or grid...';
      } else if (state.pointCount === 1) {
        guidance.textContent = 'Click Point 2 to cast vertical cutting plane...';
      } else if (state.pointCount === 2) {
        guidance.textContent = 'Vertical plane ready! Press Enter to Cut (or click Point 3 for angled plane)';
      } else if (state.pointCount >= 3) {
        guidance.textContent = '3-Point angled plane ready! Press Enter to Cut';
      }

      modeChips.forEach((chip) => {
        chip.classList.toggle('active', chip.getAttribute('data-clip-mode') === state.mode);
      });

      const cutBtn = this.container.querySelector('#pb-clip-btn-cut') as HTMLButtonElement;
      if (cutBtn) {
        cutBtn.disabled = !state.hasPlane;
      }

      const clipBtn = this.container.querySelector('#pb-tool-clip');
      if (clipBtn) {
        clipBtn.classList.toggle('active', state.isActive);
      }
    };
  }

  private setupCSGToolEvents(): void {
    if (!this.editor) return;

    // Toggle button in left toolbar
    this.container.querySelector('#pb-tool-csg')?.addEventListener('click', () => {
      this.editor?.toggleCSGTool();
    });

    // Close button
    this.container.querySelector('#pb-csg-close-btn')?.addEventListener('click', () => {
      this.editor?.csgTool.deactivate();
      this.updateUI();
    });

    // Pick Target button
    this.container.querySelector('#pb-csg-pick-target')?.addEventListener('click', () => {
      if (this.editor?.csgTool.pickingMode === 'target') {
        this.editor.csgTool.setPickingMode('none');
      } else {
        this.editor?.csgTool.setPickingMode('target');
      }
    });

    // Pick Cutter button
    this.container.querySelector('#pb-csg-pick-cutter')?.addEventListener('click', () => {
      if (this.editor?.csgTool.pickingMode === 'cutter') {
        this.editor.csgTool.setPickingMode('none');
      } else {
        this.editor?.csgTool.setPickingMode('cutter');
      }
    });

    // Swap button
    this.container.querySelector('#pb-csg-swap-btn')?.addEventListener('click', () => {
      this.editor?.csgTool.swapTargetAndCutter();
    });

    // Mode chips
    const modeChips = this.container.querySelectorAll('.pb-csg-mode-chips .pb-chip');
    modeChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const mode = chip.getAttribute('data-csg-mode') as CSGMode;
        if (mode && this.editor) {
          this.editor.csgTool.setMode(mode);
          modeChips.forEach((c) => c.classList.toggle('active', c === chip));
        }
      });
    });

    // Delete cutter checkbox
    const deleteCutterCb = this.container.querySelector('#pb-csg-delete-cutter') as HTMLInputElement;
    deleteCutterCb?.addEventListener('change', () => {
      this.editor?.csgTool.setDeleteCutter(deleteCutterCb.checked);
    });

    // Apply button
    this.container.querySelector('#pb-csg-btn-apply')?.addEventListener('click', () => {
      this.editor?.csgTool.execute();
      this.updateUI();
    });

    // Auto carve all intersecting button
    this.container.querySelector('#pb-csg-btn-auto-carve')?.addEventListener('click', () => {
      this.editor?.csgTool.carveAllIntersecting();
      this.updateUI();
    });

    // State Callback
    this.editor.csgTool.onStateChanged = (state) => {
      const hud = this.container.querySelector('#pb-csg-hud') as HTMLElement;
      if (!hud) return;

      hud.style.display = state.isActive ? 'flex' : 'none';

      const targetLabel = this.container.querySelector('#pb-csg-target-name')!;
      targetLabel.textContent = state.targetMeshName || 'None (Click Pick)';

      const cutterLabel = this.container.querySelector('#pb-csg-cutter-name')!;
      cutterLabel.textContent = state.cutterMeshName || 'None (Click Pick)';

      const guidance = this.container.querySelector('#pb-csg-guidance')!;
      if (state.pickingMode === 'target') {
        guidance.textContent = 'Click any mesh in the 3D viewport to set as Target';
      } else if (state.pickingMode === 'cutter') {
        guidance.textContent = 'Click any mesh in the 3D viewport to set as Cutter';
      } else if (state.targetMeshName && state.cutterMeshName) {
        if (state.mode === 'subtract') {
          guidance.textContent = `Punches doorway/opening in [${state.targetMeshName}] using [${state.cutterMeshName}]`;
        } else if (state.mode === 'union') {
          guidance.textContent = `Fuses [${state.targetMeshName}] and [${state.cutterMeshName}] into a single solid`;
        } else {
          guidance.textContent = `Keeps common volume between [${state.targetMeshName}] and [${state.cutterMeshName}]`;
        }
      } else if (state.cutterMeshName) {
        guidance.textContent = `Drag [${state.cutterMeshName}] through a wall, then press Enter to Carve`;
      } else {
        guidance.textContent = 'Drag a cutter brush into a wall and press Enter (or pick Target & Cutter)';
      }

      modeChips.forEach((chip) => {
        chip.classList.toggle('active', chip.getAttribute('data-csg-mode') === state.mode);
      });

      const pickTargetBtn = this.container.querySelector('#pb-csg-pick-target') as HTMLElement;
      if (pickTargetBtn) {
        pickTargetBtn.classList.toggle('active', state.pickingMode === 'target');
        pickTargetBtn.textContent = state.pickingMode === 'target' ? 'Cancel' : 'Pick';
      }

      const pickCutterBtn = this.container.querySelector('#pb-csg-pick-cutter') as HTMLElement;
      if (pickCutterBtn) {
        pickCutterBtn.classList.toggle('active', state.pickingMode === 'cutter');
        pickCutterBtn.textContent = state.pickingMode === 'cutter' ? 'Cancel' : 'Pick';
      }

      const csgBtn = this.container.querySelector('#pb-tool-csg');
      if (csgBtn) {
        csgBtn.classList.toggle('active', state.isActive);
      }
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

    // Transform Inspector & Entity Inspector
    const meshNameLabel = this.container.querySelector('#pb-selected-mesh-name')!;
    const entity = this.editor.selectionManager.selectedEntity;
    const entityInspector = this.container.querySelector('#pb-entity-inspector') as HTMLElement;
    const topoStatsSection = this.container.querySelector('#pb-topology-stats-section') as HTMLElement;

    if (entity) {
      if (entityInspector) entityInspector.style.display = 'block';
      if (topoStatsSection) topoStatsSection.style.display = 'none';

      meshNameLabel.textContent = entity.name;
      const entityNameInput = this.container.querySelector('#pb-entity-name-input') as HTMLInputElement;
      if (entityNameInput && document.activeElement !== entityNameInput) {
        entityNameInput.value = entity.name;
      }

      const typeBadge = this.container.querySelector('#pb-entity-type-badge')!;
      typeBadge.textContent = entity.type.replace('_', ' ').toUpperCase();

      (this.container.querySelector('#pb-pos-x') as HTMLInputElement).value = entity.group.position.x.toFixed(2);
      (this.container.querySelector('#pb-pos-y') as HTMLInputElement).value = entity.group.position.y.toFixed(2);
      (this.container.querySelector('#pb-pos-z') as HTMLInputElement).value = entity.group.position.z.toFixed(2);

      (this.container.querySelector('#pb-rot-x') as HTMLInputElement).value = ((entity.group.rotation.x * 180) / Math.PI).toFixed(0);
      (this.container.querySelector('#pb-rot-y') as HTMLInputElement).value = ((entity.group.rotation.y * 180) / Math.PI).toFixed(0);
      (this.container.querySelector('#pb-rot-z') as HTMLInputElement).value = ((entity.group.rotation.z * 180) / Math.PI).toFixed(0);

      (this.container.querySelector('#pb-scale-x') as HTMLInputElement).value = '1.00';
      (this.container.querySelector('#pb-scale-y') as HTMLInputElement).value = '1.00';
      (this.container.querySelector('#pb-scale-z') as HTMLInputElement).value = '1.00';

      const propsSpawn = this.container.querySelector('#pb-entity-props-spawn') as HTMLElement;
      const propsLight = this.container.querySelector('#pb-entity-props-light') as HTMLElement;

      if (entity.type === 'player_spawn') {
        if (propsSpawn) propsSpawn.style.display = 'block';
        if (propsLight) propsLight.style.display = 'none';

        const yaw = entity.properties.yaw ?? 0;
        const spawnYawSlider = this.container.querySelector('#pb-spawn-yaw-slider') as HTMLInputElement;
        const spawnYawNum = this.container.querySelector('#pb-spawn-yaw-num') as HTMLInputElement;
        const spawnYawDisplay = this.container.querySelector('#pb-spawn-yaw-display') as HTMLElement;

        if (spawnYawSlider && document.activeElement !== spawnYawSlider) spawnYawSlider.value = yaw.toString();
        if (spawnYawNum && document.activeElement !== spawnYawNum) spawnYawNum.value = yaw.toString();
        if (spawnYawDisplay) spawnYawDisplay.textContent = `${yaw}°`;

        this.container.querySelectorAll('.pb-compass-chips .pb-chip').forEach((chip) => {
          const chipYaw = parseInt(chip.getAttribute('data-yaw') || '-1', 10);
          chip.classList.toggle('active', chipYaw === yaw);
        });
      } else {
        if (propsSpawn) propsSpawn.style.display = 'none';
        if (propsLight) propsLight.style.display = 'block';

        const color = entity.properties.color || '#ffffff';
        const intensity = entity.properties.intensity ?? 3.5;
        const distance = entity.properties.distance ?? 12.0;
        const decay = entity.properties.decay ?? 2.0;
        const castShadow = entity.properties.castShadow !== false;

        const lightColorInput = this.container.querySelector('#pb-light-color-input') as HTMLInputElement;
        const lightColorHex = this.container.querySelector('#pb-light-color-hex') as HTMLElement;
        if (lightColorInput && document.activeElement !== lightColorInput) lightColorInput.value = color;
        if (lightColorHex) lightColorHex.textContent = color.toUpperCase();

        const lightIntensitySlider = this.container.querySelector('#pb-light-intensity-slider') as HTMLInputElement;
        const lightIntensityVal = this.container.querySelector('#pb-light-intensity-val') as HTMLElement;
        if (lightIntensitySlider && document.activeElement !== lightIntensitySlider) lightIntensitySlider.value = intensity.toString();
        if (lightIntensityVal) lightIntensityVal.textContent = intensity.toFixed(1);

        const lightDistanceSlider = this.container.querySelector('#pb-light-distance-slider') as HTMLInputElement;
        const lightDistanceVal = this.container.querySelector('#pb-light-distance-val') as HTMLElement;
        if (lightDistanceSlider && document.activeElement !== lightDistanceSlider) lightDistanceSlider.value = distance.toString();
        if (lightDistanceVal) lightDistanceVal.textContent = `${distance.toFixed(1)}m`;

        const lightDecaySlider = this.container.querySelector('#pb-light-decay-slider') as HTMLInputElement;
        const lightDecayVal = this.container.querySelector('#pb-light-decay-val') as HTMLElement;
        if (lightDecaySlider && document.activeElement !== lightDecaySlider) lightDecaySlider.value = decay.toString();
        if (lightDecayVal) lightDecayVal.textContent = decay.toFixed(1);

        const lightShadowToggle = this.container.querySelector('#pb-light-shadow-toggle') as HTMLInputElement;
        if (lightShadowToggle) lightShadowToggle.checked = castShadow;

        const isSpot = entity.type === 'light_spot';
        const spotAngleRow = this.container.querySelector('#pb-spot-angle-row') as HTMLElement;
        const spotPenumbraRow = this.container.querySelector('#pb-spot-penumbra-row') as HTMLElement;

        if (spotAngleRow) spotAngleRow.style.display = isSpot ? 'block' : 'none';
        if (spotPenumbraRow) spotPenumbraRow.style.display = isSpot ? 'block' : 'none';

        if (isSpot) {
          const angle = entity.properties.angle ?? 45;
          const penumbra = entity.properties.penumbra ?? 0.35;

          const spotAngleSlider = this.container.querySelector('#pb-spot-angle-slider') as HTMLInputElement;
          const spotAngleVal = this.container.querySelector('#pb-spot-angle-val') as HTMLElement;
          if (spotAngleSlider && document.activeElement !== spotAngleSlider) spotAngleSlider.value = angle.toString();
          if (spotAngleVal) spotAngleVal.textContent = `${angle}°`;

          const spotPenumbraSlider = this.container.querySelector('#pb-spot-penumbra-slider') as HTMLInputElement;
          const spotPenumbraVal = this.container.querySelector('#pb-spot-penumbra-val') as HTMLElement;
          if (spotPenumbraSlider && document.activeElement !== spotPenumbraSlider) spotPenumbraSlider.value = penumbra.toString();
          if (spotPenumbraVal) spotPenumbraVal.textContent = penumbra.toFixed(2);
        }
      }
    } else if (mesh) {
      if (entityInspector) entityInspector.style.display = 'none';
      if (topoStatsSection) topoStatsSection.style.display = 'block';

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
      if (entityInspector) entityInspector.style.display = 'none';
      if (topoStatsSection) topoStatsSection.style.display = 'block';
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
    const isClip = !!this.editor.clipTool?.isActive;
    const isCSG = !!this.editor.csgTool?.isActive;
    if (isPlaytest) {
      statusInfo.textContent = 'Playtesting level (FPS controller active — ESC to exit)';
    } else if (isCSG) {
      statusInfo.textContent = 'CSG Carve Tool (Ctrl+Shift+C): Punch doorway/window through wall • Enter: Carve • Esc: Exit';
    } else if (isClip) {
      statusInfo.textContent = 'Clip Tool (Shift+X): Click 2 points for vertical plane or 3 for angled plane • Shift+X: Cycle mode • Enter: Slice • Esc: Exit';
    } else if (mode === 'brush') {
      statusInfo.textContent = 'Brush Tool: Click & drag on floor grid (Shift: Square, Scroll: Height, Esc: Exit)';
    } else if (entity) {
      statusInfo.textContent = `${entity.name} (${entity.type}) — Move with W/E/R or edit properties`;
    } else if (mesh) {
      statusInfo.textContent = `${mesh.name} (${mode.toUpperCase()} Mode) — ${selectedCount} ${selectedLabel}`;
    } else {
      statusInfo.textContent = 'Ready — Click on any mesh or entity to select';
    }

    // Brush Hero Button & Height Input Sync
    const isBrush = mode === 'brush';
    const heroBtn = this.container.querySelector('#pb-tool-drag-brush');
    if (heroBtn) heroBtn.classList.toggle('active', isBrush);
    const brushHeightInput = this.container.querySelector('#pb-brush-default-height') as HTMLInputElement;
    if (brushHeightInput && !document.activeElement?.isSameNode(brushHeightInput)) {
      brushHeightInput.value = this.editor.brushTool.brushHeight.toFixed(2);
    }

    // Surface Inspector Button Sync
    const isTexActive = !!this.editor.textureTool?.isActive;
    const texBtn = this.container.querySelector('#pb-tool-texture-inspector');
    if (texBtn) texBtn.classList.toggle('active', isTexActive);

    // Clip Tool Button & HUD Sync
    const clipBtn = this.container.querySelector('#pb-tool-clip');
    if (clipBtn) clipBtn.classList.toggle('active', isClip);
    const clipHud = this.container.querySelector('#pb-clip-hud') as HTMLElement;
    if (clipHud) clipHud.style.display = isClip ? 'flex' : 'none';

    // CSG Tool Button & HUD Sync
    const csgBtn = this.container.querySelector('#pb-tool-csg');
    if (csgBtn) csgBtn.classList.toggle('active', isCSG);
    const csgHud = this.container.querySelector('#pb-csg-hud') as HTMLElement;
    if (csgHud) csgHud.style.display = isCSG ? 'flex' : 'none';

    // Grid snap footer
    const coordsInfo = this.container.querySelector('#pb-coords-info')!;
    coordsInfo.textContent = `Snap: ${snapping.enabled ? snapping.translate + 'm' : 'OFF'}`;
  }

  private updateHierarchy(): void {
    if (!this.editor) return;
    const list = this.container.querySelector('#pb-hierarchy-list')!;
    const countBadge = this.container.querySelector('#pb-mesh-count')!;
    const meshCount = this.editor.meshes.length;
    const entityCount = this.editor.entities.length;
    countBadge.textContent = `${meshCount}m • ${entityCount}e`;

    list.innerHTML = '';

    // 1. Render Meshes
    if (this.editor.meshes.length > 0) {
      const header = document.createElement('div');
      header.className = 'pb-hierarchy-group-header';
      header.textContent = 'MESHES / BRUSHES';
      list.appendChild(header);

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
          if (!this.editor) return;
          this.editor.selectionManager.selectMesh(mesh);
          this.editor.gizmoManager.updateGizmoAttachment();
          this.updateUI();
        });
        list.appendChild(item);
      }
    }

    // 2. Render Entities
    if (this.editor.entities.length > 0) {
      const header = document.createElement('div');
      header.className = 'pb-hierarchy-group-header';
      header.textContent = 'ENTITIES';
      list.appendChild(header);

      for (const entity of this.editor.entities) {
        const isSelected = this.editor.selectionManager.selectedEntity === entity;
        const item = document.createElement('div');
        item.className = `pb-hierarchy-item pb-hierarchy-entity ${isSelected ? 'selected' : ''}`;

        let iconSvg = '';
        let badgeText = '';
        if (entity.type === 'player_spawn') {
          iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/></svg>`;
          badgeText = `${entity.properties.yaw ?? 0}°`;
        } else if (entity.type === 'light_point') {
          const col = entity.properties.color || '#ffb366';
          iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-7 7c0 2.5 1.5 4.5 3 6h8c1.5-1.5 3-3.5 3-6a7 7 0 0 0-7-7z"/></svg>`;
          badgeText = `${(entity.properties.intensity ?? 3.5).toFixed(1)}x`;
        } else if (entity.type === 'light_spot') {
          const col = entity.properties.color || '#ffffff';
          iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2"><path d="m15 4-3 3 7 7 3-3z"/><path d="m9 10-6 6v3h3l6-6"/><line x1="14" y1="9" x2="19" y2="14"/></svg>`;
          badgeText = `${entity.properties.angle ?? 45}°`;
        }

        item.innerHTML = `
          ${iconSvg}
          <span class="pb-item-name">${entity.name}</span>
          <span class="pb-item-faces">${badgeText}</span>
        `;
        item.addEventListener('click', () => {
          if (!this.editor) return;
          this.editor.selectionManager.selectEntity(entity);
          this.editor.gizmoManager.updateGizmoAttachment();
          this.updateUI();
        });
        list.appendChild(item);
      }
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

  // --- Make Hollow Modal Logic ---

  private setupHollowModalEvents(): void {
    const modal = this.container.querySelector('#pb-hollow-modal') as HTMLElement;
    const closeBtn = this.container.querySelector('#pb-modal-close')!;
    const cancelBtn = this.container.querySelector('#pb-hollow-cancel')!;
    const confirmBtn = this.container.querySelector('#pb-hollow-confirm')!;
    const thicknessInput = this.container.querySelector('#pb-hollow-thickness') as HTMLInputElement;
    const thicknessHint = this.container.querySelector('#pb-hollow-thickness-display') as HTMLElement;
    const presetChips = this.container.querySelectorAll('.pb-preset-chips .pb-chip');

    const dirInside = this.container.querySelector('#pb-opt-inside') as HTMLElement;
    const dirOutside = this.container.querySelector('#pb-opt-outside') as HTMLElement;
    const dirInsideRadio = dirInside.querySelector('input') as HTMLInputElement;
    const dirOutsideRadio = dirOutside.querySelector('input') as HTMLInputElement;

    const structSlabs = this.container.querySelector('#pb-opt-slabs') as HTMLElement;
    const structCombined = this.container.querySelector('#pb-opt-combined') as HTMLElement;
    const structSlabsRadio = structSlabs.querySelector('input') as HTMLInputElement;
    const structCombinedRadio = structCombined.querySelector('input') as HTMLInputElement;

    // Close actions
    closeBtn.addEventListener('click', () => this.closeHollowModal());
    cancelBtn.addEventListener('click', () => this.closeHollowModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeHollowModal();
    });

    // Thickness input & presets
    const updateThicknessDisplay = () => {
      const val = parseFloat(thicknessInput.value) || 0.25;
      if (thicknessHint) thicknessHint.textContent = `${val.toFixed(2)}m`;
      presetChips.forEach((chip) => {
        const chipVal = parseFloat(chip.getAttribute('data-thickness') || '0');
        chip.classList.toggle('active', Math.abs(chipVal - val) < 0.001);
      });
    };

    thicknessInput.addEventListener('input', updateThicknessDisplay);

    presetChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = chip.getAttribute('data-thickness')!;
        thicknessInput.value = val;
        updateThicknessDisplay();
      });
    });

    // Direction toggles
    dirInside.addEventListener('click', () => {
      dirInsideRadio.checked = true;
      dirInside.classList.add('active');
      dirOutside.classList.remove('active');
    });

    dirOutside.addEventListener('click', () => {
      dirOutsideRadio.checked = true;
      dirOutside.classList.add('active');
      dirInside.classList.remove('active');
    });

    // Structure toggles
    structSlabs.addEventListener('click', () => {
      structSlabsRadio.checked = true;
      structSlabs.classList.add('active');
      structCombined.classList.remove('active');
    });

    structCombined.addEventListener('click', () => {
      structCombinedRadio.checked = true;
      structCombined.classList.add('active');
      structSlabs.classList.remove('active');
    });

    // Execute Hollow confirm
    const executeHollow = () => {
      if (!this.editor) return;
      const rawThickness = Math.max(0.01, parseFloat(thicknessInput.value) || 0.25);
      const isOutside = dirOutsideRadio.checked;
      const finalThickness = isOutside ? -rawThickness : rawThickness;
      const combined = structCombinedRadio.checked;

      this.closeHollowModal();
      this.editor.hollowSelected(finalThickness, combined);
    };

    confirmBtn.addEventListener('click', executeHollow);

    // Escape and Enter keys inside modal
    window.addEventListener('keydown', (e) => {
      if (modal.classList.contains('open')) {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.closeHollowModal();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          executeHollow();
        }
      }
    });
  }

  public openHollowModal(): void {
    if (!this.editor) return;
    const mesh = this.editor.selectionManager.selectedMesh;
    if (!mesh) {
      this.showToast('Select an object to make hollow', 'warn');
      return;
    }

    const modal = this.container.querySelector('#pb-hollow-modal') as HTMLElement;
    const infoBox = this.container.querySelector('#pb-hollow-target-info') as HTMLElement;
    if (!modal || !infoBox) return;

    // Compute bounding dimensions
    const bbox = new THREE.Box3();
    for (const v of mesh.vertices) {
      bbox.expandByPoint(v);
    }
    const width = ((bbox.max.x - bbox.min.x) * mesh.group.scale.x).toFixed(2);
    const height = ((bbox.max.y - bbox.min.y) * mesh.group.scale.y).toFixed(2);
    const depth = ((bbox.max.z - bbox.min.z) * mesh.group.scale.z).toFixed(2);

    infoBox.innerHTML = `Target: <strong>${mesh.name}</strong> &bull; Size: <code>${width}m &times; ${height}m &times; ${depth}m</code>`;

    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('open');
      const thicknessInput = this.container.querySelector('#pb-hollow-thickness') as HTMLInputElement;
      thicknessInput?.focus();
      thicknessInput?.select();
    });
  }

  public closeHollowModal(): void {
    const modal = this.container.querySelector('#pb-hollow-modal') as HTMLElement;
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(() => {
      if (!modal.classList.contains('open')) {
        modal.style.display = 'none';
      }
    }, 200);
  }

  // --- Surface Inspector (Hammer Shift+A) Events ---

  private setupTexturePanelEvents(): void {
    if (this.textureEventsBound) return;
    this.textureEventsBound = true;

    const closeBtn = this.container.querySelector('#pb-tex-close');
    closeBtn?.addEventListener('click', () => this.editor?.textureTool.deactivate());

    // Material Chips
    const texChips = this.container.querySelectorAll('.pb-tex-chip');
    texChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const matId = chip.getAttribute('data-mat');
        if (matId && this.editor) {
          this.editor.textureTool.setMaterial(matId);
        }
      });
    });

    // Shift Nudge buttons
    this.container.querySelector('#pb-shift-x-minus')?.addEventListener('click', () => this.editor?.textureTool.nudgeShift(-0.25, 0));
    this.container.querySelector('#pb-shift-x-plus')?.addEventListener('click', () => this.editor?.textureTool.nudgeShift(0.25, 0));
    this.container.querySelector('#pb-shift-y-minus')?.addEventListener('click', () => this.editor?.textureTool.nudgeShift(0, -0.25));
    this.container.querySelector('#pb-shift-y-plus')?.addEventListener('click', () => this.editor?.textureTool.nudgeShift(0, 0.25));

    // Shift Inputs
    const shiftXInput = this.container.querySelector('#pb-tex-shift-x') as HTMLInputElement | null;
    const shiftYInput = this.container.querySelector('#pb-tex-shift-y') as HTMLInputElement | null;
    const updateShift = () => {
      if (!this.editor || !shiftXInput || !shiftYInput) return;
      const x = parseFloat(shiftXInput.value) || 0;
      const y = parseFloat(shiftYInput.value) || 0;
      this.editor.textureTool.setShift(x, y);
    };
    shiftXInput?.addEventListener('change', updateShift);
    shiftYInput?.addEventListener('change', updateShift);

    // Scale Inputs
    const scaleXInput = this.container.querySelector('#pb-tex-scale-x') as HTMLInputElement | null;
    const scaleYInput = this.container.querySelector('#pb-tex-scale-y') as HTMLInputElement | null;
    const updateScale = () => {
      if (!this.editor || !scaleXInput || !scaleYInput) return;
      const sx = parseFloat(scaleXInput.value) || 1.0;
      const sy = parseFloat(scaleYInput.value) || 1.0;
      this.editor.textureTool.setScale(sx, sy);
    };
    scaleXInput?.addEventListener('change', updateScale);
    scaleYInput?.addEventListener('change', updateScale);

    this.container.querySelector('#pb-tex-flip-x')?.addEventListener('click', () => this.editor?.textureTool.flipScale('x'));
    this.container.querySelector('#pb-tex-flip-y')?.addEventListener('click', () => this.editor?.textureTool.flipScale('y'));

    // Scale Presets
    const scalePresets = this.container.querySelectorAll('.pb-tex-presets [data-scale]');
    scalePresets.forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = parseFloat(chip.getAttribute('data-scale') || '1');
        this.editor?.textureTool.setScale(val, val);
      });
    });

    // Rotation Slider & Input
    const rotRange = this.container.querySelector('#pb-tex-rot-range') as HTMLInputElement | null;
    const rotInput = this.container.querySelector('#pb-tex-rot-input') as HTMLInputElement | null;
    rotRange?.addEventListener('input', () => {
      if (!rotRange || !rotInput) return;
      const deg = parseInt(rotRange.value, 10) || 0;
      rotInput.value = deg.toString();
      this.editor?.textureTool.setRotation(deg);
    });
    rotInput?.addEventListener('change', () => {
      if (!rotRange || !rotInput) return;
      const deg = parseInt(rotInput.value, 10) || 0;
      rotRange.value = deg.toString();
      this.editor?.textureTool.setRotation(deg);
    });

    // Rotation Presets
    const rotPresets = this.container.querySelectorAll('.pb-tex-presets [data-rot]');
    rotPresets.forEach((chip) => {
      chip.addEventListener('click', () => {
        const val = parseInt(chip.getAttribute('data-rot') || '0', 10);
        this.editor?.textureTool.setRotation(val);
      });
    });

    // Alignment Actions
    this.container.querySelector('#pb-tex-btn-fit')?.addEventListener('click', () => this.editor?.textureTool.fitSelectedFaces());
    this.container.querySelector('#pb-tex-btn-planar')?.addEventListener('click', () => this.editor?.textureTool.planarSelectedFaces());
    this.container.querySelector('#pb-tex-btn-reset')?.addEventListener('click', () => this.editor?.textureTool.resetAlignment());

    // Apply Buttons
    this.container.querySelector('#pb-tex-btn-apply-sel')?.addEventListener('click', () => this.editor?.textureTool.applyCurrentSettingsToSelection(true));
    this.container.querySelector('#pb-tex-btn-apply-obj')?.addEventListener('click', () => this.editor?.textureTool.applyToEntireMesh());
  }
}
