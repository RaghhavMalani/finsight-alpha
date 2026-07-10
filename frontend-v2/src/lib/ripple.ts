// Global amber click ripple on interactive dark surfaces.
let installed = false;

export function installRipple() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener(
    "pointerdown",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // Skip inputs/textareas to avoid interfering with text selection.
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) return;
      // Only ripple on things that "look interactive".
      const el =
        t.closest(
          "button, a, [role='button'], [data-ripple], .interactive, .mono-caps.border, [data-tour], .splitter"
        ) || null;
      if (!el) return;
      const dot = document.createElement("div");
      dot.className = "click-ripple";
      dot.style.left = e.clientX + "px";
      dot.style.top = e.clientY + "px";
      document.body.appendChild(dot);
      setTimeout(() => dot.remove(), 300);
    },
    { passive: true }
  );
}
