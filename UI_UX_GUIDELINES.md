# Methmetica UI/UX Design Guidelines

This document outlines the core design philosophy, visual concepts, and interactive mechanics of Methmetica to ensure consistency as the project expands.

## 1. Aesthetic Concept: "Cyber-Math" & "Glassmorphism"
Methmetica embraces a modern, futuristic vibe specifically tailored for heavy cognitive tasks.
- **Dark Theme Default**: Deep, low-contrast dark backgrounds (`#0f0f14`, `#19191e`) minimize eye strain during long sessions of logic crafting.
- **Neon Accents**: Vibrant, high-contrast neon colors are used selectively to draw attention to interactive elements, connections, and states without overwhelming the canvas.
- **Glassmorphism**: Panels, modals, and toolbars utilize semi-transparent backgrounds (`rgba(..., 0.1)`) with subtle borders to maintain visual context with the canvas beneath.

## 2. Color Palette & Semantics
Colors in Methmetica are not just decorative; they are strictly semantic, instantly conveying node types and functions:
- 🔵 **Blue/Cyan (`#4facfe`)**: Calculation, Core Math, Primary Variables.
- 🟢 **Green (`#43e97b`)**: Data Generation (`RangeNode`), Logging (`AppendNode`), Success/Active states.
- 🔴 **Red (`#ff4757`)**: Differentiation, Destructive Actions, Errors.
- 🟣 **Purple (`#6c5ce7`)**: Iteration (`ForEachNode`), Advanced Logic, Flow Control.
- 🟡 **Yellow/Gold (`#ffcc00`, `#b8860b`)**: Execution Triggers (`ButtonNode`), Temporal Events.

## 3. Node Design System
Nodes are the physical building blocks of the logic. They must feel tangible and predictable.
- **Fixed Dimensions**: Nodes that process discrete logic (Calculate, Calculus, ForEach) use fixed `width` and `height`. Content overflow must be handled by custom internal scrollbars (`.custom-scrollbar`), **never** by auto-expanding the node bounds, which causes layout thrashing and snapping gaps.
- **Header & Body Separation**: Every node separates its title/status (Header, slightly darker) from its configuration/content (Body).
- **"Pill" Metaphor for Data**: Numbers, sequences, and manipulatable data are rendered as rounded "Pills" (`border-radius`, monospace font). Sequence pills use dashed borders (`border-style: dashed`) to indicate expansion capability.

## 4. Interaction & Mechanics
Interaction should minimize friction and "wire spaghetti" on the canvas.
- **Magnetic Proximity (Implicit Edges)**: Nodes can be physically snapped together to form implicit connections (e.g., sticking a `ForEach` next to a `Calculate`). 
  - **Directional Flow**: Implicit data/logic always flows from **Left to Right** and **Top to Bottom**. The node on the left (or top) is the "Source/Controller," and the node on the right (or bottom) is the "Target/Receiver." This enforces a standardized visual reading order (Western reading pattern).
  - **Visual Feedback**: Linked/Attached nodes should cast a faint colored glow (`box-shadow: 0 0 15px rgba(...)`) to confirm a successful connection.

## 5. Information Architecture & Density
Balance between seeing the big picture and drilling down into details.
- **Data Compression**: Large data sets (like infinite sequences) should auto-collapse into summaries (e.g., `{ 0 ... 100 (101) }`).
- **Progressive Disclosure**: Detailed lists or complex formulas are hidden by default and expand via explicit user action (e.g., clicking a sequence pill to see vertical items).
- **Clean Canvas**: Output/Result displays are suppressed when intermediate nodes are connected to downstream nodes, keeping the canvas focused purely on the flow.

## 6. Typography
- **UI Elements**: Sans-serif (`system-ui`, `Inter`) for clean, highly legible interface text.
- **Mathematics**: Strict adherence to `KaTeX` rendering for all variables, equations, and mathematical output.
- **Raw Data**: `Monospace` formatting for raw arrays, JSON, and numeric dumps.
