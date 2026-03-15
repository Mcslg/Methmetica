# AI Developer Guide: Methmetica Architecture

This document provides a high-density overview of the **Methmetica** codebase to help AI agents and developers understand the project's design and logic quickly.

## 1. Core Architecture
- **Frontend**: React + Vite.
- **Node Engine**: `@xyflow/react` (React Flow).
- **State Management**: `zustand` (see `src/store/useStore.ts`).
- **Math Logic**: `nerdamer` for symbolic math, `mathlive` for math input/UI.

## 2. Node Taxonomy & Design
Nodes are divided into two primary categories defined in `src/index.css` and the store:

### Data Nodes (數據型)
- **Purpose**: Act as value containers/terminals.
- **Examples**: `NumberNode`, `ResultNode`.
- **Visuals**:
    - `NumberNode`: Subtle pink border (`rgba(255, 126, 179, 0.4)`).
- **Interaction**: Handles are fully manageable (add/delete/move).

### Tool Nodes (工具型)
- **Purpose**: Perform computations or operations.
- **Example**: `FunctionNode`.
- **Visuals**: Standard white/transparent border with glassmorphism.
- **Interaction**: 
    - Input handles are often **locked** (managed by formula variables).
    - Contain a manual `EXEC` button for triggering state evaluation.

## 3. The Dynamic Handle System (`DynamicHandles.tsx`)
The project uses a custom handle abstraction instead of static React Flow handles.

### Coordinate System
- Handle positions are **percent-based** (`offset: 0-100`) rather than pixel-based.
- This allows nodes to resize while maintaining relative handle positions.

### Interaction Model
- **Command (Mac) / Ctrl (Win) + Drag**: Moves handles along any edge.
- **Context Menus**:
    - **Side-aware Direct-add**: Right-clicking the Left edge adds an `input`, Right edge adds an `output`. 
    - **Panel Menu**: Right-clicking Top/Bottom edges opens a compact context menu for `trigger` or `modify` types.
- **Locking**: The `locked` prop prevents manual deletion/addition of handles on auto-managed nodes (like `FunctionNode`).

### Internal Synchronization
- Since coordinates change dynamically, we call `useUpdateNodeInternals(nodeId)` inside `DynamicHandles` to force React Flow to recalculate edge connection points.

## 4. State & Execution Logic (`useStore.ts`)
- **`nodes`**: Each node stores its logic in `data` (formula, value, etc.) and its connectivity in `handles`.
- **`executeNode`**: The core logic for `FunctionNode`.
    1. Parses the `formula` using Nerdamer.
    2. Maps `handles` to formula variables.
    3. Evaluates source values from connected edges.
    4. Automatically generates a `ResultNode` if no output is connected (Auto-extrapolation).

## 5. Styling Standards (`index.css`)
- **Glassmorphism**: High use of `backdrop-filter: blur(12px)` and `rgba` backgrounds.
- **Hitbox Design**: Handles use a `::after` pseudo-element with `40x40px` transparent area to ensure high clickability without visual clutter.
- **Variable-based Colors**: `--handle-color` is used to maintain theme consistency across handle types.

## 6. Key Files
- `src/store/useStore.ts`: Global state and math execution.
- `src/nodes/DynamicHandles.tsx`: Complex handle UI and interaction logic.
- `src/nodes/FunctionNode.tsx`: Symbolic math input and variable sensing.
- `src/index.css`: The "Vibe" and styling definitions.
